"use client";

import { useMemo, useState } from "react";
import { downloadCsv } from "@/lib/csv";

type DirectoryRow = {
  resident_id: number;
  full_name: string;
  hostel_name: string;
  floor_number: number;
  floor_name: string | null;
  room_number: string;
  bed_code: string | null;
  bed_number: string;
  mobile_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_mobile: string | null;
};

export default function EmergencyDirectoryView({
  residents,
}: {
  residents: DirectoryRow[];
}) {
  const [search, setSearch] = useState("");
  const [selectedHostel, setSelectedHostel] = useState("");

  const hostelOptions = useMemo(
    () => Array.from(new Set(residents.map((r) => r.hostel_name))).sort(),
    [residents]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return residents.filter((r) => {
      const matchesHostel = !selectedHostel || r.hostel_name === selectedHostel;
      const matchesQuery =
        !query ||
        r.full_name.toLowerCase().includes(query) ||
        r.room_number.toLowerCase().includes(query) ||
        (r.bed_code || "").toLowerCase().includes(query);

      return matchesHostel && matchesQuery;
    });
  }, [residents, search, selectedHostel]);

  const grouped = useMemo(() => {
    const map = new Map<string, DirectoryRow[]>();

    for (const r of filtered) {
      const key = `${r.hostel_name} · ${r.floor_name || `Floor ${r.floor_number}`}`;
      const list = map.get(key) || [];
      list.push(r);
      map.set(key, list);
    }

    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  function handleExport() {
    downloadCsv(
      `emergency-directory-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        full_name: r.full_name,
        hostel_name: r.hostel_name,
        room_number: r.room_number,
        bed_code: r.bed_code || r.bed_number,
        mobile_number: r.mobile_number || "",
        emergency_contact_name: r.emergency_contact_name || "",
        emergency_contact_mobile: r.emergency_contact_mobile || "",
      }))
    );
  }

  return (
    <div>
      <div className="mt-6 flex flex-wrap items-center gap-3 print:hidden">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, room, bed..."
          className="w-full max-w-xs rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500"
        />

        <select
          value={selectedHostel}
          onChange={(e) => setSelectedHostel(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500"
        >
          <option value="">All Hostels</option>
          {hostelOptions.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>

        <button
          onClick={() => window.print()}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Print
        </button>

        <button
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      <div className="mt-6 space-y-8">
        {grouped.length === 0 ? (
          <p className="text-center text-slate-500">No residents match.</p>
        ) : (
          grouped.map(([groupName, rows]) => (
            <section key={groupName}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {groupName} ({rows.length})
              </h2>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {rows.map((r) => (
                  <div
                    key={r.resident_id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-slate-900">
                        {r.full_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        Room {r.room_number} · {r.bed_code || r.bed_number}
                      </p>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-slate-400">Mobile</p>
                        <p className="mt-0.5 font-medium">
                          {r.mobile_number || "Not provided"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-400">
                          Emergency Contact
                        </p>
                        <p className="mt-0.5 font-medium">
                          {r.emergency_contact_name || "Not provided"}
                        </p>
                        <p className="text-slate-500">
                          {r.emergency_contact_mobile || ""}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
