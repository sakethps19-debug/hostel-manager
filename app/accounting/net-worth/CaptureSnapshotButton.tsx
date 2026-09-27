"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";

export default function CaptureSnapshotButton({ hostelName }: { hostelName: string | null }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleCapture() {
    setErrorMessage("");
    setSaving(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await callRpcClient("capture_balance_snapshot", {
        p_snapshot_date: today,
        p_hostel_name: hostelName,
      });
      await logAuditEvent("balance_snapshot_captured", "accounting", null, { snapshot_date: today, hostel_name: hostelName });
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to capture snapshot.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="text-right">
      <button
        onClick={handleCapture}
        disabled={saving}
        className="rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
      >
        {saving ? "Capturing..." : "Capture Today's Snapshot"}
      </button>
      {errorMessage && <p className="mt-1 text-xs font-medium text-red-600">{errorMessage}</p>}
    </div>
  );
}
