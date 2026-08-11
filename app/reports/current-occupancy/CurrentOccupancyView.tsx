"use client";

import { useMemo, useState } from "react";
import { downloadCsv } from "@/lib/csv";
import { getBedStatusInfo, type BedStatus } from "@/lib/bedStatus";
import type { OccupancyRow } from "./page";

const STATUS_OPTIONS: BedStatus[] = [
  "occupied",
  "available",
  "vacating_soon",
  "reserved",
  "held",
  "vacant_cleaning",
  "maintenance",
];

export default function CurrentOccupancyView({
  rows,
  hostelNames,
}: {
  rows: OccupancyRow[];
  hostelNames: string[];
}) {
  const [hostelFilter, setHostelFilter] = useState("");
  const [floorFilter, setFloorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const floorOptions = useMemo(() => {
    const floors = new Set(
      rows
        .filter((r) => !hostelFilter || r.hostelName === hostelFilter)
        .map((r) => r.floorNumber)
    );
    return Array.from(floors).sort((a, b) => a - b);
  }, [rows, hostelFilter]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (hostelFilter && r.hostelName !== hostelFilter) return false;
        if (floorFilter && String(r.floorNumber) !== floorFilter) return false;
        if (statusFilter && r.status !== statusFilter) return false;
        return true;
      }),
    [rows, hostelFilter, floorFilter, statusFilter]
  );

  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of filtered) counts[r.status] = (counts[r.status] || 0) + 1;
    return counts;
  }, [filtered]);

  function handleExport() {
    downloadCsv(
      `current-occupancy-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        hostel_name: r.hostelName,
        floor_number: r.floorNumber,
        room_number: r.roomNumber,
        bed_code: r.bedCode,
        status: r.status,
        occupant_name: r.occupantName || "",
      }))
    );
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={hostelFilter}
          onChange={(e) => {
            setHostelFilter(e.target.value);
            setFloorFilter("");
          }}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500"
        >
          <option value="">All Hostels</option>
          {hostelNames.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>

        <select
          value={floorFilter}
          onChange={(e) => setFloorFilter(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500"
        >
          <option value="">All Floors</option>
          {floorOptions.map((f) => (
            <option key={f} value={f}>
              Floor {f}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {getBedStatusInfo(s).label}
            </option>
          ))}
        </select>

        <button
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="ml-auto rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {STATUS_OPTIONS.filter((s) => summary[s]).map((s) => (
          <span
            key={s}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${getBedStatusInfo(s).badgeClasses}`}
          >
            {getBedStatusInfo(s).label}: {summary[s]}
          </span>
        ))}
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-500">
            No beds match these filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Hostel</th>
                  <th className="px-4 py-3">Floor</th>
                  <th className="px-4 py-3">Room</th>
                  <th className="px-4 py-3">Bed</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Resident</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.bedId} className="hover:bg-slate-50">
                    <td className="px-4 py-3">{r.hostelName}</td>
                    <td className="px-4 py-3">{r.floorNumber}</td>
                    <td className="px-4 py-3">{r.roomNumber}</td>
                    <td className="px-4 py-3">{r.bedCode}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getBedStatusInfo(r.status).badgeClasses}`}
                      >
                        {getBedStatusInfo(r.status).label}
                      </span>
                    </td>
                    <td className="px-4 py-3">{r.occupantName || "-"}</td>
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
