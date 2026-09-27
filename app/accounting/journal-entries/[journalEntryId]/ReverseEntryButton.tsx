"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";

export default function ReverseEntryButton({ journalEntryId }: { journalEntryId: number }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleReverse() {
    setErrorMessage("");
    setSaving(true);
    try {
      const reversalId = await callRpcClient<number>("accounting_reverse_entry", {
        p_journal_entry_id: journalEntryId,
        p_reason: reason || null,
      });

      await logAuditEvent("journal_entry_reversed", "journal_entry", journalEntryId, { reason });

      router.push(`/accounting/journal-entries/${reversalId}`);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to reverse entry.");
    } finally {
      setSaving(false);
    }
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
      >
        Reverse This Entry
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
      <p className="text-sm text-slate-600">
        Posts an equal-and-opposite entry dated today and marks this one reversed. Historical entries
        are never edited in place — this is the only way to correct a mistake once posted.
      </p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for reversal"
        className="mt-3 w-full rounded-xl border border-red-200 px-3 py-2 text-sm outline-none"
      />
      {errorMessage && <p className="mt-2 text-sm font-medium text-red-700">{errorMessage}</p>}
      <div className="mt-3 flex gap-3">
        <button
          onClick={() => setShowForm(false)}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          onClick={handleReverse}
          disabled={saving}
          className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Reversing..." : "Confirm Reversal"}
        </button>
      </div>
    </div>
  );
}
