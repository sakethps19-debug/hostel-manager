"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { logAuditEvent } from "@/lib/audit";
import { callRpcClient } from "@/lib/supabase/callRpcClient";

type ResidentForUpdate = {
  booking_id: number;
  full_name: string;
  mobile_number: string | null;
  email: string | null;
  emergency_contact: string | null;
  id_proof_type: string | null;
  id_proof_number: string | null;
  home_address: string | null;
  work_college_address: string | null;
  notes: string | null;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  security_deposit: number | null;
};

function dayAfter(date: string) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function ExtendStayButton({
  resident,
}: {
  resident: ResidentForUpdate;
}) {
  const router = useRouter();

  const minEndDate = dayAfter(resident.end_date);
  const [open, setOpen] = useState(false);
  const [newEndDate, setNewEndDate] = useState(minEndDate);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit() {
    setErrorMessage("");

    if (!newEndDate) {
      setErrorMessage("Please select a new end date.");
      return;
    }

    if (new Date(newEndDate) <= new Date(resident.end_date)) {
      setErrorMessage(
        "The new end date must be after the current end date."
      );
      return;
    }

    try {
      setSaving(true);

      try {
        await callRpcClient("update_booking_details", {
          p_booking_id: resident.booking_id,
          p_full_name: resident.full_name,
          p_mobile_number: resident.mobile_number,
          p_email: resident.email,
          p_emergency_contact: resident.emergency_contact,
          p_id_proof_type: resident.id_proof_type,
          p_id_proof_number: resident.id_proof_number,
          p_home_address: resident.home_address,
          p_work_college_address: resident.work_college_address,
          p_notes: resident.notes,
          p_start_date: resident.start_date,
          p_end_date: newEndDate,
          p_monthly_rent: resident.monthly_rent,
          p_security_deposit: resident.security_deposit || 0,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        if (message.includes("already booked")) {
          throw new Error(
            "This bed is already booked for part of the requested period."
          );
        }

        throw err;
      }

      await logAuditEvent("booking_extended", "booking", resident.booking_id, {
        old_end_date: resident.end_date,
        new_end_date: newEndDate,
      });

      setOpen(false);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to extend stay."
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
        Extend Stay
      </button>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
      <p className="font-semibold text-indigo-800">Extend Stay</p>
      <p className="mt-1 text-sm text-indigo-700">
        Current end date: {resident.end_date}
      </p>

      <label className="mt-3 block">
        <span className="mb-1 block text-sm font-semibold text-indigo-800">
          New End Date *
        </span>
        <input
          type="date"
          value={newEndDate}
          onChange={(e) => setNewEndDate(e.target.value)}
          min={minEndDate}
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
          {saving ? "Saving..." : "Confirm Extension"}
        </button>
      </div>
    </div>
  );
}
