"use client";

import { useMemo, useState } from "react";
import { logAuditEvent } from "@/lib/audit";
import { callRpcClient } from "@/lib/supabase/callRpcClient";

type EnquiryRow = {
  enquiry_id: number;
  full_name: string;
  mobile_number: string;
  preferred_hostel: string | null;
  preferred_sharing: number | null;
  budget: number | null;
  expected_joining_date: string | null;
  source: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

const STATUSES = [
  "New",
  "Contacted",
  "Follow-up",
  "Visit Scheduled",
  "Converted",
  "Lost",
];

function statusClasses(status: string) {
  if (status === "New") return "bg-blue-50 text-blue-700";
  if (status === "Contacted") return "bg-indigo-50 text-indigo-700";
  if (status === "Follow-up") return "bg-amber-50 text-amber-700";
  if (status === "Visit Scheduled") return "bg-purple-50 text-purple-700";
  if (status === "Converted") return "bg-emerald-50 text-emerald-700";
  if (status === "Lost") return "bg-slate-100 text-slate-500";
  return "bg-slate-100 text-slate-500";
}

function formatDate(date: string | null) {
  if (!date) return "-";
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(value: number | null) {
  if (!value) return "-";
  return `Rs. ${Number(value).toLocaleString("en-IN")}`;
}

export default function EnquiriesTable({
  enquiries,
}: {
  enquiries: EnquiryRow[];
}) {
  const [rows, setRows] = useState(enquiries);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSearch =
        !term ||
        row.full_name.toLowerCase().includes(term) ||
        row.mobile_number.includes(term);

      const matchesStatus = !statusFilter || row.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  async function updateStatus(enquiryId: number, status: string) {
    setErrorMessage("");
    setSavingId(enquiryId);

    try {
      await callRpcClient("update_enquiry_status", {
        p_enquiry_id: enquiryId,
        p_status: status,
      });

      await logAuditEvent("enquiry_status_changed", "enquiry", enquiryId, {
        status,
      });

      setRows((prev) =>
        prev.map((row) =>
          row.enquiry_id === enquiryId ? { ...row, status } : row
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
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or mobile..."
          className="min-w-[220px] flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />

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
          No enquiries match.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Mobile</th>
                <th className="px-4 py-3">Preferred</th>
                <th className="px-4 py-3">Budget</th>
                <th className="px-4 py-3">Expected Joining</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((row) => (
                <tr key={row.enquiry_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold">{row.full_name}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {row.mobile_number}
                  </td>
                  <td className="px-4 py-3">
                    {row.preferred_hostel || "-"}
                    {row.preferred_sharing
                      ? ` · ${row.preferred_sharing} Sharing`
                      : ""}
                  </td>
                  <td className="px-4 py-3">{formatMoney(row.budget)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDate(row.expected_joining_date)}
                  </td>
                  <td className="px-4 py-3">{row.source || "-"}</td>
                  <td className="px-4 py-3">
                    <select
                      value={row.status}
                      disabled={savingId === row.enquiry_id}
                      onChange={(e) =>
                        updateStatus(row.enquiry_id, e.target.value)
                      }
                      className={`rounded-full border-0 px-3 py-1 text-xs font-semibold outline-none ${statusClasses(row.status)}`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.status !== "Converted" && row.status !== "Lost" && (
                      <a
                        href={`/find-bed?enquiryId=${row.enquiry_id}&name=${encodeURIComponent(row.full_name)}&mobile=${row.mobile_number}${row.preferred_hostel ? `&hostel=${encodeURIComponent(row.preferred_hostel)}` : ""}${row.preferred_sharing ? `&sharing=${row.preferred_sharing}` : ""}`}
                        className="font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        Convert →
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
