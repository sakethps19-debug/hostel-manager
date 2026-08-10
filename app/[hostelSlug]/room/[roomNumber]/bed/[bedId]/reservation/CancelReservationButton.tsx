"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { logAuditEvent } from "@/lib/audit";

export default function CancelReservationButton({
  bookingId,
  redirectHref,
}: {
  bookingId: number;
  redirectHref: string;
}) {
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleCancel() {
    setErrorMessage("");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      setErrorMessage("Supabase environment variables are missing.");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/cancel_booking`, {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_booking_id: bookingId,
          p_reason: reason || null,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      await logAuditEvent("reservation_cancelled", "booking", bookingId, {
        reason,
      });

      router.push(redirectHref);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to cancel reservation."
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
        Cancel Reservation
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
      <p className="font-semibold text-red-800">Cancel this reservation?</p>
      <p className="mt-1 text-sm text-red-700">
        The bed will become available for booking again. This cannot be undone.
      </p>

      <label className="mt-3 block">
        <span className="mb-1 block text-sm font-semibold text-red-800">
          Reason
        </span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-xl border border-red-200 px-4 py-2 outline-none"
          placeholder="e.g. Resident backed out, duplicate booking"
        />
      </label>

      {errorMessage && (
        <p className="mt-3 text-sm font-medium text-red-700">{errorMessage}</p>
      )}

      <div className="mt-4 flex gap-3">
        <button
          onClick={() => setConfirming(false)}
          disabled={saving}
          className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700"
        >
          Keep Reservation
        </button>

        <button
          onClick={handleCancel}
          disabled={saving}
          className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Cancelling..." : "Yes, Cancel"}
        </button>
      </div>
    </div>
  );
}
