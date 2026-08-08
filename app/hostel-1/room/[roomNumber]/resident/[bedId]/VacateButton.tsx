"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function VacateButton({
  bookingId,
  roomNumber,
}: {
  bookingId: number;
  roomNumber: string;
}) {
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleVacate() {
    setErrorMessage("");

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      setErrorMessage(
        "Supabase environment variables are missing."
      );
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        `${supabaseUrl}/rest/v1/rpc/vacate_bed`,
        {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_booking_id: bookingId,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      router.push(`/hostel-1/room/${roomNumber}`);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to vacate bed."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-xl border border-red-200 bg-white px-5 py-3 text-sm font-semibold text-red-600 hover:bg-red-50"
      >
        Vacate Bed
      </button>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-red-200 bg-red-50 p-5">
      <p className="font-semibold text-red-800">
        Vacate this bed?
      </p>

      <p className="mt-1 text-sm text-red-700">
        The booking will be marked completed and the bed will become available again.
      </p>

      {errorMessage && (
        <p className="mt-3 text-sm font-medium text-red-700">
          {errorMessage}
        </p>
      )}

      <div className="mt-4 flex gap-3">
        <button
          onClick={() => setConfirming(false)}
          disabled={saving}
          className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700"
        >
          Cancel
        </button>

        <button
          onClick={handleVacate}
          disabled={saving}
          className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Vacating..." : "Yes, Vacate Bed"}
        </button>
      </div>
    </div>
  );
}
