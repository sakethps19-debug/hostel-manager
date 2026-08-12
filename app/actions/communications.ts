"use server";

import { callRpcServer } from "@/lib/supabase/callRpcServer";
import {
  getCommunicationProvider,
  type CommunicationChannel,
} from "@/lib/communications/provider";
import { MAX_BROADCAST_RECIPIENTS } from "@/lib/communications/limits";

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
    p_details: {
      channel: input.channel,
      status: result.status,
      template_id: input.templateId,
    },
  }).catch(() => {});

  return {
    messageId,
    status: result.status,
    failureReason: result.status === "failed" ? result.failureReason : null,
  };
}

export type BroadcastRecipientInput = {
  residentId: number;
  bookingId: number | null;
  mobile: string;
  messageBody: string;
};

export type SendBroadcastInput = {
  channel: CommunicationChannel;
  templateId: number | null;
  targetGroupLabel: string;
  templateBody: string;
  recipients: BroadcastRecipientInput[];
};

export type SendBroadcastResult = {
  broadcastId: number;
  sentCount: number;
  failedCount: number;
};

export async function sendBroadcastAction(
  input: SendBroadcastInput
): Promise<SendBroadcastResult> {
  if (input.recipients.length === 0) {
    throw new Error("No recipients selected.");
  }

  if (input.recipients.length > MAX_BROADCAST_RECIPIENTS) {
    throw new Error(
      `A single broadcast supports at most ${MAX_BROADCAST_RECIPIENTS} recipients - please split this into smaller broadcasts.`
    );
  }

  const provider = getCommunicationProvider();

  const broadcastId = await callRpcServer<number>("create_message_broadcast", {
    p_channel: input.channel,
    p_template_id: input.templateId,
    p_message_body: input.templateBody,
    p_target_group_label: input.targetGroupLabel,
    p_recipient_count: input.recipients.length,
  });

  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of input.recipients) {
    const result = await provider.send({
      channel: input.channel,
      recipientMobile: recipient.mobile,
      body: recipient.messageBody,
    });

    await callRpcServer("log_broadcast_message", {
      p_broadcast_id: broadcastId,
      p_resident_id: recipient.residentId,
      p_booking_id: recipient.bookingId,
      p_channel: input.channel,
      p_template_id: input.templateId,
      p_message_body: recipient.messageBody,
      p_recipient_mobile: recipient.mobile,
      p_status: result.status,
      p_provider: result.provider,
      p_provider_message_id: result.status === "sent" ? result.providerMessageId : null,
      p_failure_reason: result.status === "failed" ? result.failureReason : null,
    });

    if (result.status === "sent") {
      sentCount += 1;
    } else {
      failedCount += 1;
    }
  }

  await callRpcServer("update_broadcast_counts", {
    p_broadcast_id: broadcastId,
    p_sent_count: sentCount,
    p_delivered_count: 0,
    p_failed_count: failedCount,
    p_status: "completed",
  });

  await callRpcServer("log_audit_event", {
    p_action: "broadcast_sent",
    p_entity_type: "message_broadcast",
    p_entity_id: broadcastId,
    p_details: {
      channel: input.channel,
      recipient_count: input.recipients.length,
      sent_count: sentCount,
      failed_count: failedCount,
    },
  }).catch(() => {});

  return { broadcastId, sentCount, failedCount };
}
