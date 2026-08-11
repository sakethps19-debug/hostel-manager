"use server";

import { callRpcServer } from "@/lib/supabase/callRpcServer";
import {
  getCommunicationProvider,
  type CommunicationChannel,
} from "@/lib/communications/provider";

export type SendResidentMessageInput = {
  residentId: number;
  bookingId: number | null;
  channel: CommunicationChannel;
  templateId: number | null;
  messageBody: string;
  recipientMobile: string;
};

export type SendResidentMessageResult = {
  messageId: number;
  status: string;
  failureReason: string | null;
};

// Server Action so the communication provider (and, once a real provider is
// configured, its API credentials) never runs in client-side code - the
// browser only ever calls this action, never the provider directly.
export async function sendResidentMessageAction(
  input: SendResidentMessageInput
): Promise<SendResidentMessageResult> {
  const provider = getCommunicationProvider();

  const result = await provider.send({
    channel: input.channel,
    recipientMobile: input.recipientMobile,
    body: input.messageBody,
  });

  const messageId = await callRpcServer<number>("log_resident_message", {
    p_resident_id: input.residentId,
    p_booking_id: input.bookingId,
    p_channel: input.channel,
    p_template_id: input.templateId,
    p_message_body: input.messageBody,
    p_recipient_mobile: input.recipientMobile,
    p_status: result.status,
    p_provider: result.provider,
    p_provider_message_id: result.status === "sent" ? result.providerMessageId : null,
    p_failure_reason: result.status === "failed" ? result.failureReason : null,
  });

  await callRpcServer("log_audit_event", {
    p_action: "resident_message_sent",
    p_entity_type: "resident",
    p_entity_id: input.residentId,
    p_details: { channel: input.channel, status: result.status },
  }).catch(() => {});

  return {
    messageId,
    status: result.status,
    failureReason: result.status === "failed" ? result.failureReason : null,
  };
}
