"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function MaintenanceForm({
  bedId,
  hostelSlug,
  roomNumber,
}: {
  bedId: number;
  hostelSlug: string;
  roomNumber: string;
}) {
  const router = useRouter();

  const [reason, setReason] = useState("");
  const [startDate, setStartDate] = useState(todayIsoDate());
  const [expectedCompletionDate, setExpectedCompletionDate] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!reason.trim()) {
      setErrorMessage("Please enter a reason for maintenance.");
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

      const response = await fetch(
        `${supabaseUrl}/rest/v1/rpc/start_maintenance`,
        {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_bed_id: bedId,
            p_reason: reason,
            p_start_date: startDate,
            p_expected_completion_date: expectedCompletionDate || null,
            p_notes: notes,
            p_cost: cost ? Number(cost) : null,
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
        error instanceof Error ? error.message : "Unable to start maintenance."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-10 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-xl font-bold">Mark Bed for Maintenance</h2>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          Reason *
        </span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="input-style"
          placeholder="e.g. Broken bed frame, pest control, painting"
          required
        />
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">
            Start Date *
          </span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="input-style"
            required
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">
            Expected Completion Date
          </span>
          <input
            type="date"
            value={expectedCompletionDate}
            onChange={(e) => setExpectedCompletionDate(e.target.value)}
            className="input-style"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          Cost (optional)
        </span>
        <input
          type="number"
          min="0"
          step="1"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          className="input-style"
        />
      </label>

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
          href={`/${hostelSlug}/room/${roomNumber}`}
          className="rounded-xl border border-slate-200 px-6 py-3 font-semibold hover:bg-slate-50"
        >
          Cancel
        </a>

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-slate-700 px-7 py-3 font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Start Maintenance"}
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
