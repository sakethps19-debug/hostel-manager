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
  end_date: string;
};

function formatMoney(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function dueDayOfMonth(startDate: string) {
  return new Date(`${startDate}T00:00:00`).getDate();
}

function ordinal(day: number) {
  if (day >= 11 && day <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function getStatusClasses(status: string) {
  if (status === "Paid" || status === "Advance Paid") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "Partially Paid") return "bg-amber-50 text-amber-700";
  if (status === "Overdue") return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-600";
}

export default function RentCalendarView({
  ledger,
}: {
  ledger: LedgerRow[];
}) {
  const [selectedHostel, setSelectedHostel] = useState("");

  const hostelOptions = useMemo(
    () => Array.from(new Set(ledger.map((row) => row.hostel_name))).sort(),
    [ledger]
  );

  const filtered = useMemo(
    () =>
      ledger.filter(
        (row) => !selectedHostel || row.hostel_name === selectedHostel
      ),
    [ledger, selectedHostel]
  );

  const groups = useMemo(() => {
    const todayDay = new Date().getDate();
    const byDay = new Map<number, LedgerRow[]>();

    for (const row of filtered) {
      const day = dueDayOfMonth(row.start_date);
      const list = byDay.get(day) || [];
      list.push(row);
      byDay.set(day, list);
    }

    const days = Array.from(byDay.keys());
    days.sort((a, b) => {
      const relativeA = (a - todayDay + 31) % 31;
      const relativeB = (b - todayDay + 31) % 31;
      return relativeA - relativeB;
    });

    return days.map((day) => ({
      day,
      isToday: day === todayDay,
      rows: (byDay.get(day) || []).sort((a, b) =>
        a.full_name.localeCompare(b.full_name)
      ),
    }));
  }, [filtered]);

  function handleExport() {
    downloadCsv(
      `rent-calendar-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered
        .map((row) => ({
          due_day_of_month: dueDayOfMonth(row.start_date),
          full_name: row.full_name,
          mobile_number: row.mobile_number || "",
          hostel_name: row.hostel_name,
          room_number: row.room_number,
          bed_id: row.bed_code || row.bed_id,
          monthly_rent: row.monthly_rent,
          balance_outstanding: row.balance_outstanding,
          payment_status: row.payment_status,
        }))
        .sort((a, b) => a.due_day_of_month - b.due_day_of_month)
    );
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
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

        <button
          type="button"
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="ml-auto rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-slate-500 shadow-sm">
          No active residents match.
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {groups.map((group) => (
            <div
              key={group.day}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div
                className={`flex items-center justify-between border-b border-slate-100 px-5 py-3 ${
                  group.isToday ? "bg-indigo-50" : "bg-slate-50"
                }`}
              >
                <p className="text-sm font-bold text-slate-700">
                  {ordinal(group.day)} of the month
                  {group.isToday && (
                    <span className="ml-2 rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white">
                      Today
                    </span>
                  )}
                </p>
                <p className="text-xs font-semibold text-slate-500">
                  {group.rows.length} resident{group.rows.length === 1 ? "" : "s"}
                </p>
              </div>

              <ul className="divide-y divide-slate-100">
                {group.rows.map((row) => (
                  <li
                    key={row.booking_id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {row.full_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {row.hostel_name} · Room {row.room_number} ·{" "}
                        {row.bed_code || row.bed_id}
                      </p>
                    </div>

                    <div className="flex items-center gap-4">
                      <p className="text-sm font-semibold">
                        {formatMoney(row.monthly_rent)}
                      </p>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                          row.payment_status
                        )}`}
                      >
                        {row.payment_status}
                      </span>

                      <a
                        href={`/${slugifyHostelName(row.hostel_name)}/room/${row.room_number}/resident/${row.bed_id}`}
                        className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        View →
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
