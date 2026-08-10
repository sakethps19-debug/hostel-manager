"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { logAuditEvent } from "@/lib/audit";
import { callRpcClient } from "@/lib/supabase/callRpcClient";

const DURATIONS = [
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "4 hours", minutes: 240 },
  { label: "24 hours", minutes: 1440 },
];

export default function HoldForm({
  hostelSlug,
  roomNumber,
  bedId,
}: {
  hostelSlug: string;
  roomNumber: string;
  bedId: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [prospectName, setProspectName] = useState(
    searchParams.get("name") || ""
  );
  const [prospectMobile, setProspectMobile] = useState(
    searchParams.get("mobile") || ""
  );
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const enquiryId = searchParams.get("enquiryId");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!prospectName.trim()) {
      setErrorMessage("Please enter the prospect's name.");
      return;
    }

    try {
      setSaving(true);

      await callRpcClient("create_bed_hold", {
        p_bed_id: bedId,
        p_enquiry_id: enquiryId ? Number(enquiryId) : null,
        p_prospect_name: prospectName,
        p_prospect_mobile: prospectMobile || null,
        p_hold_minutes: durationMinutes,
        p_notes: notes || null,
      });

      await logAuditEvent("bed_hold_created", "bed", bedId, {
        prospect_name: prospectName,
        duration_minutes: durationMinutes,
      });

      router.push(`/${hostelSlug}/room/${roomNumber}`);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to hold this bed."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-8 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          Prospect Name *
        </span>
        <input
          value={prospectName}
          onChange={(e) => setProspectName(e.target.value)}
          className="input-style"
          required
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          Mobile Number
        </span>
        <input
          value={prospectMobile}
          onChange={(e) => setProspectMobile(e.target.value)}
          className="input-style"
          placeholder="10-digit mobile number"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          Hold Duration *
        </span>
        <select
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(Number(e.target.value))}
          className="input-style"
        >
          {DURATIONS.map((d) => (
            <option key={d.minutes} value={d.minutes}>
              {d.label}
            </option>
          ))}
        </select>
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
          className="rounded-xl bg-violet-600 px-7 py-3 font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
        >
          {saving ? "Holding..." : "Hold This Bed"}
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
          border-color: rgb(139 92 246);
          box-shadow: 0 0 0 2px rgb(237 233 254);
        }
      `}</style>
    </form>
  );
}
