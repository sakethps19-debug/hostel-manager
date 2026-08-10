"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { logAuditEvent } from "@/lib/audit";
import { callRpcClient } from "@/lib/supabase/callRpcClient";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function MarkNoShowButton({
  bookingId,
  redirectHref,
}: {
  bookingId: number;
  redirectHref: string;
}) {
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const [noShowDate, setNoShowDate] = useState(todayIsoDate());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleConfirm() {
    setErrorMessage("");

    try {
      setSaving(true);

      await callRpcClient("mark_booking_no_show", {
        p_booking_id: bookingId,
        p_no_show_date: noShowDate,
        p_notes: notes || null,
      });

      await logAuditEvent("booking_marked_no_show", "booking", bookingId, {
        no_show_date: noShowDate,
      });

      router.push(redirectHref);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to mark as no-show."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-xl border border-amber-200 bg-white px-5 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-50"
      >
        Mark as No-Show
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <p className="font-semibold text-amber-800">
        Mark this reservation as a no-show?
      </p>
      <p className="mt-1 text-sm text-amber-700">
        The booking history, and any payment or deposit already recorded, is
        kept — only the bed is released for booking again.
      </p>

      <label className="mt-3 block">
        <span className="mb-1 block text-sm font-semibold text-amber-800">
          No-Show Date
        </span>
        <input
          type="date"
          value={noShowDate}
          onChange={(e) => setNoShowDate(e.target.value)}
          className="w-full rounded-xl border border-amber-200 px-4 py-2 outline-none"
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 block text-sm font-semibold text-amber-800">
          Notes
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-xl border border-amber-200 px-4 py-2 outline-none"
        />
      </label>

      {errorMessage && (
        <p className="mt-3 text-sm font-medium text-red-700">{errorMessage}</p>
      )}

      <div className="mt-4 flex gap-3">
        <button
          onClick={() => setConfirming(false)}
          disabled={saving}
          className="rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-700"
        >
          Cancel
        </button>

        <button
          onClick={handleConfirm}
          disabled={saving}
          className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Yes, Mark No-Show"}
        </button>
      </div>
    </div>
  );
}
