"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { logAuditEvent } from "@/lib/audit";
import { callRpcClient } from "@/lib/supabase/callRpcClient";

export default function ReleaseHoldButton({
  bedId,
  className,
}: {
  bedId: number;
  className?: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleClick() {
    setErrorMessage("");
    setSaving(true);

    try {
      await callRpcClient("release_bed_hold", { p_bed_id: bedId });
      await logAuditEvent("bed_hold_released", "bed", bedId, {});
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to release hold."
      );
      setSaving(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={saving}
        className={
          className ||
          "mt-6 block w-full rounded-xl bg-violet-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        }
      >
        {saving ? "Updating..." : "Release Hold"}
      </button>

      {errorMessage && (
        <p className="mt-2 text-xs font-medium text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}
