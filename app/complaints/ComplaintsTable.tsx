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

const STATUSES = ["Open", "In Progress", "Resolved", "Closed"];

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
}: {
  complaints: ComplaintRow[];
}) {
  const [rows, setRows] = useState(complaints);
  const [statusFilter, setStatusFilter] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [resolutionDraft, setResolutionDraft] = useState<
    Record<number, string>
  >({});
  const [errorMessage, setErrorMessage] = useState("");

  const filtered = useMemo(() => {
    return rows.filter((row) => !statusFilter || row.status === statusFilter);
  }, [rows, statusFilter]);

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
          {filtered.map((row) => (
            <div
              key={row.complaint_id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
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
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
