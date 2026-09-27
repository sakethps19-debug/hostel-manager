"use client";

import { useMemo, useState } from "react";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";

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

type ChangeRow = {
  audit_id: number;
  groupKey: string;
  groupLabel: string;
  newRate: number;
  effectiveDate: string | null;
  previousRate: number | null;
  changedBy: string | null;
  changedAt: string;
};

function buildChanges(entries: AuditLogRow[]): ChangeRow[] {
  const groups = new Map<string, AuditLogRow[]>();

  for (const entry of entries) {
    const d = entry.details;
    const groupKey =
      entry.entity_type === "pricing"
        ? `pricing:${d.hostel_name}:${d.sharing_type}`
        : `room:${entry.entity_id}`;

    const list = groups.get(groupKey) || [];
    list.push(entry);
    groups.set(groupKey, list);
  }

  const rows: ChangeRow[] = [];

  for (const [groupKey, list] of groups) {
    const sorted = [...list].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    sorted.forEach((entry, index) => {
      const d = entry.details;
      const groupLabel =
        entry.entity_type === "pricing"
          ? `${d.hostel_name} · ${d.sharing_type} Sharing`
          : `Room ${d.room_number}`;

      rows.push({
        audit_id: entry.audit_id,
        groupKey,
        groupLabel,
        newRate: Number(d.new_rate),
        effectiveDate: (d.effective_date as string) || null,
        previousRate: index > 0 ? Number(sorted[index - 1].details.new_rate) : null,
        changedBy: entry.user_name,
        changedAt: entry.created_at,
      });
    });
  }

  return rows.sort(
    (a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()
  );
}

export default function RateHistoryView({
  entries,
}: {
  entries: AuditLogRow[];
}) {
  const [groupFilter, setGroupFilter] = useState("");

  const allChanges = useMemo(() => buildChanges(entries), [entries]);

  const groupOptions = useMemo(
    () =>
      Array.from(new Map(allChanges.map((c) => [c.groupKey, c.groupLabel])).entries()).sort(
        (a, b) => a[1].localeCompare(b[1])
      ),
    [allChanges]
  );

  const filtered = groupFilter
    ? allChanges.filter((c) => c.groupKey === groupFilter)
    : allChanges;

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">All Hostels/Rooms</option>
          {groupOptions.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-500">
            No rate changes recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Hostel / Room</th>
                  <th className="px-4 py-3">Change</th>
                  <th className="px-4 py-3">Effective</th>
                  <th className="px-4 py-3">Changed By</th>
                  <th className="px-4 py-3">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((row) => (
                  <tr key={row.audit_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold">{row.groupLabel}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.previousRate !== null ? (
                        <>
                          <span className="text-slate-400 line-through">
                            {formatMoney(row.previousRate)}
                          </span>{" "}
                          → <span className="font-semibold">{formatMoney(row.newRate)}</span>
                        </>
                      ) : (
                        <span className="font-semibold">
                          {formatMoney(row.newRate)} (first recorded)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                      {row.effectiveDate ? formatDate(row.effectiveDate) : "-"}
                    </td>
                    <td className="px-4 py-3">{row.changedBy || "-"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                      {formatDateTime(row.changedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
