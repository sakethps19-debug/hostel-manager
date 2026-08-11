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
    // eslint-disable-next-line no-console
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

export function getCommunicationProvider(): CommunicationProvider {
  return new MockCommunicationProvider();
}
