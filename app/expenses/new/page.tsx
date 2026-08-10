"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

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

const PAYMENT_MODES = ["Cash", "UPI", "Bank Transfer", "Other"];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewExpensePage() {
  const router = useRouter();

  const [hostelName, setHostelName] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayIsoDate());
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const amt = Number(amount);

    if (!category) {
      setErrorMessage("Please select a category.");
      return;
    }

    if (!Number.isFinite(amt) || amt <= 0) {
      setErrorMessage("Please enter a valid amount.");
      return;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      setErrorMessage("Supabase environment variables are missing.");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        `${supabaseUrl}/rest/v1/rpc/record_expense`,
        {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_hostel_name: hostelName || null,
            p_expense_date: expenseDate,
            p_category: category,
            p_amount: amt,
            p_vendor: vendor || null,
            p_payment_mode: paymentMode,
            p_reference_number: referenceNumber || null,
            p_notes: notes || null,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      router.push("/expenses");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to record expense."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <a
          href="/expenses"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Expenses
        </a>

        <div className="mt-7">
          <h1 className="text-4xl font-bold">Record Expense</h1>
          <p className="mt-2 text-slate-500">
            Security deposits and refunds are tracked separately as deposit
            transactions, not as expenses.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Hostel
              </span>
              <select
                value={hostelName}
                onChange={(e) => setHostelName(e.target.value)}
                className="input-style"
              >
                <option value="">Common / Consolidated</option>
                <option value="Hostel A">Hostel A</option>
                <option value="Hostel B">Hostel B</option>
                <option value="Hostel C">Hostel C</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Expense Date *
              </span>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="input-style"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Category *
              </span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="input-style"
                required
              >
                <option value="">Select category</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Amount *
              </span>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input-style"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Vendor / Payee
              </span>
              <input
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                className="input-style"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Payment Mode
              </span>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="input-style"
              >
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Reference Number
              </span>
              <input
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="input-style"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              Notes
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="input-style"
            />
          </label>

          {errorMessage && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {errorMessage}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <a
              href="/expenses"
              className="rounded-xl border border-slate-200 px-6 py-3 font-semibold hover:bg-slate-50"
            >
              Cancel
            </a>

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-indigo-600 px-7 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Expense"}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .input-style {
          width: 100%;
          border: 1px solid rgb(226 232 240);
          border-radius: 0.75rem;
          padding: 0.75rem 1rem;
          outline: none;
        }

        .input-style:focus {
          border-color: rgb(99 102 241);
          box-shadow: 0 0 0 2px rgb(224 231 255);
        }
      `}</style>
    </main>
  );
}
