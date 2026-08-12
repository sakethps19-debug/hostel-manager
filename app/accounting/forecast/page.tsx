import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { getHostelList } from "@/lib/hostel";
import { getCashForecast, getWorkingCapital, getPayableAgeing } from "@/lib/accounting/queries";
import { formatMoney, todayIsoDateIST } from "@/lib/format";

const HORIZONS = [
  { label: "Next 30 Days", months: 1 },
  { label: "Next 3 Months", months: 3 },
  { label: "Next 6 Months", months: 6 },
  { label: "Next 12 Months", months: 12 },
];

type PageProps = {
  searchParams: Promise<{ horizon?: string; hostel?: string }>;
};

export default async function ForecastPage({ searchParams }: PageProps) {
  await requirePermission("viewFinancialReports");
  if (!(await isFeatureEnabled("enable_accounting"))) notFound();

  const { horizon: horizonParam, hostel } = await searchParams;
  const horizonMonths = horizonParam ? Number(horizonParam) : 3;
  const hostelName = hostel || "";
  const today = todayIsoDateIST();

  const [cashForecast, workingCapital, payableAgeing, hostels] = await Promise.all([
    getCashForecast(today, horizonMonths, hostelName || null),
    getWorkingCapital(today, hostelName || null),
    getPayableAgeing(today, hostelName || null),
    getHostelList(),
  ]);

  const totalInflow = cashForecast.reduce((sum, r) => sum + r.expected_inflow, 0);
  const totalOutflow = cashForecast.reduce((sum, r) => sum + r.expected_outflow, 0);
  const finalProjection = cashForecast.length > 0 ? cashForecast[cashForecast.length - 1].projected_closing_cash : 0;
  const existingPayablesTotal = payableAgeing.reduce((sum, r) => sum + r.outstanding, 0);
  const shortfallMonth = cashForecast.find((r) => r.projected_closing_cash < 0);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <a href="/" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
          ← Back to Dashboard
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Accounting</p>
          <h1 className="mt-2 text-4xl font-bold">Forecast / Forward Position</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            <span className="font-semibold text-amber-700">FORECAST</span> — expected future
            contracted rent and recurring expenses, not present accounting balances. Compare against
            Accounts Receivable and Accounts Payable for what's already accrued.
          </p>
        </div>

        <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            Horizon
            <select name="horizon" defaultValue={horizonMonths} className="mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none">
              {HORIZONS.map((h) => (
                <option key={h.months} value={h.months}>
                  {h.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Hostel
            <select name="hostel" defaultValue={hostelName} className="mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none">
              <option value="">Consolidated</option>
              {hostels.map((h) => (
                <option key={h.hostel_name} value={h.hostel_name}>
                  {h.hostel_name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white">
            Apply
          </button>
        </form>

        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Expected Inflows</p>
            <p className="mt-2 text-2xl font-bold text-emerald-800">{formatMoney(totalInflow)}</p>
            <p className="mt-1 text-xs text-emerald-700">Future contracted rent from active bookings</p>
          </div>
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Expected Outflows</p>
            <p className="mt-2 text-2xl font-bold text-red-800">{formatMoney(totalOutflow)}</p>
            <p className="mt-1 text-xs text-red-700">Active recurring expense templates</p>
          </div>
          <div className={`rounded-2xl border p-5 ${finalProjection >= 0 ? "border-slate-200 bg-white" : "border-red-200 bg-red-50"}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Projected Closing Cash</p>
            <p className={`mt-2 text-2xl font-bold ${finalProjection >= 0 ? "" : "text-red-800"}`}>{formatMoney(finalProjection)}</p>
            <p className="mt-1 text-xs text-slate-500">At the end of the selected horizon</p>
          </div>
        </section>

        {shortfallMonth && (
          <div className="mt-4 rounded-2xl bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
            Projected cash shortfall by {shortfallMonth.period_month}/{shortfallMonth.period_year} — closing
            cash goes negative ({formatMoney(shortfallMonth.projected_closing_cash)}) unless collections
            improve or outflows are deferred.
          </div>
        )}

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Month-by-Month Projection</h2>
          <p className="mt-1 text-xs font-semibold uppercase text-amber-700">Forecast, not actual</p>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Period</th>
                  <th className="px-4 py-2 text-right">Opening Cash</th>
                  <th className="px-4 py-2 text-right">Expected Inflow</th>
                  <th className="px-4 py-2 text-right">Expected Outflow</th>
                  <th className="px-4 py-2 text-right">Projected Closing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cashForecast.map((r) => (
                  <tr key={`${r.period_year}-${r.period_month}`}>
                    <td className="px-4 py-2">
                      {r.period_month}/{r.period_year}
                    </td>
                    <td className="px-4 py-2 text-right">{formatMoney(r.opening_cash)}</td>
                    <td className="px-4 py-2 text-right text-emerald-700">{formatMoney(r.expected_inflow)}</td>
                    <td className="px-4 py-2 text-right text-red-700">{formatMoney(r.expected_outflow)}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${r.projected_closing_cash < 0 ? "text-red-700" : ""}`}>
                      {formatMoney(r.projected_closing_cash)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Working Capital</h2>
          <p className="mt-1 text-xs font-semibold uppercase text-emerald-700">Actual (as of {today})</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current Assets</p>
              <p className="mt-1 text-lg font-bold">{formatMoney(workingCapital?.current_assets || 0)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current Liabilities</p>
              <p className="mt-1 text-lg font-bold">{formatMoney(workingCapital?.current_liabilities || 0)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Working Capital</p>
              <p className="mt-1 text-lg font-bold text-indigo-700">{formatMoney(workingCapital?.working_capital || 0)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cash</p>
              <p className="mt-1 font-semibold">{formatMoney(workingCapital?.cash || 0)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Accounts Receivable</p>
              <p className="mt-1 font-semibold">{formatMoney(workingCapital?.accounts_receivable || 0)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Accounts Payable</p>
              <p className="mt-1 font-semibold">{formatMoney(workingCapital?.accounts_payable || 0)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Deposits Held</p>
              <p className="mt-1 font-semibold">{formatMoney(workingCapital?.deposits_held || 0)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Other Current Liabilities</p>
              <p className="mt-1 font-semibold">{formatMoney(workingCapital?.other_current_liabilities || 0)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Existing Payables (already due)</p>
              <p className="mt-1 font-semibold">{formatMoney(existingPayablesTotal)}</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
