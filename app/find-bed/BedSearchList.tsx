"use client";

import { useMemo, useState } from "react";
import { slugifyHostelName } from "@/lib/hostel";

type AvailableBedRow = {
  bed_id: number;
  bed_number: string;
  bed_code: string | null;
  hostel_name: string;
  floor_number: number;
  floor_name: string | null;
  room_number: string;
  sharing_type: number;
  monthly_rent: number;
};

function formatMoney(value: number) {
  return Number(value) > 0
    ? `Rs. ${Number(value).toLocaleString("en-IN")}`
    : "Rate not set";
}

export default function BedSearchList({
  beds,
}: {
  beds: AvailableBedRow[];
}) {
  const [selectedHostel, setSelectedHostel] = useState("");
  const [selectedFloor, setSelectedFloor] = useState("");
  const [selectedSharing, setSelectedSharing] = useState("");

  const hostelOptions = useMemo(
    () => Array.from(new Set(beds.map((bed) => bed.hostel_name))).sort(),
    [beds]
  );

  const floorOptions = useMemo(() => {
    const relevant = beds.filter(
      (bed) => !selectedHostel || bed.hostel_name === selectedHostel
    );

    const seen = new Map<string, string>();

    for (const bed of relevant) {
      const key = `${bed.hostel_name}|${bed.floor_number}`;
      const label = bed.floor_name || `Floor ${bed.floor_number}`;

      seen.set(
        key,
        selectedHostel ? label : `${bed.hostel_name} · ${label}`
      );
    }

    return Array.from(seen.entries()).sort((a, b) =>
      a[1].localeCompare(b[1])
    );
  }, [beds, selectedHostel]);

  const sharingOptions = useMemo(
    () =>
      Array.from(new Set(beds.map((bed) => bed.sharing_type))).sort(
        (a, b) => a - b
      ),
    [beds]
  );

  const filteredBeds = useMemo(() => {
    return beds.filter((bed) => {
      const matchesHostel =
        !selectedHostel || bed.hostel_name === selectedHostel;

      const matchesFloor =
        !selectedFloor ||
        `${bed.hostel_name}|${bed.floor_number}` === selectedFloor;

      const matchesSharing =
        !selectedSharing || String(bed.sharing_type) === selectedSharing;

      return matchesHostel && matchesFloor && matchesSharing;
    });
  }, [beds, selectedHostel, selectedFloor, selectedSharing]);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap gap-3">
        <select
          value={selectedHostel}
          onChange={(e) => {
            setSelectedHostel(e.target.value);
            setSelectedFloor("");
          }}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">All Hostels</option>
          {hostelOptions.map((hostel) => (
            <option key={hostel} value={hostel}>
              {hostel}
            </option>
          ))}
        </select>

        <select
          value={selectedFloor}
          onChange={(e) => setSelectedFloor(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">All Floors</option>
          {floorOptions.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={selectedSharing}
          onChange={(e) => setSelectedSharing(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">All Sharing Types</option>
          {sharingOptions.map((sharing) => (
            <option key={sharing} value={sharing}>
              {sharing} Sharing
            </option>
          ))}
        </select>
      </div>

      {filteredBeds.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-slate-500 shadow-sm">
          {beds.length === 0
            ? "No vacant beds right now."
            : "No vacant beds match the current filters."}
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredBeds.map((bed) => (
            <div
              key={bed.bed_id}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400">
                    {bed.hostel_name} ·{" "}
                    {bed.floor_name || `Floor ${bed.floor_number}`}
                  </p>

                  <h3 className="mt-1 text-xl font-bold">
                    Room {bed.room_number} · {bed.bed_code || bed.bed_number}
                  </h3>
                </div>

                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Vacant
                </span>
              </div>

              <p className="mt-3 text-sm text-slate-500">
                {bed.sharing_type} Sharing
              </p>

              <p className="mt-4 text-lg font-bold">
                {formatMoney(bed.monthly_rent)}
                {Number(bed.monthly_rent) > 0 && (
                  <span className="ml-1 text-xs font-normal text-slate-400">
                    / month
                  </span>
                )}
              </p>

              <a
                href={`/${slugifyHostelName(bed.hostel_name)}/room/${bed.room_number}/book/${bed.bed_id}`}
                className="mt-6 block w-full rounded-xl bg-indigo-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Book This Bed
              </a>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
