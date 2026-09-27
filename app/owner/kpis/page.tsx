import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import { formatMoney, todayIsoDateIST } from "@/lib/format";
import { isFeatureEnabled } from "@/lib/featureFlags";
import {
  getNetWorth,
  getWorkingCapital,
  getLedgerPnlSummary,
  getCashFlowStatement,
  getCashForecast,
} from "@/lib/accounting/queries";

type HostelDashboardRow = {
  hostel_id: number;
  hostel_name: string;
  total_beds: number;
  occupied_beds: number;
  vacant_beds: number;
  maintenance_beds: number;
};

type RentSummary = {
  rent_due_this_month: number;
  rent_collected_this_month: number;
  outstanding_total: number;
  overdue_residents_count: number;
};

type SnapshotRow = {
  snapshot_date: string;
  total_beds: number;
  occupied_beds: number;
};

type ExpenseRow = {
  expense_date: string;
  amount: number;
};

type ReferralPerformanceRow = {
  bookings_count: number;
  active_bookings_count: number;
  total_commission: number;
};

type AssetRow = {
  condition: string;
};

function statCard(label: string, value: string, sub?: string) {
  return { label, value, sub };
}

export default async function OwnerKpisPage() {
  await requirePermission("manageUsers");

  const [hostels, rentSummary, snapshots, expenses, referrals, assets, pettyCashBalance] =
    await Promise.all([
      callRpcServer<HostelDashboardRow[]>("get_hostel_dashboard"),
      callRpcServer<RentSummary[]>("get_rent_dashboard_summary").then(
        (r) => r[0] ?? null
      ),
      callRpcServer<SnapshotRow[]>("get_occupancy_snapshots", {
        p_hostel_name: null,
        p_days: 30,
      }),
      callRpcServer<ExpenseRow[]>("get_expenses"),
      callRpcServer<ReferralPerformanceRow[]>("get_referral_performance"),
      callRpcServer<AssetRow[]>("get_assets"),
      callRpcServer<number>("get_petty_cash_balance"),
    ]);

  const totalBeds = hostels.reduce((sum, h) => sum + Number(h.total_beds), 0);
  const occupiedBeds = hostels.reduce((sum, h) => sum + Number(h.occupied_beds), 0);
  const occupancyPct = totalBeds === 0 ? 0 : Math.round((occupiedBeds / totalBeds) * 1000) / 10;

  const collectionEfficiency =
    rentSummary && rentSummary.rent_due_this_month > 0
      ? Math.round(
          (rentSummary.rent_collected_this_month / rentSummary.rent_due_this_month) * 1000
        ) / 10
      : 0;

  const arpu = occupiedBeds > 0 && rentSummary
    ? Math.round(rentSummary.rent_collected_this_month / occupiedBeds)
    : 0;

  const currentMonth = todayIsoDateIST().slice(0, 7);
  const monthExpensesTotal = expenses
    .filter((e) => e.expense_date.startsWith(currentMonth))
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const oldestSnapshotDate = snapshots.reduce<string | null>(
    (earliest, s) =>
      earliest === null || s.snapshot_date < earliest ? s.snapshot_date : earliest,
    null
  );
  const oldestDaySnapshots = snapshots.filter(
    (s) => s.snapshot_date === oldestSnapshotDate
  );
  const oldestTotalBeds = oldestDaySnapshots.reduce((s, r) => s + Number(r.total_beds), 0);
  const oldestOccupiedBeds = oldestDaySnapshots.reduce((s, r) => s + Number(r.occupied_beds), 0);
  const oldestOccupancy =
    oldestTotalBeds > 0 ? (oldestOccupiedBeds / oldestTotalBeds) * 100 : null;
  const occupancyDelta =
    oldestOccupancy !== null
      ? Math.round((occupancyPct - oldestOccupancy) * 10) / 10
      : null;

  const totalReferralBookings = referrals.reduce((s, r) => s + Number(r.bookings_count), 0);
  const activeReferralBookings = referrals.reduce((s, r) => s + Number(r.active_bookings_count), 0);
  const totalCommission = referrals.reduce((s, r) => s + Number(r.total_commission), 0);

  const assetsNeedingRepair = assets.filter((a) => a.condition === "Needs Repair").length;

  // The accounting module ships its own SQL migrations (see
  // supabase/migrations/) that may not have been applied to this Supabase
  // project yet - fail soft into "not set up" rather than 500ing the whole
  // dashboard, matching the pattern used elsewhere (e.g. the Communications
  // pages) for optional modules with pending migrations.
  let financialPosition: {
    netWorth: number;
    totalAssets: number;
    totalLiabilities: number;
    cash: number;
    receivables: number;
    payables: number;
    depositsHeld: number;
    workingCapital: number;
    netFixedAssets: number;
    monthRevenue: number;
    monthExpenses: number;
    monthProfit: number;
    monthCashIn: number;
    monthCashOut: number;
    next30Inflow: number;
    next30Outflow: number;
    projectedCash30: number;
  } | null = null;

  if (await isFeatureEnabled("enable_accounting")) {
    try {
      const today = todayIsoDateIST();
      const now = new Date();
      const [netWorth, workingCapital, pnlSummary, cashFlow, cashForecast] = await Promise.all([
        getNetWorth(today),
        getWorkingCapital(today),
        getLedgerPnlSummary(now.getFullYear(), now.getMonth() + 1),
        getCashFlowStatement(now.getFullYear(), now.getMonth() + 1),
        getCashForecast(today, 1),
      ]);

      const cashIn = cashFlow.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
      const cashOut = cashFlow.filter((r) => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);
      const monthForecast = cashForecast[0];

      financialPosition = {
        netWorth: netWorth?.net_worth ?? 0,
        totalAssets: netWorth?.total_assets ?? 0,
        totalLiabilities: netWorth?.total_liabilities ?? 0,
        cash: workingCapital?.cash ?? 0,
        receivables: workingCapital?.accounts_receivable ?? 0,
        payables: workingCapital?.accounts_payable ?? 0,
        depositsHeld: workingCapital?.deposits_held ?? 0,
        workingCapital: workingCapital?.working_capital ?? 0,
        netFixedAssets: (netWorth?.total_assets ?? 0) - (workingCapital?.current_assets ?? 0),
        monthRevenue: pnlSummary?.total_revenue ?? 0,
        monthExpenses: pnlSummary?.total_expenses ?? 0,
        monthProfit: pnlSummary?.net_surplus ?? 0,
        monthCashIn: cashIn,
        monthCashOut: cashOut,
        next30Inflow: monthForecast?.expected_inflow ?? 0,
        next30Outflow: monthForecast?.expected_outflow ?? 0,
        projectedCash30: monthForecast?.projected_closing_cash ?? 0,
      };
    } catch {
      financialPosition = null;
    }
  }

  const cards = [
    statCard(
      "Occupancy",
      `${occupancyPct}%`,
      occupancyDelta !== null
        ? `${occupancyDelta >= 0 ? "+" : ""}${occupancyDelta} pts vs 30 days ago`
        : undefined
    ),
    statCard(
      "Collection Efficiency",
      `${collectionEfficiency}%`,
      `${formatMoney(rentSummary?.rent_collected_this_month ?? 0)} of ${formatMoney(rentSummary?.rent_due_this_month ?? 0)}`
    ),
    statCard(
      "Outstanding Rent",
      formatMoney(rentSummary?.outstanding_total ?? 0),
      `${rentSummary?.overdue_residents_count ?? 0} resident${rentSummary?.overdue_residents_count === 1 ? "" : "s"}`
    ),
    statCard(
      "ARPU (This Month)",
      formatMoney(arpu),
      "per occupied bed"
    ),
    statCard(
      "Expenses (This Month)",
      formatMoney(monthExpensesTotal)
    ),
    statCard(
      "Petty Cash Balance",
      formatMoney(pettyCashBalance)
    ),
    statCard(
      "Referral Bookings",
      `${totalReferralBookings}`,
      `${activeReferralBookings} active · ${formatMoney(totalCommission)} commission`
    ),
    statCard(
      "Assets Needing Repair",
      `${assetsNeedingRepair}`
    ),
  ];

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <a
          href="/"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Dashboard
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Owner Insights
          </p>
          <h1 className="mt-2 text-4xl font-bold">Owner KPIs</h1>
          <p className="mt-2 text-slate-500">
            Key ratios pulled live from existing reports across occupancy,
            collections, expenses, and vendor/referral activity.
          </p>
        </div>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {card.label}
              </p>
              <p className="mt-2 text-2xl font-bold">{card.value}</p>
              {card.sub && (
                <p className="mt-1 text-xs text-slate-400">{card.sub}</p>
              )}
            </div>
          ))}
        </section>

        {financialPosition && (
          <section className="mt-8">
            <h2 className="text-lg font-bold">Financial Position</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                statCard("Cash & Bank", formatMoney(financialPosition.cash)),
                statCard("Accounts Receivable", formatMoney(financialPosition.receivables)),
                statCard("Accounts Payable", formatMoney(financialPosition.payables)),
                statCard("Security Deposits Held", formatMoney(financialPosition.depositsHeld)),
                statCard("Net Fixed Assets", formatMoney(financialPosition.netFixedAssets)),
                statCard("Working Capital", formatMoney(financialPosition.workingCapital)),
                statCard("Net Worth", formatMoney(financialPosition.netWorth), "Owner Equity — not a business valuation"),
                statCard(
                  "This Month: Revenue / Expenses",
                  `${formatMoney(financialPosition.monthRevenue)} / ${formatMoney(financialPosition.monthExpenses)}`,
                  `Profit ${formatMoney(financialPosition.monthProfit)}`
                ),
                statCard(
                  "This Month: Cash In / Out",
                  `${formatMoney(financialPosition.monthCashIn)} / ${formatMoney(financialPosition.monthCashOut)}`
                ),
                statCard(
                  "Next 30 Days (Forecast)",
                  `${formatMoney(financialPosition.next30Inflow)} in / ${formatMoney(financialPosition.next30Outflow)} out`,
                  `Projected cash: ${formatMoney(financialPosition.projectedCash30)}`
                ),
              ].map((card) => (
                <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
                  <p className="mt-2 text-xl font-bold">{card.value}</p>
                  {card.sub && <p className="mt-1 text-xs text-slate-400">{card.sub}</p>}
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <a href="/accounting/balance-sheet" className="font-semibold text-indigo-600 hover:text-indigo-700">
                Balance Sheet →
              </a>
              <a href="/accounting/pnl" className="font-semibold text-indigo-600 hover:text-indigo-700">
                P&amp;L →
              </a>
              <a href="/accounting/net-worth" className="font-semibold text-indigo-600 hover:text-indigo-700">
                Net Worth →
              </a>
              <a href="/accounting/forecast" className="font-semibold text-indigo-600 hover:text-indigo-700">
                Forecast →
              </a>
            </div>
          </section>
        )}

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Hostel</th>
                <th className="px-4 py-3 text-right">Occupied</th>
                <th className="px-4 py-3 text-right">Vacant</th>
                <th className="px-4 py-3 text-right">Maintenance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {hostels.map((h) => (
                <tr key={h.hostel_id}>
                  <td className="px-4 py-3 font-semibold">{h.hostel_name}</td>
                  <td className="px-4 py-3 text-right">
                    {h.occupied_beds}/{h.total_beds}
                  </td>
                  <td className="px-4 py-3 text-right">{h.vacant_beds}</td>
                  <td className="px-4 py-3 text-right">{h.maintenance_beds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <a href="/owner/digest" className="font-semibold text-indigo-600 hover:text-indigo-700">
            Daily Digest →
          </a>
          <a href="/notifications" className="font-semibold text-indigo-600 hover:text-indigo-700">
            Notifications Centre →
          </a>
          <a href="/reports/monthly-pack" className="font-semibold text-indigo-600 hover:text-indigo-700">
            Monthly Report Pack →
          </a>
        </div>
      </div>
    </main>
  );
}
