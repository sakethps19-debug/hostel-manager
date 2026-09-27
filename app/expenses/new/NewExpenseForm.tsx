"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { logAuditEvent } from "@/lib/audit";
import { callRpcClient } from "@/lib/supabase/callRpcClient";

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

export default function NewExpenseForm({
  hostelNames,
  vendorNames,
}: {
  hostelNames: string[];
  vendorNames: string[];
}) {
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

    try {
      setSaving(true);

      const created = await callRpcClient<{ id: number }>("record_expense", {
        p_hostel_name: hostelName || null,
        p_expense_date: expenseDate,
        p_category: category,
        p_amount: amt,
        p_vendor: vendor || null,
        p_payment_mode: paymentMode,
        p_reference_number: referenceNumber || null,
        p_notes: notes || null,
      });

      await logAuditEvent("expense_recorded", "expense", created?.id ?? null, {
        category,
        amount: amt,
        hostel_name: hostelName || "Common",
      });

      if (created?.id) {
        // Books Dr <category account> / Cr Cash-Bank - best-effort second
        // step, same pattern as logAuditEvent above; the Reconciliation
        // page's unjournaled-expense check catches anything that fails here.
        try {
          await callRpcClient("post_expense_journal", { p_expense_id: created.id });
        } catch {
          // surfaced via the Reconciliation page, not here
        }
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
            {hostelNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
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
            list="vendor-names"
            className="input-style"
          />
          <datalist id="vendor-names">
            {vendorNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
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
    </form>
  );
}
