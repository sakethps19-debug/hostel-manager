"use client";

import { useEffect, useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";
import { formatDate, formatMoney } from "@/lib/format";
import type { AccountRow } from "@/lib/accounting/types";

type BatchRow = {
  batch_id: number;
  as_of_date: string;
  status: "draft" | "posted";
  journal_entry_id: number | null;
};

type LineRow = {
  line_id: number;
  account_code: string;
  account_name: string;
  hostel_name: string | null;
  debit: number;
  credit: number;
  notes: string | null;
};

export default function OpeningBalancesView({
  initialBatches,
  accounts,
  hostelNames,
}: {
  initialBatches: BatchRow[];
  accounts: AccountRow[];
  hostelNames: string[];
}) {
  const [batches, setBatches] = useState(initialBatches);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(
    initialBatches.find((b) => b.status === "draft")?.batch_id ?? null
  );
  const [lines, setLines] = useState<LineRow[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [lineForm, setLineForm] = useState({
    accountCode: accounts[0]?.code || "",
    hostelName: "",
    side: "debit" as "debit" | "credit",
    amount: "",
    notes: "",
  });

  const selectedBatch = batches.find((b) => b.batch_id === selectedBatchId) || null;
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  const balanced = lines.length > 0 && Math.abs(totalDebit - totalCredit) < 0.01;

  useEffect(() => {
    if (!selectedBatchId) {
      setLines([]);
      return;
    }
    setLoadingLines(true);
    callRpcClient<LineRow[]>("get_opening_balance_lines", { p_batch_id: selectedBatchId })
      .then(setLines)
      .catch((error) => setErrorMessage(error instanceof Error ? error.message : "Unable to load lines."))
      .finally(() => setLoadingLines(false));
  }, [selectedBatchId]);

  async function handleCreateBatch() {
    setErrorMessage("");
    setSaving(true);
    try {
      const batchId = await callRpcClient<number>("create_opening_balance_batch", { p_as_of_date: asOfDate });
      await logAuditEvent("opening_balance_batch_created", "accounting", batchId, { as_of_date: asOfDate });
      setBatches((prev) => [{ batch_id: batchId, as_of_date: asOfDate, status: "draft", journal_entry_id: null }, ...prev]);
      setSelectedBatchId(batchId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create batch.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddLine() {
    if (!selectedBatchId) return;
    setErrorMessage("");
    const amount = Number(lineForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage("Please enter an amount greater than zero.");
      return;
    }

    setSaving(true);
    try {
      const lineId = await callRpcClient<number>("add_opening_balance_line", {
        p_batch_id: selectedBatchId,
        p_account_code: lineForm.accountCode,
        p_debit: lineForm.side === "debit" ? amount : 0,
        p_credit: lineForm.side === "credit" ? amount : 0,
        p_hostel_name: lineForm.hostelName || null,
        p_notes: lineForm.notes || null,
      });

      const account = accounts.find((a) => a.code === lineForm.accountCode);
      setLines((prev) => [
        ...prev,
        {
          line_id: lineId,
          account_code: lineForm.accountCode,
          account_name: account?.name || lineForm.accountCode,
          hostel_name: lineForm.hostelName || null,
          debit: lineForm.side === "debit" ? amount : 0,
          credit: lineForm.side === "credit" ? amount : 0,
          notes: lineForm.notes || null,
        },
      ]);
      setLineForm({ ...lineForm, amount: "", notes: "" });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to add line.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteLine(lineId: number) {
    setErrorMessage("");
    try {
      await callRpcClient("delete_opening_balance_line", { p_line_id: lineId });
      setLines((prev) => prev.filter((l) => l.line_id !== lineId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to remove line.");
    }
  }

  async function handlePost() {
    if (!selectedBatchId) return;
    setErrorMessage("");
    setSaving(true);
    try {
      const journalEntryId = await callRpcClient<number>("post_opening_balance_batch", { p_batch_id: selectedBatchId });
      await logAuditEvent("opening_balance_batch_posted", "accounting", selectedBatchId, { journal_entry_id: journalEntryId });
      setBatches((prev) =>
        prev.map((b) => (b.batch_id === selectedBatchId ? { ...b, status: "posted", journal_entry_id: journalEntryId } : b))
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to post batch.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Batches</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <select
            value={selectedBatchId ?? ""}
            onChange={(e) => setSelectedBatchId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
          >
            <option value="">Choose a batch</option>
            {batches.map((b) => (
              <option key={b.batch_id} value={b.batch_id}>
                {formatDate(b.as_of_date)} — {b.status}
              </option>
            ))}
          </select>

          <label className="block text-sm">
            New batch as of
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
            />
          </label>
          <button
            onClick={handleCreateBatch}
            disabled={saving}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            + New Batch
          </button>
        </div>
      </div>

      {selectedBatch && (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">
              Batch as of {formatDate(selectedBatch.as_of_date)}
            </h2>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                selectedBatch.status === "posted" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              }`}
            >
              {selectedBatch.status === "posted" ? "Posted" : "Draft"}
            </span>
          </div>

          {errorMessage && <p className="mt-3 text-sm font-medium text-red-600">{errorMessage}</p>}

          {selectedBatch.status === "draft" && (
            <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <select
                  value={lineForm.accountCode}
                  onChange={(e) => setLineForm({ ...lineForm, accountCode: e.target.value })}
                  className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
                >
                  {accounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
                <select
                  value={lineForm.hostelName}
                  onChange={(e) => setLineForm({ ...lineForm, hostelName: e.target.value })}
                  className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
                >
                  <option value="">Consolidated</option>
                  {hostelNames.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                <select
                  value={lineForm.side}
                  onChange={(e) => setLineForm({ ...lineForm, side: e.target.value as "debit" | "credit" })}
                  className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
                >
                  <option value="debit">Debit</option>
                  <option value="credit">Credit</option>
                </select>
                <input
                  type="number"
                  min="0"
                  value={lineForm.amount}
                  onChange={(e) => setLineForm({ ...lineForm, amount: e.target.value })}
                  placeholder="Amount"
                  className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
                />
                <input
                  value={lineForm.notes}
                  onChange={(e) => setLineForm({ ...lineForm, notes: e.target.value })}
                  placeholder="Notes (e.g. resident/vendor name)"
                  className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none sm:col-span-2"
                />
              </div>
              <button
                onClick={handleAddLine}
                disabled={saving}
                className="mt-3 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Add Line
              </button>
            </div>
          )}

          <div className="mt-5 overflow-x-auto">
            {loadingLines ? (
              <p className="text-sm text-slate-400">Loading...</p>
            ) : lines.length === 0 ? (
              <p className="text-sm text-slate-400">No lines yet.</p>
            ) : (
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Account</th>
                    <th className="px-4 py-2">Hostel</th>
                    <th className="px-4 py-2 text-right">Debit</th>
                    <th className="px-4 py-2 text-right">Credit</th>
                    <th className="px-4 py-2">Notes</th>
                    {selectedBatch.status === "draft" && <th className="px-4 py-2"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((l) => (
                    <tr key={l.line_id}>
                      <td className="px-4 py-2">{l.account_name}</td>
                      <td className="px-4 py-2 text-slate-500">{l.hostel_name || "Consolidated"}</td>
                      <td className="px-4 py-2 text-right">{l.debit ? formatMoney(l.debit) : "-"}</td>
                      <td className="px-4 py-2 text-right">{l.credit ? formatMoney(l.credit) : "-"}</td>
                      <td className="px-4 py-2 text-xs text-slate-400">{l.notes || "-"}</td>
                      {selectedBatch.status === "draft" && (
                        <td className="px-4 py-2">
                          <button onClick={() => handleDeleteLine(l.line_id)} className="text-xs font-semibold text-red-600 hover:text-red-700">
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 font-bold">
                  <tr>
                    <td className="px-4 py-2" colSpan={2}>
                      Total
                    </td>
                    <td className="px-4 py-2 text-right">{formatMoney(totalDebit)}</td>
                    <td className="px-4 py-2 text-right">{formatMoney(totalCredit)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {selectedBatch.status === "draft" && (
            <div className="mt-4">
              <p className={`text-sm font-semibold ${balanced ? "text-emerald-700" : "text-amber-700"}`}>
                {balanced ? "Balanced — ready to post." : "Not balanced yet — debits must equal credits."}
              </p>
              <button
                onClick={handlePost}
                disabled={saving || !balanced}
                className="mt-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Posting..." : "Post Batch"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
