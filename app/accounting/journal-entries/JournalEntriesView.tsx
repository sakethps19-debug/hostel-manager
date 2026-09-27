"use client";

import { useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";
import { formatDate, formatMoney } from "@/lib/format";
import type { AccountRow } from "@/lib/accounting/types";

type JournalEntryRow = {
  journal_entry_id: number;
  entry_date: string;
  hostel_name: string | null;
  source_type: string;
  source_id: number | null;
  narration: string;
  status: "posted" | "reversed";
  total_amount: number;
};

type LineDraft = { accountCode: string; side: "debit" | "credit"; amount: string };

const EMPTY_LINES: LineDraft[] = [
  { accountCode: "", side: "debit", amount: "" },
  { accountCode: "", side: "credit", amount: "" },
];

export default function JournalEntriesView({
  initialEntries,
  accounts,
  hostelNames,
  canPostManual,
  fromDate,
  toDate,
}: {
  initialEntries: JournalEntryRow[];
  accounts: AccountRow[];
  hostelNames: string[];
  canPostManual: boolean;
  fromDate: string;
  toDate: string;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [showForm, setShowForm] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [hostelName, setHostelName] = useState("");
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<LineDraft[]>(EMPTY_LINES);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [runningDepreciation, setRunningDepreciation] = useState(false);
  const [depreciationMessage, setDepreciationMessage] = useState("");

  const now = new Date();

  async function handleRunDepreciation() {
    setDepreciationMessage("");
    setRunningDepreciation(true);
    try {
      const count = await callRpcClient<number>("post_depreciation_run", {
        p_period_year: now.getFullYear(),
        p_period_month: now.getMonth() + 1,
      });
      await logAuditEvent("depreciation_run", "accounting", null, {
        period_year: now.getFullYear(),
        period_month: now.getMonth() + 1,
        count,
      });
      setDepreciationMessage(
        count === 0
          ? "No assets due for depreciation this period (already run, or none capitalized)."
          : `Posted depreciation for ${count} asset${count === 1 ? "" : "s"}. Reload to see the entries below.`
      );
    } catch (error) {
      setDepreciationMessage(error instanceof Error ? error.message : "Unable to run depreciation.");
    } finally {
      setRunningDepreciation(false);
    }
  }

  const totalDebit = lines
    .filter((l) => l.side === "debit")
    .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const totalCredit = lines
    .filter((l) => l.side === "credit")
    .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const balanced =
    lines.every((l) => l.amount && l.accountCode) &&
    Math.abs(totalDebit - totalCredit) < 0.01 &&
    totalDebit > 0;

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  async function handlePost() {
    setErrorMessage("");
    if (!narration.trim()) {
      setErrorMessage("Please enter a narration.");
      return;
    }
    if (!balanced) {
      setErrorMessage("Total debits must equal total credits, and every line needs an account and an amount.");
      return;
    }

    setSaving(true);
    try {
      const journalEntryId = await callRpcClient<number>("post_manual_journal_entry", {
        p_entry_date: entryDate,
        p_hostel_name: hostelName || null,
        p_narration: narration.trim(),
        p_lines: lines.map((l) => ({
          account_code: l.accountCode,
          debit: l.side === "debit" ? Number(l.amount) : 0,
          credit: l.side === "credit" ? Number(l.amount) : 0,
        })),
      });

      await logAuditEvent("manual_journal_entry_posted", "journal_entry", journalEntryId, { narration });

      setEntries((prev) => [
        {
          journal_entry_id: journalEntryId,
          entry_date: entryDate,
          hostel_name: hostelName || null,
          source_type: "manual",
          source_id: null,
          narration: narration.trim(),
          status: "posted",
          total_amount: totalDebit,
        },
        ...prev,
      ]);

      setNarration("");
      setLines(EMPTY_LINES);
      setShowForm(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to post entry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8">
      {canPostManual && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-indigo-800">
                Depreciation for {now.getMonth() + 1}/{now.getFullYear()}
              </p>
              <p className="text-sm text-slate-600">
                Straight-line, run once per period — assets already processed this period are skipped.
              </p>
            </div>
            <button
              onClick={handleRunDepreciation}
              disabled={runningDepreciation}
              className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {runningDepreciation ? "Running..." : "Run Depreciation"}
            </button>
          </div>
          {depreciationMessage && <p className="mt-2 text-sm font-medium text-indigo-800">{depreciationMessage}</p>}
        </div>
      )}

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          From
          <input
            type="date"
            name="from"
            defaultValue={fromDate}
            className="mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
          />
        </label>
        <label className="block text-sm">
          To
          <input
            type="date"
            name="to"
            defaultValue={toDate}
            className="mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
          />
        </label>
        <button type="submit" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Apply
        </button>

        {canPostManual && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="ml-auto rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white"
          >
            {showForm ? "Cancel" : "+ New Manual Entry"}
          </button>
        )}
      </form>

      {showForm && (
        <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              Date
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="block text-sm">
              Hostel
              <select
                value={hostelName}
                onChange={(e) => setHostelName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
              >
                <option value="">Consolidated</option>
                {hostelNames.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm sm:col-span-1">
              Narration
              <input
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                className="mt-1 w-full rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
              />
            </label>
          </div>

          <div className="mt-4 space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select
                  value={line.accountCode}
                  onChange={(e) => updateLine(i, { accountCode: e.target.value })}
                  className="flex-1 rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
                >
                  <option value="">Choose account</option>
                  {accounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
                <select
                  value={line.side}
                  onChange={(e) => updateLine(i, { side: e.target.value as "debit" | "credit" })}
                  className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
                >
                  <option value="debit">Debit</option>
                  <option value="credit">Credit</option>
                </select>
                <input
                  type="number"
                  min="0"
                  value={line.amount}
                  onChange={(e) => updateLine(i, { amount: e.target.value })}
                  placeholder="Amount"
                  className="w-32 rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
                />
                {lines.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-sm font-semibold text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, { accountCode: "", side: "debit", amount: "" }])}
              className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              + Add line
            </button>
          </div>

          <p className={`mt-3 text-sm font-semibold ${balanced ? "text-emerald-700" : "text-amber-700"}`}>
            Debit {formatMoney(totalDebit)} · Credit {formatMoney(totalCredit)}
            {!balanced && " — must balance before posting"}
          </p>

          {errorMessage && <p className="mt-2 text-sm font-medium text-red-600">{errorMessage}</p>}

          <button
            onClick={handlePost}
            disabled={saving || !balanced}
            className="mt-3 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Posting..." : "Post Entry"}
          </button>
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {entries.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-500">No journal entries in this range.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Narration</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Hostel</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((e) => (
                  <tr key={e.journal_entry_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(e.entry_date)}</td>
                    <td className="px-4 py-3">
                      <a
                        href={`/accounting/journal-entries/${e.journal_entry_id}`}
                        className="text-indigo-600 hover:text-indigo-700"
                      >
                        {e.narration}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{e.source_type}</td>
                    <td className="px-4 py-3 text-slate-500">{e.hostel_name || "Consolidated"}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(e.total_amount)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          e.status === "reversed" ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {e.status === "reversed" ? "Reversed" : "Posted"}
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
