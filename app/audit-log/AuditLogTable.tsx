"use client";

import { useMemo, useState } from "react";
import { roleLabel } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";

type AuditLogRow = {
  audit_id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  details: Record<string, unknown>;
  user_name: string | null;
  user_role: string | null;
  created_at: string;
};

function actionLabel(action: string) {
  return action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    "from" in (value as object) &&
    "to" in (value as object)
  ) {
    const { from, to } = value as { from: unknown; to: unknown };
    return `${formatDetailValue(from)} → ${formatDetailValue(to)}`;
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${formatDetailValue(v)}`)
      .join(", ");
  }
  return String(value);
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
                <th className="px-4 py-3">By</th>
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
                  <td className="px-4 py-3 whitespace-nowrap">
                    {entry.user_name || "System"}
                    {entry.user_role && (
                      <span className="ml-1 text-xs text-slate-400">
                        ({roleLabel(entry.user_role)})
                      </span>
                    )}
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
                      .map(([k, v]) => `${k}: ${formatDetailValue(v)}`)
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
