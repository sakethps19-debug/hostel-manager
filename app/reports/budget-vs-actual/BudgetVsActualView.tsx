"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";

type BudgetRow = {
  budget_id: number;
  category: string;
  hostel_name: string | null;
  monthly_budget_amount: number;
  notes: string | null;
  updated_at: string;
};

type BudgetVsActualRow = {
  category: string;
  hostel_name: string | null;
  budgeted_amount: number;
  actual_amount: number;
  variance: number;
};

const CATEGORIES = [
  "Electricity",
  "Water",
  "Housekeeping",
  "Repairs & Maintenance",
  "Wi-Fi",
  "Salaries",
  "Supplies",
  "Rent / Lease",
  "Taxes / Charges",
  "Other",
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatMoney(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rs. ${Math.abs(Number(value)).toLocaleString("en-IN")}`;
}

export default function BudgetVsActualView({
  budgets,
  comparison,
  hostelNames,
  month,
  year,
}: {
  budgets: BudgetRow[];
  comparison: BudgetVsActualRow[];
  hostelNames: string[];
  month: number;
  year: number;
}) {
  const router = useRouter();

  const [budgetRows, setBudgetRows] = useState(budgets);
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState("");
  const [hostelName, setHostelName] = useState("");
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSetBudget() {
    setErrorMessage("");

    const amt = Number(monthlyAmount);

    if (!category) {
      setErrorMessage("Please select a category.");
      return;
    }

    if (!Number.isFinite(amt) || amt < 0) {
      setErrorMessage("Please enter a valid amount.");
      return;
    }

    setSaving(true);

    try {
      const id = await callRpcClient<number>("set_expense_budget", {
        p_category: category,
        p_hostel_name: hostelName || null,
        p_monthly_budget_amount: amt,
        p_notes: notes || null,
      });

      await logAuditEvent("expense_budget_set", "expense_budget", id, {
        category,
        hostel_name: hostelName || "Common",
        monthly_budget_amount: amt,
      });

      setBudgetRows((prev) => {
        const withoutDuplicate = prev.filter(
          (b) =>
            !(
              b.category === category &&
              (b.hostel_name || "") === hostelName
            )
        );
        return [
          ...withoutDuplicate,
          {
            budget_id: id,
            category,
            hostel_name: hostelName || null,
            monthly_budget_amount: amt,
            notes: notes || null,
            updated_at: new Date().toISOString(),
          },
        ];
      });

      setCategory("");
      setHostelName("");
      setMonthlyAmount("");
      setNotes("");
      setShowForm(false);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save budget."
      );
    } finally {
      setSaving(false);
    }
  }

  const prevParams = month === 1
    ? { month: "12", year: String(year - 1) }
    : { month: String(month - 1), year: String(year) };
  const nextParams = month === 12
    ? { month: "1", year: String(year + 1) }
    : { month: String(month + 1), year: String(year) };

  const totalBudgeted = comparison.reduce((s, r) => s + Number(r.budgeted_amount), 0);
  const totalActual = comparison.reduce((s, r) => s + Number(r.actual_amount), 0);

  return (
    <section className="mt-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-semibold text-slate-900">
            {MONTH_NAMES[month - 1]} {year}
          </p>
          <div className="flex gap-3 text-sm">
            <a
              href={`/reports/budget-vs-actual?month=${prevParams.month}&year=${prevParams.year}`}
              className="font-semibold text-indigo-600 hover:text-indigo-700"
            >
              ← Previous
            </a>
            <a
              href={`/reports/budget-vs-actual?month=${nextParams.month}&year=${nextParams.year}`}
              className="font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Next →
            </a>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">Budgeted</p>
            <p className="mt-1 text-xl font-bold">{formatMoney(totalBudgeted)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">Actual</p>
            <p className="mt-1 text-xl font-bold">{formatMoney(totalActual)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">Variance</p>
            <p
              className={`mt-1 text-xl font-bold ${
                totalBudgeted - totalActual < 0 ? "text-red-600" : "text-emerald-700"
              }`}
            >
              {formatMoney(totalBudgeted - totalActual)}
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Hostel</th>
                <th className="px-4 py-2 text-right">Budgeted</th>
                <th className="px-4 py-2 text-right">Actual</th>
                <th className="px-4 py-2 text-right">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {comparison.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No budgets or expenses recorded for this month.
                  </td>
                </tr>
              ) : (
                comparison.map((row) => (
                  <tr key={`${row.category}-${row.hostel_name || "common"}`}>
                    <td className="px-4 py-2 font-semibold">{row.category}</td>
                    <td className="px-4 py-2">{row.hostel_name || "Common"}</td>
                    <td className="px-4 py-2 text-right">{formatMoney(row.budgeted_amount)}</td>
                    <td className="px-4 py-2 text-right">{formatMoney(row.actual_amount)}</td>
                    <td
                      className={`px-4 py-2 text-right font-semibold ${
                        row.variance < 0 ? "text-red-600" : "text-emerald-700"
                      }`}
                    >
                      {formatMoney(row.variance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-slate-900">Standing Monthly Budgets</p>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white"
          >
            {showForm ? "Cancel" : "+ Set Budget"}
          </button>
        </div>

        {showForm && (
          <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
              >
                <option value="">Select category *</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

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
                value={monthlyAmount}
                onChange={(e) => setMonthlyAmount(e.target.value)}
                placeholder="Monthly budget amount *"
                className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
              />

              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none sm:col-span-3"
              />
            </div>

            {errorMessage && (
              <p className="mt-2 text-sm font-medium text-red-600">
                {errorMessage}
              </p>
            )}

            <button
              onClick={handleSetBudget}
              disabled={saving}
              className="mt-3 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Budget"}
            </button>
          </div>
        )}

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Hostel</th>
                <th className="px-4 py-2 text-right">Monthly Budget</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {budgetRows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                    No standing budgets set yet.
                  </td>
                </tr>
              ) : (
                budgetRows.map((b) => (
                  <tr key={b.budget_id}>
                    <td className="px-4 py-2 font-semibold">{b.category}</td>
                    <td className="px-4 py-2">{b.hostel_name || "Common"}</td>
                    <td className="px-4 py-2 text-right">
                      {formatMoney(b.monthly_budget_amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
