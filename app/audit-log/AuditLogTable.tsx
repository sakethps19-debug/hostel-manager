"use client";

import { useMemo, useState } from "react";

type AuditLogRow = {
  audit_id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  details: Record<string, unknown>;
  created_at: string;
};

function formatDateTime(date: string) {
  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actionLabel(action: string) {
  return action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function AuditLogTable({
  entries,
}: {
  entries: AuditLogRow[];
}) {
  const [entityFilter, setEntityFilter] = useState("");

  const entityOptions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.entity_type))).sort(),
    [entries]
  );

  const filtered = useMemo(
    () =>
      entries.filter((e) => !entityFilter || e.entity_type === entityFilter),
    [entries, entityFilter]
  );

  return (
    <section className="mt-8">
      <div className="flex flex-wrap gap-3">
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">All Entity Types</option>
          {entityOptions.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-slate-500 shadow-sm">
          No audit events recorded yet.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((entry) => (
                <tr key={entry.audit_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDateTime(entry.created_at)}
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {actionLabel(entry.action)}
                  </td>
                  <td className="px-4 py-3">
                    {entry.entity_type}
                    {entry.entity_id ? ` #${entry.entity_id}` : ""}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {Object.entries(entry.details || {})
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
