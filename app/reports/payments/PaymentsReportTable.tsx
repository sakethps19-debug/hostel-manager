"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { downloadCsv } from "@/lib/csv";

type PaymentRow = {
  payment_id: number;
  receipt_number: string;
  payment_date: string;
  payment_type: string;
  amount: number;
  payment_mode: string;
  reference_number: string | null;
  status: string;
  resident_name: string;
  mobile_number: string;
  hostel_name: string;
  room_number: string;
  bed_code: string | null;
  bed_number: string;
};

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(value: number) {
  return `Rs. ${Number(value).toLocaleString("en-IN")}`;
}

export default function PaymentsReportTable({
  payments,
  initialStart,
  initialEnd,
}: {
  payments: PaymentRow[];
  initialStart: string;
  initialEnd: string;
}) {
  const router = useRouter();
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [hostelFilter, setHostelFilter] = useState("");

  const hostelOptions = useMemo(
    () => Array.from(new Set(payments.map((p) => p.hostel_name))).sort(),
    [payments]
  );

  const filtered = useMemo(
    () =>
      payments.filter(
        (p) => !hostelFilter || p.hostel_name === hostelFilter
      ),
    [payments, hostelFilter]
  );

  const activePayments = filtered.filter((p) => p.status !== "reversed");

  const activeTotal = activePayments.reduce(
    (sum, p) => sum + Number(p.amount),
    0
  );

  const modeSummary = useMemo(() => {
    const totals = new Map<string, number>();
    for (const p of activePayments) {
      totals.set(p.payment_mode, (totals.get(p.payment_mode) || 0) + Number(p.amount));
    }
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  }, [activePayments]);

  function applyDateFilter() {
    const qs = new URLSearchParams();
    if (start) qs.set("start", start);
    if (end) qs.set("end", end);
    router.push(`/reports/payments?${qs.toString()}`);
  }

  function handleExport() {
    downloadCsv(
      `payments-report-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((p) => ({
        payment_date: p.payment_date,
        receipt_number: p.receipt_number,
        resident_name: p.resident_name,
        mobile_number: p.mobile_number,
        hostel_name: p.hostel_name,
        room_number: p.room_number,
        bed_id: p.bed_code || p.bed_number,
        payment_type: p.payment_type,
        amount: p.amount,
        payment_mode: p.payment_mode,
        reference_number: p.reference_number || "",
        status: p.status,
      }))
    );
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            From
          </label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            To
          </label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </div>

        <button
          type="button"
          onClick={applyDateFilter}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Apply
        </button>

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

        <button
          type="button"
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="ml-auto rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      <p className="mt-3 text-sm text-slate-500">
        {filtered.length} payment{filtered.length === 1 ? "" : "s"} ·{" "}
        {formatMoney(activeTotal)} collected (excluding reversed)
      </p>

      {modeSummary.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {modeSummary.map(([mode, amount]) => (
            <span
              key={mode}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
            >
              {mode}: {formatMoney(amount)}
            </span>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-slate-500 shadow-sm">
          No payments match.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Receipt</th>
                <th className="px-4 py-3">Resident</th>
                <th className="px-4 py-3">Hostel / Bed</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => (
                <tr
                  key={p.payment_id}
                  className={
                    p.status === "reversed"
                      ? "text-slate-400 line-through"
                      : "hover:bg-slate-50"
                  }
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDate(p.payment_date)}
                  </td>
                  <td className="px-4 py-3">{p.receipt_number}</td>
                  <td className="px-4 py-3">{p.resident_name}</td>
                  <td className="px-4 py-3">
                    {p.hostel_name} · {p.bed_code || p.bed_number}
                  </td>
                  <td className="px-4 py-3">{p.payment_type}</td>
                  <td className="px-4 py-3">{p.payment_mode}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatMoney(p.amount)}
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
