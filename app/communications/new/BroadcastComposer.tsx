"use client";

import { useMemo, useState } from "react";
import type { RecipientCandidate } from "@/lib/communications/recipients";
import { sendBroadcastAction } from "@/app/actions/communications";
import { MAX_BROADCAST_RECIPIENTS } from "@/lib/communications/limits";
import { renderMessageTemplate } from "@/lib/communications/templateVariables";
import {
  canSendTemplateCategory,
  TEMPLATE_CATEGORY_LABELS,
  type TemplateCategory,
} from "@/lib/communications/templateCategories";
import { formatMoney } from "@/lib/format";
import { CHANNEL_LABELS, ENABLED_CHANNELS } from "@/lib/communications/channels";

type TemplateRow = {
  template_id: number;
  category: string;
  name: string;
  channel: "whatsapp" | "sms" | "both";
  body: string;
  is_active: boolean;
};

type QuickFilter =
  | "active"
  | "overdue"
  | "vacatingSoon"
  | "checkinToday"
  | "depositPending"
  | "documentPending";

const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
  { key: "active", label: "All Active / Occupied Residents" },
  { key: "overdue", label: "Rent Overdue Residents" },
  { key: "vacatingSoon", label: "Vacating Soon Residents" },
  { key: "checkinToday", label: "Check-ins Today" },
  { key: "depositPending", label: "Deposit Pending" },
  { key: "documentPending", label: "Document Pending" },
];

function candidateVariables(candidate: RecipientCandidate): Record<string, string> {
  return {
    resident_name: candidate.fullName,
    hostel: candidate.hostelName,
    room: candidate.roomNumber,
    bed_code: candidate.bedCode || "",
    monthly_rent: formatMoney(candidate.monthlyRent),
    outstanding: formatMoney(candidate.outstanding),
  };
}

