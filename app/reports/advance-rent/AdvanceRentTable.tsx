"use client";

import { useMemo, useState } from "react";
import { downloadCsv } from "@/lib/csv";
import { formatMoney } from "@/lib/format";

type LedgerRow = {
  booking_id: number;
  resident_id: number;
  full_name: string;
  mobile_number: string | null;
  hostel_name: string;
  room_number: string;
  bed_code: string | null;
  bed_number: string;
  monthly_rent: number;
  amount_due: number;
  amount_paid: number;
  balance_outstanding: number;
};

export default function AdvanceRentTable({ rows }: { rows: LedgerRow[] }) {
  const [hostelFilter, setHostelFilter] = useState("");

  const hostelOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.hostel_name))).sort(),
    [rows]
  );

  const filtered = useMemo(
    () => rows.filter((r) => !hostelFilter || r.hostel_name === hostelFilter),
    [rows, hostelFilter]
  );

  const totalAdvance = filtered.reduce(
    (sum, r) => sum + Math.abs(r.balance_outstanding),
    0
  );

  function handleExport() {
    downloadCsv(
      `advance-rent-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        full_name: r.full_name,
        mobile_number: r.mobile_number || "",
        hostel_name: r.hostel_name,
        room_number: r.room_number,
        bed_code: r.bed_code || r.bed_number,
        monthly_rent: r.monthly_rent,
        advance_amount: Math.abs(r.balance_outstanding),
      }))
    );
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={hostelFilter}
          onChange={(e) => setHostelFilter(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500"
        >
          <option value="">All Hostels</option>
          {hostelOptions.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>

        <p className="text-sm font-semibold text-slate-600">
          Total Advance: {formatMoney(totalAdvance)}
        </p>

        <button
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="ml-auto rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-500">
            No residents currently have an advance balance.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Resident</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3 text-right">Monthly Rent</th>
                  <th className="px-4 py-3 text-right">Advance Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.booking_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{r.full_name}</p>
                      <p className="text-xs text-slate-500">
                        {r.mobile_number || "No mobile number"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {r.hostel_name} · Room {r.room_number} ·{" "}
                      {r.bed_code || r.bed_number}
                    </td>
                    <td className="px-4 py-3 text-right">{formatMoney(r.monthly_rent)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                      {formatMoney(Math.abs(r.balance_outstanding))}
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
