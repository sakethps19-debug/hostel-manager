"use client";

import { useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";

type SharingRateRow = {
  hostel_name: string;
  sharing_type: number;
  monthly_rent: number;
  effective_from: string;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function SharingRatesTable({
  rates,
}: {
  rates: SharingRateRow[];
}) {
  const [rows, setRows] = useState(rates);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [newRate, setNewRate] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(todayIsoDate());
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  function rowKey(row: SharingRateRow) {
    return `${row.hostel_name}-${row.sharing_type}`;
  }

  function startEdit(row: SharingRateRow) {
    setErrorMessage("");
    setEditingKey(rowKey(row));
    setNewRate(String(row.monthly_rent));
    setEffectiveDate(todayIsoDate());
  }

  async function handleSave(row: SharingRateRow) {
    setErrorMessage("");
    const rate = Number(newRate);

    if (!Number.isFinite(rate) || rate <= 0) {
      setErrorMessage("Please enter a valid rate.");
      return;
    }

    setSaving(true);

    try {
      await callRpcClient("update_sharing_type_rate", {
        p_hostel_name: row.hostel_name,
        p_sharing_type: row.sharing_type,
        p_new_rate: rate,
        p_effective_date: effectiveDate,
      });

      await logAuditEvent("standard_rate_updated", "pricing", null, {
        hostel_name: row.hostel_name,
        sharing_type: row.sharing_type,
        new_rate: rate,
        effective_date: effectiveDate,
      });

      setRows((prev) =>
        prev.map((r) =>
          rowKey(r) === rowKey(row)
            ? { ...r, monthly_rent: rate, effective_from: effectiveDate }
            : r
        )
      );
      setEditingKey(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update rate."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4">
      {errorMessage && (
        <p className="mb-3 text-sm font-medium text-red-600">
          {errorMessage}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Hostel</th>
              <th className="px-4 py-3">Sharing Type</th>
              <th className="px-4 py-3">Current Rate</th>
              <th className="px-4 py-3">Effective From</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const key = rowKey(row);
              const isEditing = editingKey === key;

              return (
                <tr key={key} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold">
                    {row.hostel_name}
                  </td>
                  <td className="px-4 py-3">{row.sharing_type} Sharing</td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <input
                        type="number"
                        min="0"
                        value={newRate}
                        onChange={(e) => setNewRate(e.target.value)}
                        className="w-28 rounded-lg border border-slate-200 px-2 py-1 outline-none focus:border-indigo-500"
                      />
                    ) : (
                      `Rs. ${Number(row.monthly_rent).toLocaleString("en-IN")}`
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {isEditing ? (
                      <input
                        type="date"
                        min={todayIsoDate()}
                        value={effectiveDate}
                        onChange={(e) => setEffectiveDate(e.target.value)}
                        className="rounded-lg border border-slate-200 px-2 py-1 outline-none focus:border-indigo-500"
                      />
                    ) : (
                      formatDate(row.effective_from)
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleSave(row)}
                          disabled={saving}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={() => setEditingKey(null)}
                          disabled={saving}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(row)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
