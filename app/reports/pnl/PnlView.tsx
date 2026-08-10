"use client";

import { useRouter } from "next/navigation";

type PnlRow = {
  hostel_name: string;
  rent_revenue: number;
  other_revenue: number;
  operating_expenses: number;
  net_surplus: number;
};

type MetricsRow = {
  hostel_name: string;
  total_beds: number;
  occupied_beds: number;
  occupancy_pct: number;
  outstanding_rent_total: number;
  deposits_held_total: number;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function money(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

export default function PnlView({
  pnl,
  metrics,
  month,
  year,
}: {
  pnl: PnlRow[];
  metrics: MetricsRow[];
  month: number;
  year: number;
}) {
  const router = useRouter();

  function handleMonthChange(newMonth: number, newYear: number) {
    router.push(`/reports/pnl?month=${newMonth}&year=${newYear}`);
  }

  const pnlByHostel = new Map(pnl.map((p) => [p.hostel_name, p]));

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={month}
          onChange={(e) => handleMonthChange(Number(e.target.value), year)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>

        <select
          value={year}
          onChange={(e) => handleMonthChange(month, Number(e.target.value))}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        >
          {Array.from({ length: 5 }, (_, i) => year - 2 + i).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Hostel</th>
              <th className="px-4 py-3 text-right">Rent Revenue</th>
              <th className="px-4 py-3 text-right">Other Revenue</th>
              <th className="px-4 py-3 text-right">Operating Expenses</th>
              <th className="px-4 py-3 text-right">Net Surplus</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pnl.map((row) => (
              <tr
                key={row.hostel_name}
                className={
                  row.hostel_name === "Consolidated"
                    ? "bg-indigo-50 font-semibold"
                    : "hover:bg-slate-50"
                }
              >
                <td className="px-4 py-3">{row.hostel_name}</td>
                <td className="px-4 py-3 text-right">
                  {money(row.rent_revenue)}
                </td>
                <td className="px-4 py-3 text-right">
                  {money(row.other_revenue)}
                </td>
                <td className="px-4 py-3 text-right">
                  {money(row.operating_expenses)}
                </td>
                <td
                  className={`px-4 py-3 text-right font-semibold ${
                    row.net_surplus >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {money(row.net_surplus)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-bold">Current Snapshot</h2>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {metrics.map((m) => (
          <div
            key={m.hostel_name}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm font-semibold text-slate-700">
              {m.hostel_name}
            </p>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Occupancy</span>
                <span className="font-semibold">
                  {m.occupied_beds}/{m.total_beds} ({m.occupancy_pct || 0}%)
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Outstanding Rent</span>
                <span className="font-semibold text-red-600">
                  {money(m.outstanding_rent_total)}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Deposits Held</span>
                <span className="font-semibold">
                  {money(m.deposits_held_total)}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Revenue / Occupied Bed</span>
                <span className="font-semibold">
                  {money(
                    m.occupied_beds > 0
                      ? (pnlByHostel.get(m.hostel_name)?.rent_revenue || 0) /
                          m.occupied_beds
                      : 0
                  )}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
