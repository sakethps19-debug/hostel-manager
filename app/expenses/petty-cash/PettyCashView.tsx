"use client";

import { useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";

type PettyCashTransactionRow = {
  transaction_id: number;
  hostel_name: string | null;
  transaction_type: string;
  amount: number;
  description: string;
  transaction_date: string;
  running_balance: number;
  created_at: string;
};

const TRANSACTION_TYPES = ["Top-up", "Expense", "Adjustment"];

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

export default function PettyCashView({
  transactions,
  hostelNames,
}: {
  transactions: PettyCashTransactionRow[];
  hostelNames: string[];
}) {
  const [rows, setRows] = useState(transactions);
  const [showForm, setShowForm] = useState(false);
  const [hostelName, setHostelName] = useState("");
  const [transactionType, setTransactionType] = useState("Top-up");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [transactionDate, setTransactionDate] = useState(todayIsoDate());
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleAdd() {
    setErrorMessage("");

    const amt = Number(amount);

    if (!Number.isFinite(amt) || amt <= 0) {
      setErrorMessage("Please enter a valid amount.");
      return;
    }

    if (!description.trim()) {
      setErrorMessage("Please enter a description.");
      return;
    }

    setSaving(true);

    try {
      const id = await callRpcClient<number>("add_petty_cash_transaction", {
        p_hostel_name: hostelName || null,
        p_transaction_type: transactionType,
        p_amount: amt,
        p_description: description.trim(),
        p_transaction_date: transactionDate,
      });

      await logAuditEvent(
        "petty_cash_transaction_added",
        "petty_cash_transaction",
        id,
        { transaction_type: transactionType, amount: amt }
      );

      const signedAmount =
        transactionType === "Top-up"
          ? Math.abs(amt)
          : transactionType === "Expense"
            ? -Math.abs(amt)
            : amt;

      const previousBalance = rows[0]?.running_balance ?? 0;

      setRows((prev) => [
        {
          transaction_id: id,
          hostel_name: hostelName || null,
          transaction_type: transactionType,
          amount: signedAmount,
          description: description.trim(),
          transaction_date: transactionDate,
          running_balance: previousBalance + signedAmount,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);

      setAmount("");
      setDescription("");
      setShowForm(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to add transaction."
      );
    } finally {
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
          {showForm ? "Cancel" : "+ New Transaction"}
        </button>
      </div>

      {showForm && (
        <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
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

            <select
              value={transactionType}
              onChange={(e) => setTransactionType(e.target.value)}
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            >
              {TRANSACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount *"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />

            <input
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />

            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description *"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none sm:col-span-2"
            />
          </div>

          {transactionType === "Adjustment" && (
            <p className="mt-2 text-xs text-slate-500">
              Adjustments are recorded as a positive amount (cash found).
              To record a shortfall, use Expense instead.
            </p>
          )}

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
            {saving ? "Saving..." : "Add Transaction"}
          </button>
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-500">
            No petty cash transactions yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Hostel</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((t) => (
                  <tr key={t.transaction_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDate(t.transaction_date)}
                    </td>
                    <td className="px-4 py-3">{t.hostel_name || "Common"}</td>
                    <td className="px-4 py-3">{t.transaction_type}</td>
                    <td className="px-4 py-3">{t.description}</td>
                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        t.amount < 0 ? "text-red-600" : "text-emerald-700"
                      }`}
                    >
                      {formatMoney(t.amount)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatMoney(t.running_balance)}
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
