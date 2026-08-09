"use client";

import { useMemo, useState } from "react";
import { slugifyHostelName } from "@/lib/hostel";

type AvailableBedRow = {
  bed_id: number;
  bed_number: string;
  bed_code: string | null;
  hostel_name: string;
  floor_number: number;
  room_number: string;
  sharing_type: number;
  monthly_rent: number;
};

function formatMoney(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

export default function BedSearchList({
  beds,
}: {
  beds: AvailableBedRow[];
}) {
  const [selectedSharing, setSelectedSharing] = useState("");

  const sharingOptions = useMemo(
    () =>
      Array.from(new Set(beds.map((bed) => bed.sharing_type))).sort(
        (a, b) => a - b
      ),
    [beds]
  );

  const filteredBeds = useMemo(() => {
    if (!selectedSharing) return beds;

    return beds.filter(
      (bed) => String(bed.sharing_type) === selectedSharing
    );
  }, [beds, selectedSharing]);

  return (
    <section className="mt-8">
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

      {filteredBeds.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-slate-500 shadow-sm">
          {beds.length === 0
            ? "No vacant beds right now."
            : "No vacant beds match that sharing type."}
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
                    {bed.hostel_name} · Floor {bed.floor_number}
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
                <span className="ml-1 text-xs font-normal text-slate-400">
                  / month
                </span>
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
