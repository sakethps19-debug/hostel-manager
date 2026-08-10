"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { logAuditEvent } from "@/lib/audit";
import { callRpcClient } from "@/lib/supabase/callRpcClient";

export default function GiveNoticeButton({
  bookingId,
}: {
  bookingId: number;
}) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [expectedVacateDate, setExpectedVacateDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit() {
    setErrorMessage("");

    if (!expectedVacateDate) {
      setErrorMessage("Please select an expected vacate date.");
      return;
    }

    try {
      setSaving(true);

      await callRpcClient("give_notice", {
        p_booking_id: bookingId,
        p_expected_vacate_date: expectedVacateDate,
        p_notes: notes,
      });

      await logAuditEvent("notice_given", "booking", bookingId, {
        expected_vacate_date: expectedVacateDate,
      });

      setOpen(false);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to record notice."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl border border-amber-200 bg-white px-5 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-50"
      >
        Give Notice
      </button>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <p className="font-semibold text-amber-800">Record vacating notice</p>

      <label className="mt-3 block">
        <span className="mb-1 block text-sm font-semibold text-amber-800">
          Expected Vacate Date *
        </span>
        <input
          type="date"
          value={expectedVacateDate}
          onChange={(e) => setExpectedVacateDate(e.target.value)}
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
        <p className="mt-3 text-sm font-medium text-red-700">
          {errorMessage}
        </p>
      )}

      <div className="mt-4 flex gap-3">
        <button
          onClick={() => setOpen(false)}
          disabled={saving}
          className="rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-700"
        >
          Cancel
        </button>

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Confirm Notice"}
        </button>
      </div>
    </div>
  );
}
