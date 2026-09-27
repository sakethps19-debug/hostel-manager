"use client";

import { useMemo, useState } from "react";
import { slugifyHostelName } from "@/lib/hostelSlug";
import { downloadCsv } from "@/lib/csv";

type LedgerRow = {
  booking_id: number;
  resident_id: number;
  full_name: string;
  mobile_number: string | null;
  hostel_name: string;
  room_number: string;
  bed_id: number;
  bed_code: string | null;
  monthly_rent: number;
  balance_outstanding: number;
  payment_status: string;
  start_date: string;
};

function formatMoney(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

/**
 * Days since the most recent rent-due date (the joining-date
 * anniversary of the booking's start date) that has already passed.
 * This is the confirmed business rule for when rent is due.
 */
// Builds year/month/day, clamping day to the last day of that month so a
// startDay of 29-31 lands on the month's actual last day (e.g. Feb 28)
// instead of silently rolling over into the next month via Date's overflow.
function clampedMonthDate(year: number, month: number, day: number): Date {
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDayOfMonth));
}

function daysOverdue(startDate: string): number {
  const startDay = new Date(`${startDate}T00:00:00`).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let dueDate = clampedMonthDate(today.getFullYear(), today.getMonth(), startDay);
  if (dueDate > today) {
    dueDate = clampedMonthDate(today.getFullYear(), today.getMonth() - 1, startDay);
  }

  return Math.max(0, Math.round((today.getTime() - dueDate.getTime()) / 86400000));
}

const BUCKETS = [
  { key: "0-30", label: "0-30 Days", min: 0, max: 30 },
  { key: "31-60", label: "31-60 Days", min: 31, max: 60 },
  { key: "61-90", label: "61-90 Days", min: 61, max: 90 },
  { key: "90+", label: "90+ Days", min: 91, max: Infinity },
] as const;

function bucketFor(days: number) {
  return BUCKETS.find((b) => days >= b.min && days <= b.max) || BUCKETS[BUCKETS.length - 1];
}

export default function RentAgeingView({ ledger }: { ledger: LedgerRow[] }) {
  const [selectedHostel, setSelectedHostel] = useState("");
  const [activeBucket, setActiveBucket] = useState<string | null>(null);

  const overdueRows = useMemo(
    () =>
      ledger
        .filter((row) => row.balance_outstanding > 0)
        .map((row) => {
          const days = daysOverdue(row.start_date);
          return { ...row, daysOverdue: days, bucketKey: bucketFor(days).key };
        }),
    [ledger]
  );

  const hostelOptions = useMemo(
    () => Array.from(new Set(overdueRows.map((r) => r.hostel_name))).sort(),
    [overdueRows]
  );

  const filtered = useMemo(
    () =>
      overdueRows.filter(
        (row) => !selectedHostel || row.hostel_name === selectedHostel
      ),
    [overdueRows, selectedHostel]
  );

  const bucketSummaries = useMemo(
    () =>
      BUCKETS.map((bucket) => {
        const rows = filtered.filter((r) => r.bucketKey === bucket.key);
        return {
          ...bucket,
          count: rows.length,
          total: rows.reduce((sum, r) => sum + r.balance_outstanding, 0),
        };
      }),
    [filtered]
  );

  const displayedRows = useMemo(() => {
    const rows = activeBucket
      ? filtered.filter((r) => r.bucketKey === activeBucket)
      : filtered;
    return [...rows].sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [filtered, activeBucket]);

  const totalOutstanding = filtered.reduce(
    (sum, r) => sum + r.balance_outstanding,
    0
  );

  function handleExport() {
    downloadCsv(
      `rent-ageing-${new Date().toISOString().slice(0, 10)}.csv`,
      displayedRows.map((row) => ({
        full_name: row.full_name,
        mobile_number: row.mobile_number || "",
        hostel_name: row.hostel_name,
        room_number: row.room_number,
        bed_id: row.bed_code || row.bed_id,
        balance_outstanding: row.balance_outstanding,
        days_overdue: row.daysOverdue,
        bucket: bucketFor(row.daysOverdue).label,
        payment_status: row.payment_status,
      }))
    );
  }

  return (
    <section className="mt-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">
          Total outstanding across {filtered.length} resident
          {filtered.length === 1 ? "" : "s"}
        </p>
        <p className="mt-1 text-2xl font-bold text-red-600">
          {formatMoney(totalOutstanding)}
        </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-4">
        {bucketSummaries.map((bucket) => (
          <button
            key={bucket.key}
            type="button"
            onClick={() =>
              setActiveBucket(activeBucket === bucket.key ? null : bucket.key)
            }
            className={`rounded-2xl border p-4 text-left shadow-sm transition ${
              activeBucket === bucket.key
                ? "border-indigo-400 bg-indigo-50"
                : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {bucket.label}
            </p>
            <p className="mt-2 text-xl font-bold text-slate-900">
              {formatMoney(bucket.total)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {bucket.count} resident{bucket.count === 1 ? "" : "s"}
            </p>
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <select
          value={selectedHostel}
          onChange={(e) => setSelectedHostel(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">All Hostels</option>
          {hostelOptions.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>

        {activeBucket && (
          <button
            type="button"
            onClick={() => setActiveBucket(null)}
            className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
          >
            Clear bucket filter ({BUCKETS.find((b) => b.key === activeBucket)?.label})
          </button>
        )}

        <button
          type="button"
          onClick={handleExport}
          disabled={displayedRows.length === 0}
          className="ml-auto rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {displayedRows.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-500">
            No outstanding balances in this view.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Resident</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Outstanding</th>
                  <th className="px-4 py-3">Days Overdue</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedRows.map((row) => (
                  <tr key={row.booking_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">
                        {row.full_name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.mobile_number || "No mobile number"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{row.hostel_name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Room {row.room_number} ·{" "}
                        {row.bed_code || `Bed ${row.bed_id}`}
                      </p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-semibold text-red-600">
                      {formatMoney(row.balance_outstanding)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.daysOverdue} day{row.daysOverdue === 1 ? "" : "s"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                        {row.payment_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`/${slugifyHostelName(row.hostel_name)}/room/${row.room_number}/resident/${row.bed_id}`}
                        className="font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        View →
                      </a>
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
