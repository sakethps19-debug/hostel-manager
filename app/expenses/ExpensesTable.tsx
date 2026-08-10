"use client";

import { useMemo, useState } from "react";

type ExpenseRow = {
  expense_id: number;
  hostel_name: string | null;
  expense_date: string;
  category: string;
  amount: number;
  vendor: string | null;
  payment_mode: string;
  reference_number: string | null;
  notes: string | null;
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

export default function ExpensesTable({
  expenses,
}: {
  expenses: ExpenseRow[];
}) {
  const [hostelFilter, setHostelFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const hostelOptions = useMemo(
    () =>
      Array.from(
        new Set(expenses.map((e) => e.hostel_name).filter(Boolean))
      ).sort() as string[],
    [expenses]
  );

  const categoryOptions = useMemo(
    () => Array.from(new Set(expenses.map((e) => e.category))).sort(),
    [expenses]
  );

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      const matchesHostel = !hostelFilter || e.hostel_name === hostelFilter;
      const matchesCategory = !categoryFilter || e.category === categoryFilter;
      return matchesHostel && matchesCategory;
    });
  }, [expenses, hostelFilter, categoryFilter]);

  const filteredTotal = filtered.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap gap-3">
        <select
          value={hostelFilter}
          onChange={(e) => setHostelFilter(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">All Hostels</option>
          {hostelOptions.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">All Categories</option>
          {categoryOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-slate-500 shadow-sm">
          No expenses match.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Hostel</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((e) => (
                <tr key={e.expense_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDate(e.expense_date)}
                  </td>
                  <td className="px-4 py-3">{e.hostel_name || "Common"}</td>
                  <td className="px-4 py-3">{e.category}</td>
                  <td className="px-4 py-3">{e.vendor || "-"}</td>
                  <td className="px-4 py-3">{e.payment_mode}</td>
                  <td className="px-4 py-3">{e.reference_number || "-"}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatMoney(e.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td colSpan={6} className="px-4 py-3 text-right font-semibold">
                  Total
                </td>
                <td className="px-4 py-3 text-right font-bold">
                  {formatMoney(filteredTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
