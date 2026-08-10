"use client";

import { useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";

export default function FeatureFlagToggle({
  flagKey,
  initialEnabled,
}: {
  flagKey: string;
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function toggle() {
    const next = !enabled;
    setErrorMessage("");
    setSaving(true);

    try {
      await callRpcClient("set_feature_flag", {
        p_key: flagKey,
        p_enabled: next,
      });
      await logAuditEvent("feature_flag_changed", "feature_flag", null, {
        key: flagKey,
        enabled: next,
      });
      setEnabled(next);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update flag."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <button
        onClick={toggle}
        disabled={saving}
        className={`rounded-full px-4 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
          enabled
            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
        }`}
      >
        {enabled ? "Enabled" : "Disabled"}
      </button>

      {errorMessage && (
        <p className="mt-1 text-xs font-medium text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}
