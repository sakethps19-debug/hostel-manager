import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { getHostelList } from "@/lib/hostel";
import { getLedgerPnl, getLedgerPnlSummary } from "@/lib/accounting/queries";
import { formatMoney, formatFiscalYear } from "@/lib/format";
import XlsxExportButton from "@/components/XlsxExportButton";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type PageProps = {
  searchParams: Promise<{ month?: string; year?: string; hostel?: string }>;
};

export default async function LedgerPnlPage({ searchParams }: PageProps) {
  await requirePermission("viewFinancialReports");
  if (!(await isFeatureEnabled("enable_accounting"))) notFound();

  const now = new Date();
  const { month: monthParam, year: yearParam, hostel } = await searchParams;
  const month = monthParam ? Number(monthParam) : now.getMonth() + 1;
  const year = yearParam ? Number(yearParam) : now.getFullYear();
  const hostelName = hostel || "";

  const [rows, summary, hostels] = await Promise.all([
    getLedgerPnl(year, month, hostelName || null),
    getLedgerPnlSummary(year, month, hostelName || null),
    getHostelList(),
  ]);

  const revenueRows = rows.filter((r) => r.account_type === "income");
  const expenseRows = rows.filter((r) => r.account_type === "expense");

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <a href="/" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
          ← Back to Dashboard
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Accounting · {formatFiscalYear(month, year)}
          </p>
          <h1 className="mt-2 text-4xl font-bold">
            Profit &amp; Loss — {MONTHS[month - 1]} {year}
          </h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Built from the general ledger (accrual basis) — revenue is recognized when rent becomes
            due, not when it&apos;s collected.
          </p>
        </div>

        <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            Month
            <select name="month" defaultValue={month} className="mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none">
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Year
            <input
              type="number"
              name="year"
              defaultValue={year}
              className="mt-1 w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
            />
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

          <XlsxExportButton
            filename={`pnl-${year}-${String(month).padStart(2, "0")}`}
            sheetName="P&L"
            columns={[
              { header: "Section", key: "section" },
              { header: "Account", key: "name" },
              { header: "Amount", key: "amount", type: "number" },
            ]}
            rows={[
              ...revenueRows.map((r) => ({ section: "Revenue", name: r.account_name, amount: r.amount })),
              { section: "Revenue", name: "Total Revenue", amount: summary?.total_revenue || 0 },
              ...expenseRows.map((r) => ({ section: "Expense", name: r.account_name, amount: r.amount })),
              { section: "Expense", name: "Total Expenses", amount: summary?.total_expenses || 0 },
              { section: "Summary", name: "Net Operating Surplus", amount: summary?.net_surplus || 0 },
            ]}
          />
        </form>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Revenue</h2>
          <dl className="mt-3 space-y-2">
            {revenueRows.map((r) => (
              <div key={r.account_code} className="flex justify-between text-sm">
                <dt>
                  <a href={`/accounting/ledger?account=${r.account_code}&hostel=${encodeURIComponent(hostelName)}`} className="text-indigo-600 hover:text-indigo-700">
                    {r.account_name}
                  </a>
                </dt>
                <dd className="font-semibold">{formatMoney(r.amount)}</dd>
              </div>
            ))}
            {revenueRows.length === 0 && <p className="text-sm text-slate-400">No revenue posted this period.</p>}
          </dl>
          <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-sm font-bold">
            <span>Total Revenue</span>
            <span>{formatMoney(summary?.total_revenue || 0)}</span>
          </div>

          <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">Expenses</h2>
          <dl className="mt-3 space-y-2">
            {expenseRows.map((r) => (
              <div key={r.account_code} className="flex justify-between text-sm">
                <dt>
                  <a href={`/accounting/ledger?account=${r.account_code}&hostel=${encodeURIComponent(hostelName)}`} className="text-indigo-600 hover:text-indigo-700">
                    {r.account_name}
                  </a>
                </dt>
                <dd className="font-semibold">{formatMoney(r.amount)}</dd>
              </div>
            ))}
            {expenseRows.length === 0 && <p className="text-sm text-slate-400">No expenses posted this period.</p>}
          </dl>
          <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-sm font-bold">
            <span>Total Operating Expenses</span>
            <span>{formatMoney(summary?.total_expenses || 0)}</span>
          </div>

          <div
            className={`mt-6 flex justify-between rounded-xl px-4 py-3 text-lg font-bold ${
              (summary?.net_surplus || 0) >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            <span>Net Operating Surplus</span>
            <span>{formatMoney(summary?.net_surplus || 0)}</span>
          </div>
        </section>

        <p className="mt-4 text-xs text-slate-400">
          A separate, pre-existing P&amp;L (Reports → P&amp;L) sums operational tables directly and
          remains available for cross-checking — the Reconciliation page flags if the two ever
          disagree by more than rounding.
        </p>
      </div>
    </main>
  );
}
