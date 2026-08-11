"use client";

import { useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";

type ReconciliationRow = {
  reconciliation_id: number;
  reconciliation_date: string;
  hostel_name: string | null;
  expected_balance: number;
  counted_balance: number;
  variance: number;
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rs. ${Math.abs(Number(value)).toLocaleString("en-IN")}`;
}

export default function CashReconciliationView({
  reconciliations,
  hostelNames,
}: {
  reconciliations: ReconciliationRow[];
  hostelNames: string[];
}) {
  const [rows, setRows] = useState(reconciliations);
  const [showForm, setShowForm] = useState(false);
  const [reconciliationDate, setReconciliationDate] = useState(todayIsoDate());
  const [hostelName, setHostelName] = useState("");
  const [countedBalance, setCountedBalance] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleAdd() {
    setErrorMessage("");

    const counted = Number(countedBalance);

    if (!Number.isFinite(counted) || counted < 0) {
      setErrorMessage("Please enter a valid counted balance.");
      return;
    }

    setSaving(true);

    try {
      const id = await callRpcClient<number>("add_cash_reconciliation", {
        p_reconciliation_date: reconciliationDate,
        p_hostel_name: hostelName || null,
        p_counted_balance: counted,
        p_notes: notes || null,
      });

      await logAuditEvent(
        "cash_reconciliation_added",
        "cash_reconciliation",
        id,
        { counted_balance: counted }
      );

      window.location.reload();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save reconciliation."
      );
      setSaving(false);
    }
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white"
        >
          {showForm ? "Cancel" : "+ New Reconciliation"}
        </button>
      </div>

      {showForm && (
        <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              type="date"
              value={reconciliationDate}
              onChange={(e) => setReconciliationDate(e.target.value)}
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />

            <select
              value={hostelName}
              onChange={(e) => setHostelName(e.target.value)}
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            >
              <option value="">Common / Consolidated</option>
              {hostelNames.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>

            <input
              type="number"
              min="0"
              value={countedBalance}
              onChange={(e) => setCountedBalance(e.target.value)}
              placeholder="Counted cash balance *"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />

            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none sm:col-span-3"
            />
          </div>

          <p className="mt-2 text-xs text-slate-500">
            The expected balance is taken automatically from the current
            Petty Cash ledger balance at the moment you save.
          </p>

          {errorMessage && (
            <p className="mt-2 text-sm font-medium text-red-600">
              {errorMessage}
            </p>
          )}

          <button
            onClick={handleAdd}
            disabled={saving}
            className="mt-3 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Reconciliation"}
          </button>
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-500">
            No reconciliations recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Hostel</th>
                  <th className="px-4 py-3 text-right">Expected</th>
                  <th className="px-4 py-3 text-right">Counted</th>
                  <th className="px-4 py-3 text-right">Variance</th>
                  <th className="px-4 py-3">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.reconciliation_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDate(r.reconciliation_date)}
                    </td>
                    <td className="px-4 py-3">{r.hostel_name || "Common"}</td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(r.expected_balance)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(r.counted_balance)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        r.variance === 0
                          ? "text-slate-500"
                          : r.variance < 0
                            ? "text-red-600"
                            : "text-emerald-700"
                      }`}
                    >
                      {formatMoney(r.variance)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {r.created_by_name || "-"}
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
