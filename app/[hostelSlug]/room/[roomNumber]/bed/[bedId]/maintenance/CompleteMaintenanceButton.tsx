"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function CompleteMaintenanceButton({
  maintenanceId,
  hostelSlug,
  roomNumber,
}: {
  maintenanceId: number;
  hostelSlug: string;
  roomNumber: string;
}) {
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const [completionDate, setCompletionDate] = useState(todayIsoDate());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleComplete() {
    setErrorMessage("");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      setErrorMessage("Supabase environment variables are missing.");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        `${supabaseUrl}/rest/v1/rpc/complete_maintenance`,
        {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_maintenance_id: maintenanceId,
            p_actual_completion_date: completionDate,
            p_notes: notes,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      router.push(`/${hostelSlug}/room/${roomNumber}`);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to complete maintenance."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
      >
        Complete Maintenance
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <p className="font-semibold text-emerald-800">
        Mark maintenance as complete?
      </p>
      <p className="mt-1 text-sm text-emerald-700">
        The bed will become available for booking again.
      </p>

      <label className="mt-3 block">
        <span className="mb-1 block text-sm font-semibold text-emerald-800">
          Completion Date
        </span>
        <input
          type="date"
          value={completionDate}
          onChange={(e) => setCompletionDate(e.target.value)}
          className="w-full rounded-xl border border-emerald-200 px-4 py-2 outline-none"
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 block text-sm font-semibold text-emerald-800">
          Notes
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-xl border border-emerald-200 px-4 py-2 outline-none"
        />
      </label>

      {errorMessage && (
        <p className="mt-3 text-sm font-medium text-red-700">
          {errorMessage}
        </p>
      )}

      <div className="mt-4 flex gap-3">
        <button
          onClick={() => setConfirming(false)}
          disabled={saving}
          className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700"
        >
          Cancel
        </button>

        <button
          onClick={handleComplete}
          disabled={saving}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Yes, Complete"}
        </button>
      </div>
    </div>
  );
}
