"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { logAuditEvent } from "@/lib/audit";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import DuplicatePaymentWarning from "@/components/DuplicatePaymentWarning";

const PAYMENT_TYPES = [
  "Monthly Rent",
  "Security Deposit",
  "Deposit Refund",
  "Other Charge",
  "Adjustment",
];

const PAYMENT_MODES = ["Cash", "UPI", "Bank Transfer", "Other"];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function PaymentForm({
  hostelSlug,
  roomNumber,
  bedId,
  bookingId,
  residentName,
  hostelName,
  bedLabel,
  monthlyRent,
}: {
  hostelSlug: string;
  roomNumber: string;
  bedId: string;
  bookingId: number;
  residentName: string;
  hostelName: string;
  bedLabel: string;
  monthlyRent: number;
}) {
  const router = useRouter();

  const [paymentType, setPaymentType] = useState("Monthly Rent");
  const [amount, setAmount] = useState(
    monthlyRent > 0 ? String(monthlyRent) : ""
  );
  const [paymentDate, setPaymentDate] = useState(todayIsoDate());
  const [paymentForMonth, setPaymentForMonth] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [duplicateOkToProceed, setDuplicateOkToProceed] = useState(true);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setErrorMessage("Please enter an amount greater than zero.");
      return;
    }

    if (!paymentDate) {
      setErrorMessage("Payment date is required.");
      return;
    }

    if (!paymentMode) {
      setErrorMessage("Please select a payment mode.");
      return;
    }

    try {
      setSaving(true);

      const paymentId = await callRpcClient<number>("record_payment", {
        p_booking_id: bookingId,
        p_amount: numericAmount,
        p_payment_date: paymentDate,
        p_payment_for_month: paymentForMonth ? `${paymentForMonth}-01` : null,
        p_payment_type: paymentType,
        p_payment_mode: paymentMode,
        p_reference_number: referenceNumber,
        p_notes: notes,
      });

      await logAuditEvent("payment_recorded", "payment", bookingId, {
        amount: numericAmount,
        payment_type: paymentType,
        payment_mode: paymentMode,
      });

      // Books the accounting consequence (Dr Cash/Bank, Cr the relevant
      // receivable/liability/income account) - best-effort second step,
      // same pattern as logAuditEvent above; the Reconciliation page's
      // unjournaled-payment check catches anything that fails to post here.
      try {
        await callRpcClient("post_payment_journal", { p_payment_id: paymentId });
      } catch {
        // surfaced via the Reconciliation page, not here
      }

      router.push(`/${hostelSlug}/room/${roomNumber}/resident/${bedId}`);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to record payment."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <a
          href={`/${hostelSlug}/room/${roomNumber}/resident/${bedId}`}
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Resident Details
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            {hostelName} · {bedLabel}
          </p>

          <h1 className="mt-2 text-4xl font-bold">Record Payment</h1>

          <p className="mt-2 text-slate-500">{residentName}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-10 space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Payment Type *">
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                className="input-style"
                required
              >
                {PAYMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Amount *">
              <input
                type="number"
                min="0"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input-style"
                required
              />
            </Field>

            <Field label="Payment Date *">
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="input-style"
                required
              />
            </Field>

            <Field label="Payment For Month">
              <input
                type="month"
                value={paymentForMonth}
                onChange={(e) => setPaymentForMonth(e.target.value)}
                className="input-style"
              />
            </Field>

            <Field label="Payment Mode *">
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="input-style"
                required
              >
                <option value="">Select mode</option>
                {PAYMENT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Transaction / Reference Number">
              <input
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="input-style"
                placeholder="UPI ref, cheque no., etc."
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="input-style"
              placeholder="Any additional context for this payment"
            />
          </Field>

          <DuplicatePaymentWarning
            bookingId={bookingId}
            amount={amount}
            paymentDate={paymentDate}
            paymentMode={paymentMode}
            referenceNumber={referenceNumber}
            onAcknowledgeChange={setDuplicateOkToProceed}
          />

          {errorMessage && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {errorMessage}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <a
              href={`/${hostelSlug}/room/${roomNumber}/resident/${bedId}`}
              className="rounded-xl border border-slate-200 px-6 py-3 font-semibold hover:bg-slate-50"
            >
              Cancel
            </a>

            <button
              type="submit"
              disabled={saving || !duplicateOkToProceed}
              className="rounded-xl bg-indigo-600 px-7 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Record Payment"}
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}
