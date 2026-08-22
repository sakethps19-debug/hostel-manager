import { toE164India } from "./phone";

export type CommunicationChannel = "whatsapp" | "sms";

export type SendMessageInput = {
  channel: CommunicationChannel;
  recipientMobile: string;
  body: string;
};

export type SendMessageResult =
  | { status: "sent"; provider: string; providerMessageId: string }
  | { status: "failed"; provider: string; failureReason: string };

export interface CommunicationProvider {
  name: string;
  send(input: SendMessageInput): Promise<SendMessageResult>;
}

// No real WhatsApp/SMS provider is configured yet - every send goes through
// this mock provider, which never makes a network call. It logs what would
// have been sent and always reports success, so the rest of the
// Communications module (templates, broadcasts, history) can be built and
// tested end-to-end before a real provider decision/credentials exist.
class MockCommunicationProvider implements CommunicationProvider {
  name = "mock";

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    console.log(
      `[mock communications] Would send ${input.channel} to ${input.recipientMobile}: ${input.body}`
    );

    return {
      status: "sent",
      provider: this.name,
      providerMessageId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }
}

// Direct integration with the Meta WhatsApp Cloud API (no middleware/BSP
// subscription) - see the completion report for why this was chosen over
// Twilio/Gupshup/etc. Credentials are read from server-only env vars and
// never touch client code (this file is only ever imported from Server
// Actions - app/actions/communications.ts - never from a "use client" file).
//
// IMPORTANT PRODUCTION LIMITATION: this sends a free-text ("text" type)
// message, which Meta only allows within an active 24-hour customer-service
// window (i.e. the resident messaged the hostel's WhatsApp number in the
// last 24h) or for a message the resident's client already has an open
// session for. Any message sent OUTSIDE that window - which covers most
// proactive rent reminders/broadcasts - must instead use a Meta-approved
// message TEMPLATE (see message_templates.provider_template_id/
// provider_template_status). Wiring the template-message API call (message
// type "template" with named components) is intentionally left as a
// follow-up: it can't be meaningfully implemented or tested until actual
// templates have been submitted to and approved by Meta, which requires the
// Owner's own Meta Business Manager account - see the completion report.
class MetaWhatsAppProvider implements CommunicationProvider {
  name = "meta_whatsapp";

  constructor(
    private readonly accessToken: string,
    private readonly phoneNumberId: string
  ) {}

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    const to = toE164India(input.recipientMobile);
    if (!to) {
      return {
        status: "failed",
        provider: this.name,
        failureReason: `"${input.recipientMobile}" is not a recognizable Indian mobile number`,
      };
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body: input.body },
          }),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        return {
          status: "failed",
          provider: this.name,
          failureReason:
            data?.error?.message || `WhatsApp API error (HTTP ${response.status})`,
        };
      }

      const providerMessageId = data?.messages?.[0]?.id;
      if (!providerMessageId) {
        return {
          status: "failed",
          provider: this.name,
          failureReason: "WhatsApp API accepted the request but returned no message id",
        };
      }

      return { status: "sent", provider: this.name, providerMessageId };
    } catch (error) {
      return {
        status: "failed",
        provider: this.name,
        failureReason:
          error instanceof Error ? error.message : "Network error calling the WhatsApp API",
      };
    }
  }
}

// No SMS provider has been selected/approved yet - per the brief, this
// requires Owner pricing approval before any paid provider is enabled
// (Indian SMS also needs DLT registration, which takes real-world setup
// time). This class exists so the channel is fully wired end-to-end at the
// architecture level and returns a clear, honest failure rather than either
// silently succeeding or throwing an unhandled error if SMS is ever
// force-enabled before a provider is chosen.
class UnconfiguredSmsProvider implements CommunicationProvider {
  name = "sms_unconfigured";

  async send(): Promise<SendMessageResult> {
    return {
      status: "failed",
      provider: this.name,
      failureReason:
        "No SMS provider is configured. An Indian DLT-registered provider must be selected and its pricing approved before SMS can be enabled - see the completion report.",
    };
  }
}

class LiveCommunicationProvider implements CommunicationProvider {
  name = "live";

  constructor(
    private readonly whatsapp: CommunicationProvider,
    private readonly sms: CommunicationProvider
  ) {}

  send(input: SendMessageInput): Promise<SendMessageResult> {
    return (input.channel === "whatsapp" ? this.whatsapp : this.sms).send(input);
  }
}

// Defaults to TRUE (safe) unless a specific deployment explicitly opts out.
// This means test mode is on with zero configuration, and going live
// requires a deliberate COMMS_TEST_MODE=false set on that one Vercel
// environment's env vars (Production only - never Preview/development), not
// a code change. See Part H / Part J of the production-readiness brief.
export function isCommsTestMode(): boolean {
  return process.env.COMMS_TEST_MODE !== "false";
}

export function getCommunicationProvider(): CommunicationProvider {
  if (isCommsTestMode()) {
    return new MockCommunicationProvider();
  }

  const accessToken = process.env.WHATSAPP_META_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_META_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    // Deliberately throws instead of silently falling back to the mock -
    // an Owner who has turned test mode off believes real messages are
    // being sent; silently mocking instead would hide that nothing is
    // actually going out.
    throw new Error(
      "COMMS_TEST_MODE is false but WHATSAPP_META_ACCESS_TOKEN / WHATSAPP_META_PHONE_NUMBER_ID are not set. Configure both env vars, or leave COMMS_TEST_MODE unset/true."
    );
  }

  return new LiveCommunicationProvider(
    new MetaWhatsAppProvider(accessToken, phoneNumberId),
    new UnconfiguredSmsProvider()
  );
}
