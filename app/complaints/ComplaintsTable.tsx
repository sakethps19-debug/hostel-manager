"use client";

import { useMemo, useState } from "react";
import { logAuditEvent } from "@/lib/audit";
import { callRpcClient } from "@/lib/supabase/callRpcClient";

type ComplaintRow = {
  complaint_id: number;
  resident_id: number | null;
  full_name: string | null;
  hostel_name: string | null;
  room_number: string | null;
  bed_code: string | null;
  category: string;
  description: string;
  priority: string;
  status: string;
  resolution: string | null;
  created_at: string;
  closed_at: string | null;
};

type EscalationRow = {
  escalation_id: number;
  complaint_id: number;
  escalated_to: string;
  reason: string;
  escalated_by_name: string | null;
  escalated_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
};

const STATUSES = ["Open", "In Progress", "Resolved", "Closed"];
const ESCALATE_TO_OPTIONS = ["Owner", "Operations Manager", "Finance Manager"];

function statusClasses(status: string) {
  if (status === "Open") return "bg-red-50 text-red-700";
  if (status === "In Progress") return "bg-amber-50 text-amber-700";
  if (status === "Resolved") return "bg-blue-50 text-blue-700";
  if (status === "Closed") return "bg-slate-100 text-slate-500";
  return "bg-slate-100 text-slate-500";
}

function priorityClasses(priority: string) {
  if (priority === "Urgent") return "bg-red-100 text-red-800";
  if (priority === "High") return "bg-amber-100 text-amber-800";
  if (priority === "Medium") return "bg-blue-100 text-blue-800";
  return "bg-slate-100 text-slate-600";
}

