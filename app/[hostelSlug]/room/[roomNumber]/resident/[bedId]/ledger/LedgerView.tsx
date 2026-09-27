"use client";

import { useMemo, useState } from "react";
import type { LedgerEntry } from "@/lib/residentLedger";

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function monthsAgoIsoDate(months: number) {
  const d = new Date();
  d.setDate(1); // avoid month-end overflow (e.g. Mar 31 - 1 month landing on Mar 3)
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

const MONTH_PRESETS = [
  { label: "3 Months", months: 3 },
  { label: "6 Months", months: 6 },
  { label: "12 Months", months: 12 },
];

export default function LedgerView({
  entries,
  residentName,
  hostelName,
  bedLabel,
}: {
  entries: LedgerEntry[];
  residentName: string;
  hostelName: string;
  bedLabel: string;
}) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [activePreset, setActivePreset] = useState<number | null>(null);

  function applyPreset(months: number) {
    setFromDate(monthsAgoIsoDate(months));
    setToDate("");
    setActivePreset(months);
  }

  function clearRange() {
    setFromDate("");
    setToDate("");
    setActivePreset(null);
  }

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      if (fromDate && entry.date < fromDate) return false;
      if (toDate && entry.date > toDate) return false;
      return true;
    });
  }, [entries, fromDate, toDate]);

  const totals = useMemo(() => {
    let totalRentDue = 0;
    let totalRentPaid = 0;
    let otherCharges = 0;
    let refunds = 0;
    let depositReceived = 0;

    for (const entry of filtered) {
      if (entry.type === "Monthly Rent Due") totalRentDue += entry.debit;
      if (entry.type === "Rent Receipt") totalRentPaid += entry.credit;
      if (entry.type === "Other Charge") otherCharges += entry.credit;
      if (entry.type === "Deposit Refund") refunds += entry.debit;
      if (entry.type === "Advance Receipt") depositReceived += entry.credit;
    }

    const currentBalance =
      filtered.length > 0
        ? [...filtered].reverse().find((e) => e.runningBalance !== null)
            ?.runningBalance ?? 0
        : 0;

    return {
      totalRentDue,
      totalRentPaid,
      outstandingRent: Math.max(currentBalance, 0),
      currentBalance,
      otherCharges,
      refunds,
      depositReceived,
    };
  }, [filtered]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-2">
            {MONTH_PRESETS.map((preset) => (
              <button
                key={preset.months}
                type="button"
                onClick={() => applyPreset(preset.months)}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  activePreset === preset.months
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {preset.label}
              </button>
            ))}
            {(fromDate || toDate) && (
              <button
                type="button"
                onClick={clearRange}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50"
              >
                All Time
              </button>
            )}
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">
              From
            </span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setActivePreset(null);
              }}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">
              To
            </span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setActivePreset(null);
              }}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </label>
        </div>

        <button
          onClick={() => window.print()}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Print / Download Statement
        </button>
      </div>

      <div className="mt-6 hidden print:block">
        <p className="text-lg font-bold">{hostelName} · {bedLabel}</p>
        <p className="text-sm text-slate-600">{residentName} — Resident Ledger Statement</p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-400">Current Balance</p>
          <p
            className={`mt-2 text-xl font-bold ${
              totals.currentBalance > 0 ? "text-red-600" : "text-emerald-600"
            }`}
          >
            {formatMoney(totals.currentBalance)}
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-400">Total Rent Due</p>
          <p className="mt-2 text-xl font-bold">{formatMoney(totals.totalRentDue)}</p>
        </div>

        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-400">Total Rent Paid</p>
          <p className="mt-2 text-xl font-bold">{formatMoney(totals.totalRentPaid)}</p>
        </div>

        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-400">Outstanding Rent</p>
          <p className="mt-2 text-xl font-bold text-red-600">
            {formatMoney(totals.outstandingRent)}
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-400">Deposit Received</p>
          <p className="mt-2 text-xl font-bold">{formatMoney(totals.depositReceived)}</p>
        </div>

        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-400">Other Charges</p>
          <p className="mt-2 text-xl font-bold">{formatMoney(totals.otherCharges)}</p>
        </div>

        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-400">Refunds</p>
          <p className="mt-2 text-xl font-bold">{formatMoney(totals.refunds)}</p>
        </div>
      </div>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm print:shadow-none">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Debit</th>
              <th className="px-4 py-3 text-right">Credit</th>
              <th className="px-4 py-3 text-right">Balance</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                  No ledger entries in this range.
                </td>
              </tr>
            ) : (
              filtered.map((entry, i) => (
                <tr
                  key={i}
                  className={entry.reversed ? "text-slate-400 line-through" : ""}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDate(entry.date)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-medium">
                    {entry.type}
                  </td>
                  <td className="px-4 py-3">{entry.description}</td>
                  <td className="px-4 py-3 text-right">
                    {entry.debit > 0 ? formatMoney(entry.debit) : "-"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {entry.credit > 0 ? formatMoney(entry.credit) : "-"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {entry.runningBalance !== null
                      ? formatMoney(entry.runningBalance)
                      : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
