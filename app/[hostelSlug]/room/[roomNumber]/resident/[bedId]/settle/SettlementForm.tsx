"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { logAuditEvent } from "@/lib/audit";

const DEDUCTION_CATEGORIES = [
  "Damage",
  "Cleaning",
  "Lost Item",
  "Outstanding Rent",
  "Other",
];

type Deduction = {
  category: string;
  amount: string;
  notes: string;
};

function formatMoney(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

export default function SettlementForm({
  hostelSlug,
  roomNumber,
  bedId,
  bookingId,
  residentName,
  hostelName,
  bedLabel,
  outstandingRent,
  depositHeld,
}: {
  hostelSlug: string;
  roomNumber: string;
  bedId: string;
  bookingId: number;
  residentName: string;
  hostelName: string;
  bedLabel: string;
  outstandingRent: number;
  depositHeld: number;
}) {
  const router = useRouter();

  const [otherCharges, setOtherCharges] = useState("0");
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const deductionsTotal = useMemo(
    () =>
      deductions.reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
    [deductions]
  );

  const otherChargesNumber = Number(otherCharges) || 0;

  const finalBalance =
    depositHeld - outstandingRent - otherChargesNumber - deductionsTotal;

  const refundAmount = Math.max(finalBalance, 0);
  const amountOwedByResident = Math.max(-finalBalance, 0);

  function addDeduction() {
    setDeductions([...deductions, { category: "Damage", amount: "", notes: "" }]);
  }

  function updateDeduction(index: number, field: keyof Deduction, value: string) {
    const next = [...deductions];
    next[index] = { ...next[index], [field]: value };
    setDeductions(next);
  }

  function removeDeduction(index: number) {
    setDeductions(deductions.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    for (const d of deductions) {
      if (!d.amount || Number(d.amount) <= 0) {
        setErrorMessage(
          "Each deduction must have an amount greater than zero."
        );
        return;
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      setErrorMessage("Supabase environment variables are missing.");
      return;
    }

    try {
      setSaving(true);

      const settleResponse = await fetch(
        `${supabaseUrl}/rest/v1/rpc/finalize_settlement`,
        {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_booking_id: bookingId,
            p_other_charges: otherChargesNumber,
            p_deductions: deductions.map((d) => ({
              category: d.category,
              amount: Number(d.amount),
              notes: d.notes,
            })),
            p_notes: notes,
          }),
        }
      );

      if (!settleResponse.ok) {
        throw new Error(await settleResponse.text());
      }

      const vacateResponse = await fetch(
        `${supabaseUrl}/rest/v1/rpc/vacate_bed`,
        {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ p_booking_id: bookingId }),
        }
      );

      if (!vacateResponse.ok) {
        throw new Error(await vacateResponse.text());
      }

      await logAuditEvent("resident_vacated", "booking", bookingId, {
        refund_amount: refundAmount,
        amount_owed: amountOwedByResident,
      });

      router.push(`/${hostelSlug}/room/${roomNumber}`);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to finalize settlement."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
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

          <h1 className="mt-2 text-4xl font-bold">Vacate / Final Settlement</h1>

          <p className="mt-2 text-slate-500">{residentName}</p>
        </div>

        {!confirming ? (
          <div className="mt-10 space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-400">
                  Outstanding Rent
                </p>
                <p className="mt-2 text-2xl font-bold text-red-600">
                  {formatMoney(outstandingRent)}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-400">
                  Security Deposit Held
                </p>
                <p className="mt-2 text-2xl font-bold">
                  {formatMoney(depositHeld)}
                </p>
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Other Charges
              </span>
              <input
                type="number"
                min="0"
                step="1"
                value={otherCharges}
                onChange={(e) => setOtherCharges(e.target.value)}
                className="input-style"
              />
            </label>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">
                  Deductions
                </span>
                <button
                  type="button"
                  onClick={addDeduction}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                >
                  + Add Deduction
                </button>
              </div>

              {deductions.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No deductions added.
                </p>
              ) : (
                <div className="space-y-3">
                  {deductions.map((d, index) => (
                    <div
                      key={index}
                      className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_1.5fr_auto]"
                    >
                      <select
                        value={d.category}
                        onChange={(e) =>
                          updateDeduction(index, "category", e.target.value)
                        }
                        className="input-style"
                      >
                        {DEDUCTION_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>

                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="Amount"
                        value={d.amount}
                        onChange={(e) =>
                          updateDeduction(index, "amount", e.target.value)
                        }
                        className="input-style"
                      />

                      <input
                        type="text"
                        placeholder="Notes"
                        value={d.notes}
                        onChange={(e) =>
                          updateDeduction(index, "notes", e.target.value)
                        }
                        className="input-style"
                      />

                      <button
                        type="button"
                        onClick={() => removeDeduction(index)}
                        className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
                placeholder="Any additional context for this settlement"
              />
            </label>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Deposit Held</span>
                <span>{formatMoney(depositHeld)}</span>
              </div>
              <div className="mt-1 flex justify-between text-sm text-slate-600">
                <span>Less: Outstanding Rent</span>
                <span>- {formatMoney(outstandingRent)}</span>
              </div>
              <div className="mt-1 flex justify-between text-sm text-slate-600">
                <span>Less: Other Charges</span>
                <span>- {formatMoney(otherChargesNumber)}</span>
              </div>
              <div className="mt-1 flex justify-between text-sm text-slate-600">
                <span>Less: Deductions</span>
                <span>- {formatMoney(deductionsTotal)}</span>
              </div>

              <div className="mt-3 border-t border-slate-200 pt-3">
                {amountOwedByResident > 0 ? (
                  <div className="flex justify-between text-lg font-bold text-red-600">
                    <span>Amount Owed by Resident</span>
                    <span>{formatMoney(amountOwedByResident)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between text-lg font-bold text-emerald-600">
                    <span>Refund Amount</span>
                    <span>{formatMoney(refundAmount)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <a
                href={`/${hostelSlug}/room/${roomNumber}/resident/${bedId}`}
                className="rounded-xl border border-slate-200 px-6 py-3 font-semibold hover:bg-slate-50"
              >
                Cancel
              </a>

              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-xl bg-red-600 px-7 py-3 font-semibold text-white shadow-sm hover:bg-red-700"
              >
                Review & Confirm
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-10 space-y-6 rounded-2xl border border-red-200 bg-red-50 p-6"
          >
            <p className="font-semibold text-red-800">
              Confirm final settlement and vacate this bed?
            </p>

            <p className="text-sm text-red-700">
              This will mark the booking as completed, free the bed, and
              {refundAmount > 0
                ? ` record a refund payment of ${formatMoney(refundAmount)}.`
                : " record the final settlement."}{" "}
              This cannot be undone from this screen, but all records
              remain visible in the booking's history.
            </p>

            {errorMessage && (
              <div className="rounded-xl border border-red-300 bg-white px-4 py-3 text-sm font-medium text-red-700">
                {errorMessage}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={saving}
                className="rounded-xl border border-red-200 bg-white px-6 py-3 font-semibold text-red-700"
              >
                Back
              </button>

              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-red-600 px-7 py-3 font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Finalizing..." : "Confirm Settlement & Vacate"}
              </button>
            </div>
          </form>
        )}
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
