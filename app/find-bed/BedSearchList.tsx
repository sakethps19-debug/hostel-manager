"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { slugifyHostelName } from "@/lib/hostelSlug";
import { callRpcClient } from "@/lib/supabase/callRpcClient";

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
  const searchParams = useSearchParams();
  const enquiryId = searchParams.get("enquiryId");
  const enquiryName = searchParams.get("name") || "";
  const enquiryMobile = searchParams.get("mobile") || "";

  const [selectedHostel, setSelectedHostel] = useState(
    searchParams.get("hostel") || ""
  );
  const [selectedFloor, setSelectedFloor] = useState("");
  const [selectedSharing, setSelectedSharing] = useState(
    searchParams.get("sharing") || ""
  );

  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [periodBeds, setPeriodBeds] = useState<AvailableBedRow[] | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodError, setPeriodError] = useState("");

  const periodActive = Boolean(periodStart && periodEnd);

  useEffect(() => {
    if (!periodStart || !periodEnd) {
      setPeriodBeds(null);
      setPeriodError("");
      return;
    }

    if (new Date(periodEnd) < new Date(periodStart)) {
      setPeriodError("End date cannot be before start date.");
      setPeriodBeds(null);
      return;
    }

    let cancelled = false;
    setPeriodLoading(true);
    setPeriodError("");

    callRpcClient<AvailableBedRow[]>("get_available_beds_for_period", {
      p_start_date: periodStart,
      p_end_date: periodEnd,
    })
      .then((data) => {
        if (!cancelled) setPeriodBeds(data);
      })
      .catch((error) => {
        if (!cancelled) {
          setPeriodError(
            error instanceof Error
              ? error.message
              : "Unable to check availability for that period."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setPeriodLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [periodStart, periodEnd]);

  const baseBeds = periodActive && periodBeds ? periodBeds : beds;

  const hostelOptions = useMemo(
    () => Array.from(new Set(baseBeds.map((bed) => bed.hostel_name))).sort(),
    [baseBeds]
  );

  const floorOptions = useMemo(() => {
    const relevant = baseBeds.filter(
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
  }, [baseBeds, selectedHostel]);

  const sharingOptions = useMemo(
    () =>
      Array.from(new Set(baseBeds.map((bed) => bed.sharing_type))).sort(
        (a, b) => a - b
      ),
    [baseBeds]
  );

  const filteredBeds = useMemo(() => {
    return baseBeds.filter((bed) => {
      const matchesHostel =
        !selectedHostel || bed.hostel_name === selectedHostel;

      const matchesFloor =
        !selectedFloor ||
        `${bed.hostel_name}|${bed.floor_number}` === selectedFloor;

      const matchesSharing =
        !selectedSharing || String(bed.sharing_type) === selectedSharing;

      return matchesHostel && matchesFloor && matchesSharing;
    });
  }, [baseBeds, selectedHostel, selectedFloor, selectedSharing]);

  return (
    <section className="mt-8">
      {enquiryId && (
        <div className="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm font-medium text-indigo-800">
          Finding a bed for {enquiryName || "this enquiry"}
          {enquiryMobile ? ` · ${enquiryMobile}` : ""} — booking from here will
          mark the enquiry as Converted.
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-700">
          Check availability for a specific stay period
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Leave blank to see beds vacant right now. Set both dates to also
          surface beds that are free for that entire window, even if
          currently reserved for someone else outside it.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">
              From
            </span>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">
              To
            </span>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </label>

          {periodActive && (
            <button
              type="button"
              onClick={() => {
                setPeriodStart("");
                setPeriodEnd("");
              }}
              className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50"
            >
              Clear
            </button>
          )}
        </div>

        {periodLoading && (
          <p className="mt-3 text-sm text-slate-500">Checking availability...</p>
        )}

        {periodError && (
          <p className="mt-3 text-sm font-medium text-red-600">{periodError}</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
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
          {baseBeds.length === 0
            ? periodActive
              ? "No beds are free for the whole selected period."
              : "No vacant beds right now."
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
                href={(() => {
                  const base = `/${slugifyHostelName(bed.hostel_name)}/room/${bed.room_number}/book/${bed.bed_id}`;
                  const params = new URLSearchParams();
                  if (enquiryId) params.set("enquiryId", enquiryId);
                  if (enquiryName) params.set("name", enquiryName);
                  if (enquiryMobile) params.set("mobile", enquiryMobile);
                  if (periodStart) params.set("startDate", periodStart);
                  const qs = params.toString();
                  return qs ? `${base}?${qs}` : base;
                })()}
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
