"use client";

import { useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";

type CommunicationRow = {
  communication_id: number;
  communication_type: string;
  note: string;
  created_by_name: string | null;
  created_at: string;
};

const TYPES = ["Call", "WhatsApp", "Email", "In-Person", "Other"];

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ResidentCommunications({
  residentId,
  initialEntries,
}: {
  residentId: number;
  initialEntries: CommunicationRow[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [communicationType, setCommunicationType] = useState("Call");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleAdd() {
    setErrorMessage("");

    if (!note.trim()) {
      setErrorMessage("Please enter a note.");
      return;
    }

    setSaving(true);

    try {
      const id = await callRpcClient<number>("add_resident_communication", {
        p_resident_id: residentId,
        p_communication_type: communicationType,
        p_note: note.trim(),
      });

      setEntries((prev) => [
        {
          communication_id: id,
          communication_type: communicationType,
          note: note.trim(),
          created_by_name: null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setNote("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to add note."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <select
          value={communicationType}
          onChange={(e) => setCommunicationType(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Add a note about a call, WhatsApp message, visit..."
          className="flex-1 min-w-[200px] rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />

        <button
          onClick={handleAdd}
          disabled={saving}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Adding..." : "+ Add"}
        </button>
      </div>

      {errorMessage && (
        <p className="mt-2 text-xs font-medium text-red-600">{errorMessage}</p>
      )}

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">No communication notes yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {entries.map((entry) => (
            <li
              key={entry.communication_id}
              className="rounded-xl border border-slate-100 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                  {entry.communication_type}
                </span>
                <span className="text-xs text-slate-400">
                  {formatDateTime(entry.created_at)}
                  {entry.created_by_name ? ` · ${entry.created_by_name}` : ""}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-700">{entry.note}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
