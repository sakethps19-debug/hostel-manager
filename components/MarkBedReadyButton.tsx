"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { logAuditEvent } from "@/lib/audit";
import { callRpcClient } from "@/lib/supabase/callRpcClient";

export default function MarkBedReadyButton({ bedId }: { bedId: number }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleClick() {
    setErrorMessage("");
    setSaving(true);

    try {
      await callRpcClient("mark_bed_ready", { p_bed_id: bedId });
      await logAuditEvent("bed_marked_ready", "bed", bedId, {});
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
        className="mt-6 block w-full rounded-xl bg-cyan-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
      >
        {saving ? "Updating..." : "Mark Ready for Booking"}
      </button>

      {errorMessage && (
        <p className="mt-2 text-xs font-medium text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}
