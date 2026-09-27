"use client";

import { useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";
import { formatDateTime } from "@/lib/format";
import type { ReconciliationFlagRow } from "@/lib/accounting/types";

const FLAG_LABELS: Record<string, string> = {
  trial_balance_unbalanced: "Trial Balance Unbalanced",
  balance_sheet_unbalanced: "Balance Sheet Unbalanced",
  unjournaled_payment: "Payment Missing Journal Entry",
  unjournaled_expense: "Expense Missing Journal Entry",
  unjournaled_asset: "Asset Purchase Missing Journal Entry",
  unbalanced_journal_entry: "Unbalanced Journal Entry",
  asset_register_vs_ledger: "Asset Depreciation Mismatch",
  ar_negative_balance: "AR Negative Balance (Possible Advance)",
};

export default function ReconciliationView({ initialFlags }: { initialFlags: ReconciliationFlagRow[] }) {
  const [flags, setFlags] = useState(initialFlags);
  const [running, setRunning] = useState(false);
  const [catchingUp, setCatchingUp] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  async function handleRunChecks() {
    setStatusMessage("");
    setRunning(true);
    try {
      const flagCount = await callRpcClient<number>("run_accounting_reconciliation_checks", {});
      await logAuditEvent("reconciliation_checks_run", "accounting", null, { flag_count: flagCount });
      const refreshed = await callRpcClient<ReconciliationFlagRow[]>("get_reconciliation_flags", {
        p_include_resolved: false,
      });
      setFlags(refreshed);
      setStatusMessage(flagCount === 0 ? "No new exceptions found." : `Found ${flagCount} new exception(s).`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to run checks.");
    } finally {
      setRunning(false);
    }
  }

  async function handleCatchUp() {
    setStatusMessage("");
    setCatchingUp(true);
    try {
      type CatchUpRow = { entity: string; posted_count: number };
      const result = await callRpcClient<CatchUpRow[]>("reconcile_journal_postings", {});
      await logAuditEvent("journal_postings_reconciled", "accounting", null, { result });
      const total = result.reduce((sum, r) => sum + r.posted_count, 0);
      setStatusMessage(
        total === 0
          ? "Nothing to catch up — every payment, expense, and asset purchase already has a journal entry."
          : `Posted ${total} missing journal entr${total === 1 ? "y" : "ies"}: ${result
              .map((r) => `${r.posted_count} ${r.entity}`)
              .join(", ")}.`
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to run catch-up posting.");
    } finally {
      setCatchingUp(false);
    }
  }

  async function handleResolve(flagId: number, notes: string) {
    setResolvingId(flagId);
    try {
      await callRpcClient("resolve_reconciliation_flag", { p_flag_id: flagId, p_resolution_notes: notes || null });
      await logAuditEvent("reconciliation_flag_resolved", "accounting", flagId, {});
      setFlags((prev) => prev.filter((f) => f.flag_id !== flagId));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to resolve flag.");
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleRunChecks}
          disabled={running}
          className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {running ? "Running..." : "Run Reconciliation Checks"}
        </button>
        <button
          onClick={handleCatchUp}
          disabled={catchingUp}
          className="rounded-xl border border-indigo-200 bg-white px-5 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
        >
          {catchingUp ? "Posting..." : "Post Missing Journal Entries"}
        </button>
      </div>

      {statusMessage && <p className="mt-3 text-sm font-medium text-slate-700">{statusMessage}</p>}

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {flags.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="font-semibold text-emerald-700">No open exceptions.</p>
            <p className="mt-1 text-sm text-slate-500">Run the checks above to look for new ones.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {flags.map((f) => (
              <li key={f.flag_id} className="flex items-start justify-between gap-4 px-5 py-4">
                <div>
                  <p className="font-semibold text-red-700">{FLAG_LABELS[f.flag_type] || f.flag_type}</p>
                  <p className="mt-1 text-sm text-slate-600">{f.description}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatDateTime(f.detected_at)}
                    {f.related_source_type && f.related_source_id
                      ? ` · ${f.related_source_type} #${f.related_source_id}`
                      : ""}
                    {f.amount_variance ? ` · variance ${f.amount_variance}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleResolve(f.flag_id, "")}
                  disabled={resolvingId === f.flag_id}
                  className="whitespace-nowrap rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {resolvingId === f.flag_id ? "Resolving..." : "Mark Resolved"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
