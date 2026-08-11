"use client";

import { useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";

type ReferralSourceRow = {
  referral_source_id: number;
  name: string;
  contact_number: string | null;
  source_type: string;
  notes: string | null;
};

const SOURCE_TYPES = ["Broker", "Referral", "Other"];

export default function ReferralSourcesTable({
  sources,
}: {
  sources: ReferralSourceRow[];
}) {
  const [rows, setRows] = useState(sources);
  const [name, setName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [sourceType, setSourceType] = useState("Broker");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleAdd() {
    setErrorMessage("");

    if (!name.trim()) {
      setErrorMessage("Please enter a name.");
      return;
    }

    setSaving(true);

    try {
      const id = await callRpcClient<number>("add_referral_source", {
        p_name: name.trim(),
        p_contact_number: contactNumber || null,
        p_source_type: sourceType,
        p_notes: notes || null,
      });

      await logAuditEvent("referral_source_added", "referral_source", id, {
        name: name.trim(),
        source_type: sourceType,
      });

      setRows((prev) => {
        const withoutDuplicate = prev.filter((r) => r.referral_source_id !== id);
        return [
          ...withoutDuplicate,
          {
            referral_source_id: id,
            name: name.trim(),
            contact_number: contactNumber || null,
            source_type: sourceType,
            notes: notes || null,
          },
        ].sort((a, b) => a.name.localeCompare(b.name));
      });

      setName("");
      setContactNumber("");
      setNotes("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to add referral source."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="font-semibold text-slate-900">Add Referral Source</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <input
            value={contactNumber}
            onChange={(e) => setContactNumber(e.target.value)}
            placeholder="Contact number (optional)"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500"
          >
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </div>

        {errorMessage && (
          <p className="mt-2 text-sm font-medium text-red-600">{errorMessage}</p>
        )}

        <button
          onClick={handleAdd}
          disabled={saving}
          className="mt-3 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Adding..." : "+ Add"}
        </button>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-500">
            No referral sources yet.
          </div>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.referral_source_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold">{row.name}</td>
                  <td className="px-4 py-3">{row.source_type}</td>
                  <td className="px-4 py-3">{row.contact_number || "-"}</td>
                  <td className="px-4 py-3 text-slate-500">{row.notes || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
