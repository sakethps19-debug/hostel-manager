"use client";

import { useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";

export default function DeclarationTextForm({
  initialText,
}: {
  initialText: string;
}) {
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  async function handleSave() {
    setErrorMessage("");
    setSavedMessage("");

    if (!text.trim()) {
      setErrorMessage("Please enter a declaration.");
      return;
    }

    setSaving(true);

    try {
      await callRpcClient("set_text_setting", {
        p_key: "admission_form_declaration",
        p_value: text.trim(),
      });

      await logAuditEvent("application_form_declaration_updated", "app_text_setting", null, {});

      setSavedMessage("Saved.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500"
      />

      {errorMessage && (
        <p className="mt-3 text-sm font-medium text-red-600">{errorMessage}</p>
      )}
      {savedMessage && (
        <p className="mt-3 text-sm font-medium text-emerald-600">{savedMessage}</p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Declaration"}
      </button>
    </section>
  );
}
