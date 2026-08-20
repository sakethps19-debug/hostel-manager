"use client";

import { useMemo, useState } from "react";

type HostelDashboardRow = {
  hostel_id: number;
  hostel_name: string;
  total_beds: number;
  occupied_beds: number;
};

type CheckinRow = {
  booking_id: number;
  hostel_name: string;
  full_name: string;
  room_number: string;
  bed_code: string | null;
  bed_number: string;
  start_date: string;
  days_until: number;
  monthly_rent: number;
};

type VacancyRow = {
  booking_id: number;
  hostel_name: string;
  full_name: string;
  room_number: string;
  bed_number: string;
  end_date: string | null;
  days_left: number;
  monthly_rent: number;
};

// Stat cards/lists below cover the full 90-day RPC window (get_upcoming_checkins/
// vacancies are fetched with p_days: 90), so the week buckets must too - otherwise
// a check-in/vacancy inside 90 days but past week 12's range (day 83) is counted
// in the stat cards but silently missing from the projected-occupancy table.
const FORECAST_DAYS = 90;
const WEEK_COUNT = Math.ceil(FORECAST_DAYS / 7);

function formatMoney(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function weekLabel(weekIndex: number) {
  const start = new Date();
  start.setDate(start.getDate() + weekIndex * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

  return weekIndex === 0 ? `This week (${fmt(start)}–${fmt(end)})` : `${fmt(start)}–${fmt(end)}`;
}

export default function OccupancyForecastView({
  hostels,
  checkins,
  vacancies,
}: {
  hostels: HostelDashboardRow[];
  checkins: CheckinRow[];
  vacancies: VacancyRow[];
}) {
  const [selectedHostel, setSelectedHostel] = useState("");

  const hostelOptions = useMemo(
    () => hostels.map((h) => h.hostel_name).sort(),
    [hostels]
  );

  const { totalBeds, startingOccupied } = useMemo(() => {
    const relevant = selectedHostel
      ? hostels.filter((h) => h.hostel_name === selectedHostel)
      : hostels;
    return {
      totalBeds: relevant.reduce((sum, h) => sum + Number(h.total_beds), 0),
      startingOccupied: relevant.reduce(
        (sum, h) => sum + Number(h.occupied_beds),
        0
      ),
    };
  }, [hostels, selectedHostel]);

  const filteredCheckins = useMemo(
    () =>
      checkins.filter(
        (c) => !selectedHostel || c.hostel_name === selectedHostel
      ),
    [checkins, selectedHostel]
  );

  const filteredVacancies = useMemo(
    () =>
      vacancies.filter(
        (v) => !selectedHostel || v.hostel_name === selectedHostel
      ),
    [vacancies, selectedHostel]
  );

  const weeks = useMemo(() => {
    let cumulativeOccupied = startingOccupied;
    const rows = [];

    for (let week = 0; week < WEEK_COUNT; week++) {
      const rangeStart = week * 7;
      const rangeEnd = Math.min(rangeStart + 6, FORECAST_DAYS - 1);

      const weekCheckins = filteredCheckins.filter(
        (c) => c.days_until >= rangeStart && c.days_until <= rangeEnd
      );
      const weekVacancies = filteredVacancies.filter(
        (v) => v.days_left >= rangeStart && v.days_left <= rangeEnd
      );

      cumulativeOccupied += weekCheckins.length - weekVacancies.length;
      const clampedOccupied = Math.max(
        0,
        Math.min(cumulativeOccupied, totalBeds)
      );

      rows.push({
        week,
        label: weekLabel(week),
        checkinsCount: weekCheckins.length,
        vacanciesCount: weekVacancies.length,
        projectedOccupied: clampedOccupied,
        projectedOccupancyPct:
          totalBeds === 0
            ? 0
            : Math.round((clampedOccupied / totalBeds) * 1000) / 10,
      });
    }

    return rows;
  }, [filteredCheckins, filteredVacancies, startingOccupied, totalBeds]);

  const currentOccupancyPct =
    totalBeds === 0 ? 0 : Math.round((startingOccupied / totalBeds) * 1000) / 10;

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedHostel}
          onChange={(e) => setSelectedHostel(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">All Hostels</option>
          {hostelOptions.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Current Occupancy
          </p>
          <p className="mt-1 text-2xl font-bold">
            {startingOccupied}/{totalBeds} ({currentOccupancyPct}%)
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Confirmed Check-ins (90 days)
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">
            {filteredCheckins.length}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Confirmed Check-outs (90 days)
          </p>
          <p className="mt-1 text-2xl font-bold text-red-600">
            {filteredVacancies.length}
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Week</th>
                <th className="px-4 py-3 text-right">Check-ins</th>
                <th className="px-4 py-3 text-right">Check-outs</th>
                <th className="px-4 py-3 text-right">Projected Occupied</th>
                <th className="px-4 py-3 text-right">Projected Occupancy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {weeks.map((row) => (
                <tr
                  key={row.week}
                  className={row.week === 0 ? "bg-indigo-50" : "hover:bg-slate-50"}
                >
                  <td className="px-4 py-3 font-medium">{row.label}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">
                    {row.checkinsCount > 0 ? `+${row.checkinsCount}` : "-"}
                  </td>
                  <td className="px-4 py-3 text-right text-red-700">
                    {row.vacanciesCount > 0 ? `-${row.vacanciesCount}` : "-"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {row.projectedOccupied}/{totalBeds}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {row.projectedOccupancyPct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-lg font-bold">Confirmed Check-ins</h2>
          {filteredCheckins.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">None in the next 90 days.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {filteredCheckins.map((c) => (
                <li
                  key={c.booking_id}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
                >
                  <p className="font-semibold">{c.full_name}</p>
                  <p className="text-xs text-slate-500">
                    {c.hostel_name} · Room {c.room_number} ·{" "}
                    {c.bed_code || c.bed_number} · in {c.days_until} day
                    {c.days_until === 1 ? "" : "s"} · {formatMoney(c.monthly_rent)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="text-lg font-bold">Confirmed Check-outs</h2>
          {filteredVacancies.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">None in the next 90 days.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {filteredVacancies.map((v) => (
                <li
                  key={v.booking_id}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
                >
                  <p className="font-semibold">{v.full_name}</p>
                  <p className="text-xs text-slate-500">
                    {v.hostel_name} · Room {v.room_number} · {v.bed_number} ·
                    in {v.days_left} day{v.days_left === 1 ? "" : "s"} ·{" "}
                    {formatMoney(v.monthly_rent)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
