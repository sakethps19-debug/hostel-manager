"use client";

import { useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";

type CloseRow = {
  close_id: number;
  month: number;
  year: number;
  rent_revenue: number;
  other_revenue: number;
  operating_expenses: number;
  net_surplus: number;
  outstanding_rent_total: number;
  deposits_held_total: number;
  notes: string | null;
  closed_by_name: string | null;
  closed_at: string;
  reopened_at: string | null;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatMoney(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function MonthlyFinanceCloseView({
  closes,
  defaultMonth,
  defaultYear,
}: {
  closes: CloseRow[];
  defaultMonth: number;
  defaultYear: number;
}) {
  const [rows, setRows] = useState(closes);
  const [month, setMonth] = useState(defaultMonth);
  const [year, setYear] = useState(defaultYear);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const alreadyClosed = rows.some(
    (r) => r.month === month && r.year === year && !r.reopened_at
  );

  async function handleClose() {
    setErrorMessage("");

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      setErrorMessage("Please enter a valid year.");
      return;
    }

    setSaving(-1);

    try {
      const id = await callRpcClient<number>("close_month", {
        p_month: month,
        p_year: year,
        p_notes: notes || null,
      });

      await logAuditEvent("month_closed", "monthly_finance_close", id, {
        month,
        year,
      });

      // Locks the accounting ledger for this period too, if the accounting
      // module is set up - close_month itself is only a checkpoint/snapshot
      // and was never enforced as a real posting lock (see its own page
      // copy), this is what actually blocks new journal entries dated in
      // this period until it's explicitly reopened below.
      try {
        await callRpcClient("lock_accounting_period", { p_month: month, p_year: year });
      } catch {
        // accounting module not set up yet - nothing to lock
      }

      window.location.reload();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to close month."
      );
      setSaving(null);
    }
  }

  async function handleReopen(row: CloseRow) {
    setErrorMessage("");
    setSaving(row.close_id);

    try {
      await callRpcClient("reopen_month", {
        p_month: row.month,
        p_year: row.year,
      });

      try {
        await callRpcClient("unlock_accounting_period", { p_month: row.month, p_year: row.year });
      } catch {
        // accounting module not set up yet - nothing to unlock
      }

      await logAuditEvent(
        "month_reopened",
        "monthly_finance_close",
        row.close_id,
        { month: row.month, year: row.year }
      );

      setRows((prev) =>
        prev.map((r) =>
          r.close_id === row.close_id
            ? { ...r, reopened_at: new Date().toISOString() }
            : r
        )
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to reopen month."
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="mt-8">
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
        <p className="font-semibold text-slate-900">Close a Month</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>

          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
          />

          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
          />
        </div>

        {alreadyClosed && (
          <p className="mt-2 text-sm font-medium text-amber-700">
            {MONTH_NAMES[month - 1]} {year} is already closed. Reopen it below
            first if you need to close it again.
          </p>
        )}

        {errorMessage && (
          <p className="mt-2 text-sm font-medium text-red-600">
            {errorMessage}
          </p>
        )}

        <button
          onClick={handleClose}
          disabled={saving === -1 || alreadyClosed}
          className="mt-3 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving === -1 ? "Closing..." : `Close ${MONTH_NAMES[month - 1]} ${year}`}
        </button>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-500">
            No months closed yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Month</th>
                  <th className="px-4 py-3 text-right">Rent Revenue</th>
                  <th className="px-4 py-3 text-right">Expenses</th>
                  <th className="px-4 py-3 text-right">Net Surplus</th>
                  <th className="px-4 py-3">Closed</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr
                    key={row.close_id}
                    className={row.reopened_at ? "opacity-50" : ""}
                  >
                    <td className="px-4 py-3 font-semibold">
                      {MONTH_NAMES[row.month - 1]} {row.year}
                      {row.reopened_at && (
                        <p className="text-xs font-normal text-slate-400">
                          Reopened
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(row.rent_revenue + row.other_revenue)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(row.operating_expenses)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatMoney(row.net_surplus)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDateTime(row.closed_at)}
                      {row.closed_by_name ? ` · ${row.closed_by_name}` : ""}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!row.reopened_at && (
                        <button
                          onClick={() => handleReopen(row)}
                          disabled={saving === row.close_id}
                          className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Reopen
                        </button>
                      )}
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
