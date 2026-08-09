"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReviseRentButton({
  bookingId,
  currentRent,
}: {
  bookingId: number;
  currentRent: number;
}) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [newRent, setNewRent] = useState(String(currentRent));
  const [effectiveDate, setEffectiveDate] = useState(todayIsoDate());
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit() {
    setErrorMessage("");

    const rent = Number(newRent);

    if (!Number.isFinite(rent) || rent <= 0) {
      setErrorMessage("Please enter a valid new rent amount.");
      return;
    }

    if (!effectiveDate) {
      setErrorMessage("Please select an effective date.");
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

      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/revise_rent`, {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_booking_id: bookingId,
          p_new_rent: rent,
          p_effective_date: effectiveDate,
          p_reason: reason || null,
          p_notes: notes || null,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setOpen(false);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to revise rent."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Revise Rent
      </button>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
      <p className="font-semibold text-indigo-800">Revise Agreed Rent</p>
      <p className="mt-1 text-sm text-indigo-700">
        Current rent: Rs. {Number(currentRent).toLocaleString("en-IN")} / month
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-indigo-800">
            New Monthly Rent *
          </span>
          <input
            type="number"
            min="0"
            value={newRent}
            onChange={(e) => setNewRent(e.target.value)}
            className="w-full rounded-xl border border-indigo-200 px-4 py-2 outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-indigo-800">
            Effective From *
          </span>
          <input
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            className="w-full rounded-xl border border-indigo-200 px-4 py-2 outline-none"
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-sm font-semibold text-indigo-800">
          Reason
        </span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-xl border border-indigo-200 px-4 py-2 outline-none"
          placeholder="e.g. Annual increase, renewal, negotiated change"
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 block text-sm font-semibold text-indigo-800">
          Notes
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-xl border border-indigo-200 px-4 py-2 outline-none"
        />
      </label>

      {errorMessage && (
        <p className="mt-3 text-sm font-medium text-red-700">
          {errorMessage}
        </p>
      )}

      <div className="mt-4 flex gap-3">
        <button
          onClick={() => setOpen(false)}
          disabled={saving}
          className="rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700"
        >
          Cancel
        </button>

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Confirm Revision"}
        </button>
      </div>
    </div>
  );
}
