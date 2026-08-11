"use client";

import { useMemo, useState } from "react";

type DepositRow = {
  booking_id: number;
  resident_id: number;
  full_name: string;
  hostel_name: string;
  room_number: string;
  bed_number: string;
  bed_code: string | null;
  booking_status: string;
  deposit_agreed: number;
  deposit_received: number;
  deposit_refunded: number;
  deposit_balance: number;
  deposit_status: string;
};

function formatMoney(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function statusClasses(status: string) {
  if (status === "Fully Refunded") return "bg-slate-100 text-slate-500";
  if (status === "Pending") return "bg-amber-50 text-amber-700";
  if (status === "Partially Refunded") return "bg-blue-50 text-blue-700";
  return "bg-emerald-50 text-emerald-700";
}

export default function DepositReconciliationTable({
  rows,
}: {
  rows: DepositRow[];
}) {
  const [statusFilter, setStatusFilter] = useState("");
  const [mismatchOnly, setMismatchOnly] = useState(false);

  const statusOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.deposit_status))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const matchesStatus = !statusFilter || r.deposit_status === statusFilter;
      const matchesMismatch =
        !mismatchOnly || r.deposit_agreed !== r.deposit_received;
      return matchesStatus && matchesMismatch;
    });
  }, [rows, statusFilter, mismatchOnly]);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500"
        >
          <option value="">All Statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={mismatchOnly}
            onChange={(e) => setMismatchOnly(e.target.checked)}
          />
          Agreed ≠ Received only
        </label>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-500">
            No bookings match.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Resident</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3 text-right">Agreed</th>
                  <th className="px-4 py-3 text-right">Received</th>
                  <th className="px-4 py-3 text-right">Refunded</th>
                  <th className="px-4 py-3 text-right">Held</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.booking_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <a
                        href={`/history/${r.booking_id}`}
                        className="font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        {r.full_name}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {r.hostel_name} · Room {r.room_number} ·{" "}
                      {r.bed_code || r.bed_number}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(r.deposit_agreed)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(r.deposit_received)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(r.deposit_refunded)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatMoney(r.deposit_balance)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses(r.deposit_status)}`}
                      >
                        {r.deposit_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