function formatDate(date: string | null) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function ComplaintsTable({
  complaints,
  escalations,
}: {
  complaints: ComplaintRow[];
  escalations: EscalationRow[];
}) {
  const [rows, setRows] = useState(complaints);
  const [escalationRows, setEscalationRows] = useState(escalations);
  const [statusFilter, setStatusFilter] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [resolutionDraft, setResolutionDraft] = useState<
    Record<number, string>
  >({});
  const [escalatingId, setEscalatingId] = useState<number | null>(null);
  const [escalateTo, setEscalateTo] = useState(ESCALATE_TO_OPTIONS[0]);
  const [escalateReason, setEscalateReason] = useState("");
  const [escalateSaving, setEscalateSaving] = useState(false);
  const [resolvingEscalationId, setResolvingEscalationId] = useState<
    number | null
  >(null);
  const [errorMessage, setErrorMessage] = useState("");

  const filtered = useMemo(() => {
    return rows.filter((row) => !statusFilter || row.status === statusFilter);
  }, [rows, statusFilter]);

  const activeEscalationByComplaint = useMemo(() => {
    const map = new Map<number, EscalationRow>();
    for (const esc of escalationRows) {
      if (!esc.resolved_at) map.set(esc.complaint_id, esc);
    }
    return map;
  }, [escalationRows]);

  async function handleEscalate(complaintId: number) {
    if (!escalateReason.trim()) {
      setErrorMessage("Please enter a reason for escalation.");
      return;
    }

    setErrorMessage("");
    setEscalateSaving(true);

    try {
      const id = await callRpcClient<number>("escalate_complaint", {
        p_complaint_id: complaintId,
        p_escalated_to: escalateTo,
        p_reason: escalateReason.trim(),
      });

      await logAuditEvent("complaint_escalated", "complaint", complaintId, {
        escalated_to: escalateTo,
      });

      setEscalationRows((prev) => [
        {
          escalation_id: id,
          complaint_id: complaintId,
          escalated_to: escalateTo,
          reason: escalateReason.trim(),
          escalated_by_name: null,
          escalated_at: new Date().toISOString(),
          resolved_at: null,
          resolution_notes: null,
        },
        ...prev,
      ]);

      setEscalatingId(null);
      setEscalateReason("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to escalate complaint."
      );
    } finally {
      setEscalateSaving(false);
    }
  }

  async function handleResolveEscalation(escalationId: number) {
    if (resolvingEscalationId === escalationId) return;

    setErrorMessage("");
    setResolvingEscalationId(escalationId);

    try {
      await callRpcClient("resolve_complaint_escalation", {
        p_escalation_id: escalationId,
        p_resolution_notes: null,
      });

      await logAuditEvent("complaint_escalation_resolved", "complaint_escalation", escalationId, {});

      setEscalationRows((prev) =>
        prev.map((esc) =>
          esc.escalation_id === escalationId
            ? { ...esc, resolved_at: new Date().toISOString() }
            : esc
        )
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to resolve escalation."
      );
    } finally {
      setResolvingEscalationId(null);
    }
  }

  async function updateStatus(
    complaintId: number,
    status: string,
    resolution?: string
  ) {
    setErrorMessage("");
    setSavingId(complaintId);

    try {
      await callRpcClient("update_complaint_status", {
        p_complaint_id: complaintId,
        p_status: status,
        p_resolution: resolution || null,
      });

      await logAuditEvent("complaint_status_changed", "complaint", complaintId, {
        status,
      });

      setRows((prev) =>
        prev.map((row) =>
          row.complaint_id === complaintId
            ? {
                ...row,
                status,
                resolution: resolution || row.resolution,
                closed_at:
                  status === "Closed" || status === "Resolved"
                    ? new Date().toISOString()
                    : row.closed_at,
              }
            : row
        )
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update status."
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {errorMessage && (
        <p className="mt-3 text-sm font-medium text-red-600">{errorMessage}</p>
      )}

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-slate-500 shadow-sm">
          No complaints match.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {filtered.map((row) => {
            const activeEscalation = activeEscalationByComplaint.get(
              row.complaint_id
            );

            return (
            <div
              key={row.complaint_id}
              className={`rounded-2xl border bg-white p-5 shadow-sm ${
                activeEscalation ? "border-red-300" : "border-slate-200"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityClasses(row.priority)}`}
                    >
                      {row.priority}
                    </span>
                    <span className="text-sm font-semibold text-slate-700">
                      {row.category}
                    </span>
                    {activeEscalation && (
                      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                        Escalated to {activeEscalation.escalated_to}
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-sm text-slate-500">
                    {row.full_name
                      ? `${row.full_name} · `
                      : ""}
                    {row.hostel_name || "General"}
                    {row.room_number ? ` · Room ${row.room_number}` : ""}
                    {row.bed_code ? ` · ${row.bed_code}` : ""}
                  </p>

                  <p className="mt-2 text-sm text-slate-700">
                    {row.description}
                  </p>

                  <p className="mt-2 text-xs text-slate-400">
                    Reported {formatDate(row.created_at)}
                    {row.closed_at ? ` · Closed ${formatDate(row.closed_at)}` : ""}
                  </p>

                  {row.resolution && (
                    <p className="mt-2 text-sm text-emerald-700">
                      Resolution: {row.resolution}
                    </p>
                  )}

                  {activeEscalation && (
                    <p className="mt-2 text-sm text-red-700">
                      Escalation reason: {activeEscalation.reason}
                    </p>
                  )}
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses(row.status)}`}
                >
                  {row.status}
                </span>
              </div>

              {row.status !== "Closed" && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                  {row.status === "Open" && (
                    <button
                      onClick={() => updateStatus(row.complaint_id, "In Progress")}
                      disabled={savingId === row.complaint_id}
                      className="rounded-xl border border-amber-200 bg-white px-4 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                    >
                      Mark In Progress
                    </button>
                  )}

                  <input
                    value={resolutionDraft[row.complaint_id] || ""}
                    onChange={(e) =>
                      setResolutionDraft((prev) => ({
                        ...prev,
                        [row.complaint_id]: e.target.value,
                      }))
                    }
                    placeholder="Resolution notes..."
                    className="min-w-[200px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none"
                  />

                  <button
                    onClick={() =>
                      updateStatus(
                        row.complaint_id,
                        "Resolved",
                        resolutionDraft[row.complaint_id]
                      )
                    }
                    disabled={savingId === row.complaint_id}
                    className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    Mark Resolved
                  </button>

                  <button
                    onClick={() =>
                      updateStatus(
                        row.complaint_id,
                        "Closed",
                        resolutionDraft[row.complaint_id]
                      )
                    }
                    disabled={savingId === row.complaint_id}
                    className="rounded-xl bg-slate-700 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Close
                  </button>

                  {!activeEscalation && (
                    <button
                      onClick={() => {
                        const opening = escalatingId !== row.complaint_id;
                        setEscalatingId(opening ? row.complaint_id : null);
                        setEscalateTo(ESCALATE_TO_OPTIONS[0]);
                        setEscalateReason("");
                        setErrorMessage("");
                      }}
                      className="rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      {escalatingId === row.complaint_id ? "Cancel" : "Escalate"}
                    </button>
                  )}
                </div>
              )}

              {activeEscalation && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                  <button
                    onClick={() =>
                      handleResolveEscalation(activeEscalation.escalation_id)
                    }
                    disabled={resolvingEscalationId === activeEscalation.escalation_id}
                    className="rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {resolvingEscalationId === activeEscalation.escalation_id
                      ? "Resolving..."
                      : "Mark Escalation Resolved"}
                  </button>
                </div>
              )}

              {escalatingId === row.complaint_id && !activeEscalation && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                  <select
                    value={escalateTo}
                    onChange={(e) => setEscalateTo(e.target.value)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none"
                  >
                    {ESCALATE_TO_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>

                  <input
                    value={escalateReason}
                    onChange={(e) => setEscalateReason(e.target.value)}
                    placeholder="Reason for escalation..."
                    className="min-w-[200px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none"
                  />

                  <button
                    onClick={() => handleEscalate(row.complaint_id)}
                    disabled={escalateSaving}
                    className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {escalateSaving ? "Escalating..." : "Confirm Escalation"}
                  </button>
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
