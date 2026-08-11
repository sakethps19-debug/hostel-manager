import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import { formatMoney, formatFiscalYear, todayIsoDateIST } from "@/lib/format";
import PrintButton from "../../owner/digest/PrintButton";

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

type ExpenseRow = {
  expense_date: string;
  category: string;
  amount: number;
};

type ReferralPerformanceRow = {
  name: string;
  bookings_count: number;
  active_bookings_count: number;
  total_commission: number;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type PageProps = {
  searchParams: Promise<{ month?: string; year?: string }>;
};

export default async function MonthlyReportPackPage({ searchParams }: PageProps) {
  await requirePermission("viewFinancialReports");

  const params = await searchParams;
  const [todayYear, todayMonth] = todayIsoDateIST().split("-").map(Number);
  const parsedMonth = Number(params.month);
  const parsedYear = Number(params.year);
  const month =
    Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
      ? parsedMonth
      : todayMonth;
  const year =
    Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
      ? parsedYear
      : todayYear;
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;

  const [pnl, metrics, expenses, referrals] = await Promise.all([
    callRpcServer<PnlRow[]>("get_hostel_pnl", { p_month: month, p_year: year }),
    callRpcServer<MetricsRow[]>("get_hostel_metrics_snapshot"),
    callRpcServer<ExpenseRow[]>("get_expenses"),
    callRpcServer<ReferralPerformanceRow[]>("get_referral_performance"),
  ]);

  const monthExpenses = expenses.filter((e) => e.expense_date.startsWith(monthPrefix));

  const expensesByCategory = new Map<string, number>();
  for (const e of monthExpenses) {
    expensesByCategory.set(
      e.category,
      (expensesByCategory.get(e.category) || 0) + Number(e.amount)
    );
  }

  const totalRentRevenue = pnl.reduce((s, p) => s + Number(p.rent_revenue), 0);
  const totalOtherRevenue = pnl.reduce((s, p) => s + Number(p.other_revenue), 0);
  const totalExpenses = pnl.reduce((s, p) => s + Number(p.operating_expenses), 0);
  const totalSurplus = pnl.reduce((s, p) => s + Number(p.net_surplus), 0);

  const totalReferralBookings = referrals.reduce((s, r) => s + Number(r.bookings_count), 0);
  const totalCommission = referrals.reduce((s, r) => s + Number(r.total_commission), 0);

  const prevParams = month === 1
    ? { month: "12", year: String(year - 1) }
    : { month: String(month - 1), year: String(year) };
  const nextParams = month === 12
    ? { month: "1", year: String(year + 1) }
    : { month: String(month + 1), year: String(year) };

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900 print:bg-white">
      <div className="mx-auto max-w-4xl">
        <a
          href="/"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 print:hidden"
        >
          ← Back to Dashboard
        </a>

        <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              Owner Insights
            </p>
            <h1 className="mt-2 text-4xl font-bold">
              Monthly Report Pack — {MONTH_NAMES[month - 1]} {year}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {formatFiscalYear(month, year)}
            </p>
          </div>
          <PrintButton />
        </div>

        <div className="mt-3 flex gap-3 text-sm print:hidden">
          <a
            href={`/reports/monthly-pack?month=${prevParams.month}&year=${prevParams.year}`}
            className="font-semibold text-indigo-600 hover:text-indigo-700"
          >
            ← Previous Month
          </a>
          <a
            href={`/reports/monthly-pack?month=${nextParams.month}&year=${nextParams.year}`}
            className="font-semibold text-indigo-600 hover:text-indigo-700"
          >
            Next Month →
          </a>
        </div>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Consolidated P&amp;L</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Rent Revenue</p>
              <p className="mt-1 text-xl font-bold text-emerald-600">{formatMoney(totalRentRevenue)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Other Revenue</p>
              <p className="mt-1 text-xl font-bold text-emerald-600">{formatMoney(totalOtherRevenue)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Operating Expenses</p>
              <p className="mt-1 text-xl font-bold text-red-600">{formatMoney(totalExpenses)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Net Surplus</p>
              <p className="mt-1 text-xl font-bold">{formatMoney(totalSurplus)}</p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Hostel</th>
                  <th className="px-4 py-2 text-right">Rent Revenue</th>
                  <th className="px-4 py-2 text-right">Other Revenue</th>
                  <th className="px-4 py-2 text-right">Expenses</th>
                  <th className="px-4 py-2 text-right">Net Surplus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pnl.map((p) => (
                  <tr key={p.hostel_name}>
                    <td className="px-4 py-2 font-semibold">{p.hostel_name}</td>
                    <td className="px-4 py-2 text-right">{formatMoney(p.rent_revenue)}</td>
                    <td className="px-4 py-2 text-right">{formatMoney(p.other_revenue)}</td>
                    <td className="px-4 py-2 text-right">{formatMoney(p.operating_expenses)}</td>
                    <td className="px-4 py-2 text-right font-semibold">{formatMoney(p.net_surplus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Occupancy &amp; Outstanding (Current)</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Hostel</th>
                  <th className="px-4 py-2 text-right">Occupancy</th>
                  <th className="px-4 py-2 text-right">Outstanding Rent</th>
                  <th className="px-4 py-2 text-right">Deposits Held</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metrics.map((m) => (
                  <tr key={m.hostel_name}>
                    <td className="px-4 py-2 font-semibold">{m.hostel_name}</td>
                    <td className="px-4 py-2 text-right">
                      {m.occupied_beds}/{m.total_beds} ({m.occupancy_pct}%)
                    </td>
                    <td className="px-4 py-2 text-right">{formatMoney(m.outstanding_rent_total)}</td>
                    <td className="px-4 py-2 text-right">{formatMoney(m.deposits_held_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Expenses by Category — {MONTH_NAMES[month - 1]}</h2>
          {expensesByCategory.size === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No expenses recorded this month.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Category</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.from(expensesByCategory.entries())
                    .sort((a, b) => b[1] - a[1])
                    .map(([category, amount]) => (
                      <tr key={category}>
                        <td className="px-4 py-2 font-semibold">{category}</td>
                        <td className="px-4 py-2 text-right">{formatMoney(amount)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Referral Performance (All-Time)</h2>
          <p className="mt-2 text-sm text-slate-500">
            {totalReferralBookings} bookings sourced via referrals ·{" "}
            {formatMoney(totalCommission)} total commission paid.
          </p>
        </section>
      </div>
    </main>
  );
}
