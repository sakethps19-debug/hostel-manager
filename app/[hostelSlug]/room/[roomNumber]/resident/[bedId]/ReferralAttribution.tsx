"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { logAuditEvent } from "@/lib/audit";
import { callRpcClient } from "@/lib/supabase/callRpcClient";

type ReferralSourceRow = {
  referral_source_id: number;
  name: string;
  source_type: string;
};

type CurrentReferral = {
  referral_source_id: number;
  referral_source_name: string;
  commission_amount: number | null;
  notes: string | null;
};

export default function ReferralAttribution({
  bookingId,
  sources,
  current,
}: {
  bookingId: number;
  sources: ReferralSourceRow[];
  current: CurrentReferral | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState(
    current ? String(current.referral_source_id) : ""
  );
  const [commission, setCommission] = useState(
    current?.commission_amount != null ? String(current.commission_amount) : ""
  );
  const [notes, setNotes] = useState(current?.notes || "");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  function handleOpen() {
    // Re-seed from the current prop each time the form opens, since a
    // previous save/remove updates `current` via router.refresh() without
    // remounting this component - without this, reopening the form after
    // a change shows stale values from before that change.
    setSourceId(current ? String(current.referral_source_id) : "");
    setCommission(
      current?.commission_amount != null ? String(current.commission_amount) : ""
    );
    setNotes(current?.notes || "");
    setErrorMessage("");
    setOpen(true);
  }

  async function handleSave() {
    setErrorMessage("");

    if (!sourceId) {
      setErrorMessage("Please select a referral source.");
      return;
    }

    setSaving(true);

    try {
      const commissionValue = commission !== "" ? Number(commission) : null;

      await callRpcClient("set_booking_referral", {
        p_booking_id: bookingId,
        p_referral_source_id: Number(sourceId),
        p_commission_amount: commissionValue,
        p_notes: notes || null,
      });

      const sourceName = sources.find(
        (s) => s.referral_source_id === Number(sourceId)
      )?.name;

      await logAuditEvent("booking_referral_set", "booking", bookingId, {
        referral_source_name: sourceName,
        commission_amount: commissionValue,
      });

      setOpen(false);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save referral."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    setErrorMessage("");

    try {
      await callRpcClient("remove_booking_referral", { p_booking_id: bookingId });
      await logAuditEvent("booking_referral_removed", "booking", bookingId, {});
      setOpen(false);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to remove referral."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        {current ? `Referral: ${current.referral_source_name}` : "Attribute Referral"}
      </button>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
      <p className="font-semibold text-indigo-800">Referral / Broker Attribution</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-indigo-800">
            Referral Source *
          </span>
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="w-full rounded-xl border border-indigo-200 px-4 py-2 outline-none"
          >
            <option value="">Select a source</option>
            {sources.map((s) => (
              <option key={s.referral_source_id} value={s.referral_source_id}>
                {s.name} ({s.source_type})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-indigo-800">
            Commission Amount
          </span>
          <input
            type="number"
            min="0"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            className="w-full rounded-xl border border-indigo-200 px-4 py-2 outline-none"
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-sm font-semibold text-indigo-800">
          Notes
        </span>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-xl border border-indigo-200 px-4 py-2 outline-none"
        />
      </label>

      {sources.length === 0 && (
        <p className="mt-2 text-sm text-indigo-700">
          No referral sources set up yet — add one on the{" "}
          <a href="/settings/referrals" className="font-semibold underline">
            Referral Sources
          </a>{" "}
          page first.
        </p>
      )}

      {errorMessage && (
        <p className="mt-3 text-sm font-medium text-red-700">{errorMessage}</p>
      )}

      <div className="mt-4 flex gap-3">
        <button
          onClick={() => setOpen(false)}
          disabled={saving}
          className="rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700"
        >
          Cancel
        </button>

        {current && (
          <button
            onClick={handleRemove}
            disabled={saving}
            className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600"
          >
            Remove
          </button>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
