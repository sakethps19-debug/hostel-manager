"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { logAuditEvent } from "@/lib/audit";
import { callRpcClient } from "@/lib/supabase/callRpcClient";

export default function StartCleaningButton({ bedId }: { bedId: number }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleClick() {
    setErrorMessage("");
    setSaving(true);

    try {
      await callRpcClient("start_bed_cleaning", { p_bed_id: bedId });
      await logAuditEvent("bed_cleaning_started", "bed", bedId, {});
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update bed status."
      );
      setSaving(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={saving}
        className="mt-2 block w-full rounded-xl border border-cyan-200 px-4 py-2 text-center text-xs font-semibold text-cyan-700 hover:bg-cyan-50 disabled:opacity-50"
      >
        {saving ? "Updating..." : "Start Cleaning"}
      </button>

      {errorMessage && (
        <p className="mt-1 text-xs font-medium text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}