export default function BroadcastComposer({
  recipients,
  hostelNames,
  templates,
  role,
}: {
  recipients: RecipientCandidate[];
  hostelNames: string[];
  templates: TemplateRow[];
  role: string | null;
}) {
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("active");
  const [hostelFilter, setHostelFilter] = useState("");
  const [floorFilter, setFloorFilter] = useState("");
  const [roomQuery, setRoomQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [channel, setChannel] = useState<"whatsapp" | "sms">(ENABLED_CHANNELS[0]);
  const [templateId, setTemplateId] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<{ sentCount: number; failedCount: number } | null>(
    null
  );

  const floorOptions = useMemo(() => {
    if (!hostelFilter) return [];
    const floors = new Set(
      recipients
        .filter((r) => r.hostelName === hostelFilter && r.floorNumber !== null)
        .map((r) => r.floorNumber as number)
    );
    return Array.from(floors).sort((a, b) => a - b);
  }, [recipients, hostelFilter]);

  const filtered = useMemo(() => {
    return recipients.filter((r) => {
      if (quickFilter === "active" && !r.isActive) return false;
      if (quickFilter === "overdue" && !r.isOverdue) return false;
      if (quickFilter === "vacatingSoon" && !r.isVacatingSoon) return false;
      if (quickFilter === "checkinToday" && !r.isCheckinToday) return false;
      if (quickFilter === "depositPending" && !r.isDepositPending) return false;
      if (quickFilter === "documentPending" && !r.isDocumentPending) return false;
      if (hostelFilter && r.hostelName !== hostelFilter) return false;
      if (floorFilter && String(r.floorNumber) !== floorFilter) return false;
      if (roomQuery && !r.roomNumber.toLowerCase().includes(roomQuery.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [recipients, quickFilter, hostelFilter, floorFilter, roomQuery]);

  const selectedRecipients = useMemo(
    () => recipients.filter((r) => selectedIds.has(r.residentId)),
    [recipients, selectedIds]
  );

  const availableTemplates = templates.filter(
    (t) =>
      t.is_active &&
      (t.channel === channel || t.channel === "both") &&
      canSendTemplateCategory(role, t.category)
  );

  const allShownSelected =
    filtered.length > 0 && filtered.every((r) => selectedIds.has(r.residentId));

  function toggleSelected(residentId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(residentId)) next.delete(residentId);
      else next.add(residentId);
      return next;
    });
  }

  function toggleSelectAllShown() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allShownSelected) {
        for (const r of filtered) next.delete(r.residentId);
      } else {
        for (const r of filtered) next.add(r.residentId);
      }
      return next;
    });
  }

  function handleSelectTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((t) => String(t.template_id) === id);
    if (template) setMessageBody(template.body);
  }

  const previewSample = selectedRecipients[0];
  const previewText = messageBody
    ? previewSample
      ? renderMessageTemplate(messageBody, candidateVariables(previewSample))
      : messageBody
    : "";

  async function handleSend() {
    setErrorMessage("");
    setResult(null);

    const withMobile = selectedRecipients.filter((r) => r.mobileNumber);
    const missingMobileCount = selectedRecipients.length - withMobile.length;

    if (withMobile.length === 0) {
      setErrorMessage("None of the selected residents have a mobile number on file.");
      return;
    }

    if (!messageBody.trim()) {
      setErrorMessage("Please enter a message.");
      return;
    }

    if (withMobile.length > MAX_BROADCAST_RECIPIENTS) {
      setErrorMessage(
        `A single broadcast supports at most ${MAX_BROADCAST_RECIPIENTS} recipients (${withMobile.length} selected) - narrow the filters or send in batches.`
      );
      return;
    }

    const confirmText = missingMobileCount > 0
      ? `You are about to send this message to ${withMobile.length} residents (${missingMobileCount} selected residents have no mobile number and will be skipped). Continue?`
      : `You are about to send this message to ${withMobile.length} residents. Continue?`;

    if (!window.confirm(confirmText)) return;

    setSending(true);

    try {
      const sendResult = await sendBroadcastAction({
        channel,
        templateId: templateId ? Number(templateId) : null,
        targetGroupLabel: QUICK_FILTERS.find((f) => f.key === quickFilter)?.label || "Custom selection",
        templateBody: messageBody,
        recipients: withMobile.map((r) => ({
          residentId: r.residentId,
          bookingId: r.bookingId,
          mobile: r.mobileNumber as string,
          messageBody: renderMessageTemplate(messageBody, candidateVariables(r)),
        })),
      });

      setResult({ sentCount: sendResult.sentCount, failedCount: sendResult.failedCount });
      setSelectedIds(new Set());
      setMessageBody("");
      setTemplateId("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to send broadcast."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="font-semibold text-slate-900">1. Filter Recipients</p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <select
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value as QuickFilter)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
            >
              {QUICK_FILTERS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>

            <select
              value={hostelFilter}
              onChange={(e) => {
                setHostelFilter(e.target.value);
                setFloorFilter("");
              }}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
            >
              <option value="">All Hostels</option>
              {hostelNames.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>

            <select
              value={floorFilter}
              onChange={(e) => setFloorFilter(e.target.value)}
              disabled={!hostelFilter}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none disabled:opacity-50"
            >
              <option value="">All Floors</option>
              {floorOptions.map((f) => (
                <option key={f} value={f}>
                  Floor {f}
                </option>
              ))}
            </select>

            <input
              value={roomQuery}
              onChange={(e) => setRoomQuery(e.target.value)}
              placeholder="Room number contains..."
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
            />
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-slate-500">{filtered.length} matching residents</p>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={allShownSelected}
                onChange={toggleSelectAllShown}
              />
              Select all shown
            </label>
          </div>

          <div className="mt-3 max-h-96 overflow-y-auto rounded-xl border border-slate-200">
            {filtered.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                No residents match these filters.
              </p>
            ) : (
              <table className="min-w-full text-left text-sm">
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((r) => (
                    <tr key={r.residentId} className="hover:bg-slate-50">
                      <td className="w-10 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.residentId)}
                          onChange={() => toggleSelected(r.residentId)}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <p className="font-semibold">{r.fullName}</p>
                        <p className="text-xs text-slate-500">
                          {r.hostelName} · Room {r.roomNumber} ·{" "}
                          {r.mobileNumber || "No mobile on file"}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
          <p className="font-semibold text-indigo-800">2. Compose Message</p>
          <p className="mt-1 text-sm font-semibold text-indigo-700">
            Selected Recipients: {selectedRecipients.length}
          </p>

          <label className="mt-3 block">
            <span className="mb-1 block text-sm font-semibold text-indigo-800">
              Channel
            </span>
            {ENABLED_CHANNELS.length > 1 ? (
              <select
                value={channel}
                onChange={(e) => {
                  setChannel(e.target.value as "whatsapp" | "sms");
                  setTemplateId("");
                }}
                className="w-full rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
              >
                {ENABLED_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {CHANNEL_LABELS[c]}
                  </option>
                ))}
              </select>
            ) : (
              <p className="rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-600">
                {CHANNEL_LABELS[channel]}
              </p>
            )}
          </label>

          <label className="mt-3 block">
            <span className="mb-1 block text-sm font-semibold text-indigo-800">
              Template
            </span>
            <select
              value={templateId}
              onChange={(e) => handleSelectTemplate(e.target.value)}
              className="w-full rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            >
              <option value="">Write a custom message</option>
              {availableTemplates.map((t) => (
                <option key={t.template_id} value={t.template_id}>
                  {TEMPLATE_CATEGORY_LABELS[t.category as TemplateCategory] || t.category} -{" "}
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 block">
            <span className="mb-1 block text-sm font-semibold text-indigo-800">
              Message
            </span>
            <textarea
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              rows={5}
              placeholder="Type a message or choose a template above"
              className="w-full rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />
          </label>

          {previewText && (
            <div className="mt-3 rounded-xl bg-white p-3 text-sm text-slate-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Preview {previewSample ? `(as ${previewSample.fullName} would see it)` : ""}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{previewText}</p>
            </div>
          )}

          {errorMessage && (
            <p className="mt-3 text-sm font-medium text-red-700">{errorMessage}</p>
          )}

          {result && (
            <p className="mt-3 text-sm font-medium text-emerald-700">
              Sent to {result.sentCount} recipients
              {result.failedCount > 0 ? `, ${result.failedCount} failed.` : "."}
            </p>
          )}

          <button
            onClick={handleSend}
            disabled={sending || selectedRecipients.length === 0}
            className="mt-4 w-full rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sending ? "Sending..." : `Send to ${selectedRecipients.length} Residents`}
          </button>
        </div>
      </div>
    </div>
  );
}
