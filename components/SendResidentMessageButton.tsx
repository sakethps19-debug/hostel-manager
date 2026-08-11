"use client";

import { useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { sendResidentMessageAction } from "@/app/actions/communications";
import { renderMessageTemplate } from "@/lib/communications/templateVariables";
import {
  canSendTemplateCategory,
  TEMPLATE_CATEGORY_LABELS,
  type TemplateCategory,
} from "@/lib/communications/templateCategories";
import { formatDateTime, formatMoney } from "@/lib/format";

type TemplateRow = {
  template_id: number;
  category: TemplateCategory;
  name: string;
  channel: "whatsapp" | "sms" | "both";
  body: string;
  is_active: boolean;
};

type MessageHistoryRow = {
  message_id: number;
  channel: "whatsapp" | "sms";
  message_body: string;
  recipient_mobile: string;
  status: string;
  failure_reason: string | null;
  created_at: string;
};

function getStatusClasses(status: string) {
  if (status === "sent" || status === "delivered" || status === "read") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "failed") return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-600";
}

export default function SendResidentMessageButton({
  residentId,
  bookingId,
  fullName,
  mobileNumber,
  hostelName,
  roomNumber,
  bedCode,
  monthlyRent,
  outstanding,
  role,
}: {
  residentId: number;
  bookingId: number;
  fullName: string;
  mobileNumber: string | null;
  hostelName: string;
  roomNumber: string;
  bedCode: string | null;
  monthlyRent: number;
  outstanding: number | null;
  role: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [setupMissing, setSetupMissing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [history, setHistory] = useState<MessageHistoryRow[]>([]);

  const [channel, setChannel] = useState<"whatsapp" | "sms">("whatsapp");
  const [templateId, setTemplateId] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);

  const variables: Record<string, string> = {
    resident_name: fullName,
    hostel: hostelName,
    room: roomNumber,
    bed_code: bedCode || "",
    monthly_rent: formatMoney(monthlyRent),
    outstanding: formatMoney(outstanding || 0),
  };

  const availableTemplates = templates.filter(
    (t) =>
      t.is_active &&
      (t.channel === channel || t.channel === "both") &&
      canSendTemplateCategory(role, t.category)
  );

  async function handleOpen() {
    setOpen(true);
    setErrorMessage("");

    if (loaded) return;

    setLoading(true);

    try {
      const [templateRows, historyRows] = await Promise.all([
        callRpcClient<TemplateRow[]>("get_message_templates"),
        callRpcClient<MessageHistoryRow[]>("get_resident_messages", {
          p_resident_id: residentId,
        }),
      ]);
      setTemplates(templateRows);
      setHistory(historyRows);
      setLoaded(true);
    } catch (error) {
      setSetupMissing(true);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load messaging."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleSelectTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((t) => String(t.template_id) === id);
    if (template) {
      setMessageBody(renderMessageTemplate(template.body, variables));
    }
  }

  async function handleSend() {
    if (!mobileNumber) {
      setErrorMessage("This resident has no mobile number on file.");
      return;
    }

    if (!messageBody.trim()) {
      setErrorMessage("Please enter a message.");
      return;
    }

    setErrorMessage("");
    setSending(true);

    try {
      const result = await sendResidentMessageAction({
        residentId,
        bookingId,
        channel,
        templateId: templateId ? Number(templateId) : null,
        messageBody: messageBody.trim(),
        recipientMobile: mobileNumber,
      });

      setHistory((prev) => [
        {
          message_id: result.messageId,
          channel,
          message_body: messageBody.trim(),
          recipient_mobile: mobileNumber,
          status: result.status,
          failure_reason: result.failureReason,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);

      if (result.status === "failed") {
        setErrorMessage(result.failureReason || "Message failed to send.");
      } else {
        setMessageBody("");
        setTemplateId("");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to send message."
      );
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Send Message
      </button>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-indigo-800">Send Message</p>
        <button
          onClick={() => setOpen(false)}
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          Close
        </button>
      </div>

      {loading && <p className="mt-3 text-sm text-slate-500">Loading...</p>}

      {setupMissing && (
        <p className="mt-3 text-sm font-medium text-red-700">
          Messaging isn&apos;t set up yet. ({errorMessage})
        </p>
      )}

      {!loading && !setupMissing && (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-indigo-800">
                Channel
              </span>
              <select
                value={channel}
                onChange={(e) => {
                  setChannel(e.target.value as "whatsapp" | "sms");
                  setTemplateId("");
                }}
                className="w-full rounded-xl border border-indigo-200 px-4 py-2 outline-none"
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-indigo-800">
                Template
              </span>
              <select
                value={templateId}
                onChange={(e) => handleSelectTemplate(e.target.value)}
                className="w-full rounded-xl border border-indigo-200 px-4 py-2 outline-none"
              >
                <option value="">Write a custom message</option>
                {availableTemplates.map((t) => (
                  <option key={t.template_id} value={t.template_id}>
                    {TEMPLATE_CATEGORY_LABELS[t.category]} - {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-3 block">
            <span className="mb-1 block text-sm font-semibold text-indigo-800">
              Message (to {mobileNumber || "no mobile number on file"})
            </span>
            <textarea
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              rows={4}
              placeholder="Type a message or choose a template above"
              className="w-full rounded-xl border border-indigo-200 px-4 py-2 text-sm outline-none"
            />
          </label>

          {errorMessage && (
            <p className="mt-3 text-sm font-medium text-red-700">{errorMessage}</p>
          )}

          <button
            onClick={handleSend}
            disabled={sending}
            className="mt-3 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send"}
          </button>

          {history.length > 0 && (
            <div className="mt-5 border-t border-indigo-200 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                Message History
              </p>
              <div className="mt-2 space-y-2">
                {history.map((m) => (
                  <div
                    key={m.message_id}
                    className="rounded-xl bg-white px-4 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-slate-700">
                        {m.channel === "whatsapp" ? "WhatsApp" : "SMS"}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusClasses(m.status)}`}
                      >
                        {m.status}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-600">{m.message_body}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatDateTime(m.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
