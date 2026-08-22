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
  idempotencyKey?: string;
  overrideLimit?: boolean;
};

export type SendResidentMessageResult = {
  messageId: number;
  status: string;
  failureReason: string | null;
};

type ReserveResidentMessageRow = { message_id: number; is_new: boolean; status: string };

// Server Action so the communication provider (and, once a real provider is
// configured, its API credentials) never runs in client-side code - the
// browser only ever calls this action, never the provider directly.
export async function sendResidentMessageAction(
  input: SendResidentMessageInput
): Promise<SendResidentMessageResult> {
  // Atomically checks category permission + the per-resident monthly volume
  // safeguard and inserts a 'queued' placeholder row, all in one transaction
  // (see reserve_resident_message in 2026081211_communications_functions.sql
  // for why this must be one atomic call rather than a separate check RPC
  // followed by a separate insert RPC). If is_new is false, an earlier
  // attempt already reserved (and possibly already sent) this exact message
  // - e.g. a retry reusing the same idempotency key after a network error -
  // so the provider must NOT be called again.
  const [reserved] = await callRpcServer<ReserveResidentMessageRow[]>("reserve_resident_message", {
    p_resident_id: input.residentId,
    p_booking_id: input.bookingId,
    p_channel: input.channel,
    p_template_id: input.templateId,
    p_message_body: input.messageBody,
    p_recipient_mobile: input.recipientMobile,
    p_override: input.overrideLimit ?? false,
    p_idempotency_key: input.idempotencyKey ?? null,
  });

  if (!reserved.is_new) {
    return {
      messageId: reserved.message_id,
      status: reserved.status,
      failureReason: reserved.status === "failed" ? "Already processed by an earlier attempt." : null,
    };
  }

  const provider = getCommunicationProvider();

  const result = await provider.send({
    channel: input.channel,
    recipientMobile: input.recipientMobile,
    body: input.messageBody,
  });

  await callRpcServer("finalize_resident_message", {
    p_message_id: reserved.message_id,
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
    messageId: reserved.message_id,
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
  idempotencyKey?: string;
  overrideLimit?: boolean;
};

export type SendBroadcastResult = {
  broadcastId: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
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

  // Idempotent: a resubmitted "Send" click carrying the same key (double
  // click, browser retry) reuses this exact broadcast row rather than
  // creating a second one - see create_message_broadcast in
  // 2026081211_communications_functions.sql.
  const broadcastId = await callRpcServer<number>("create_message_broadcast", {
    p_channel: input.channel,
    p_template_id: input.templateId,
    p_message_body: input.templateBody,
    p_target_group_label: input.targetGroupLabel,
    p_recipient_count: input.recipients.length,
    p_idempotency_key: input.idempotencyKey ?? null,
  });

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const recipient of input.recipients) {
    // Atomically reserves this recipient's row (permission + monthly-limit
    // check, in the same transaction as the insert) BEFORE the provider is
    // ever called for them - see reserve_broadcast_message. is_new = false
    // covers two cases, both of which must skip the provider call: this
    // recipient was already reserved by an earlier attempt at this same
    // broadcast (resumed after a partial failure/timeout, or a resubmitted
    // "Send" click), or the reservation itself failed the category/limit
    // check and was recorded as 'cancelled' directly.
    const [reserved] = await callRpcServer<{ message_id: number; is_new: boolean }[]>(
      "reserve_broadcast_message",
      {
        p_broadcast_id: broadcastId,
        p_resident_id: recipient.residentId,
        p_booking_id: recipient.bookingId,
        p_channel: input.channel,
        p_template_id: input.templateId,
        p_message_body: recipient.messageBody,
        p_recipient_mobile: recipient.mobile,
        p_override: input.overrideLimit ?? false,
      }
    );

    if (!reserved.is_new) {
      skippedCount += 1;
      continue;
    }

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
    p_failed_count: failedCount + skippedCount,
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
      skipped_count: skippedCount,
    },
  }).catch(() => {});

  return { broadcastId, sentCount, failedCount, skippedCount };
}
