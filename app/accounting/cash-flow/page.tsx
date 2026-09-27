import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { getHostelList } from "@/lib/hostel";
import { getCashFlowStatement, getCashBalanceAsOf } from "@/lib/accounting/queries";
import { formatMoney, todayIsoDateIST } from "@/lib/format";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type PageProps = {
  searchParams: Promise<{ month?: string; year?: string; hostel?: string }>;
};

export default async function CashFlowPage({ searchParams }: PageProps) {
  await requirePermission("viewFinancialReports");
  if (!(await isFeatureEnabled("enable_accounting"))) notFound();

  const [todayYear, todayMonth] = todayIsoDateIST().split("-").map(Number);
  const { month: monthParam, year: yearParam, hostel } = await searchParams;
  const month = monthParam ? Number(monthParam) : todayMonth;
  const year = yearParam ? Number(yearParam) : todayYear;
  const hostelName = hostel || "";

  const periodStart = new Date(year, month - 1, 1).toISOString().slice(0, 10);
  const periodEnd = new Date(year, month, 0).toISOString().slice(0, 10);
  const dayBeforeStart = new Date(year, month - 1, 0).toISOString().slice(0, 10);

  const [rows, openingCash, closingCash, hostels] = await Promise.all([
    getCashFlowStatement(year, month, hostelName || null),
    getCashBalanceAsOf(dayBeforeStart, hostelName || null),
    getCashBalanceAsOf(periodEnd, hostelName || null),
    getHostelList(),
  ]);

  const operating = rows.filter((r) => r.category === "Operating");
  const investing = rows.filter((r) => r.category === "Investing");
  const financing = rows.filter((r) => r.category === "Financing");
  const netChange = closingCash - openingCash;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <a href="/" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
          ← Back to Dashboard
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Accounting</p>
          <h1 className="mt-2 text-4xl font-bold">
            Cash Flow Statement — {MONTHS[month - 1]} {year}
          </h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Direct method — actual Cash/Bank/UPI movement classified by source, from {periodStart} to{" "}
            {periodEnd}. Security deposit receipts/refunds are classified separately from rent
            revenue, never combined with it.
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
            <input type="number" name="year" defaultValue={year} className="mt-1 w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
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

        <section className="mt-6 space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {[
            { label: "Operating Activities", rows: operating },
            { label: "Investing Activities", rows: investing },
            { label: "Financing Activities", rows: financing },
          ].map(({ label, rows: sectionRows }) => (
            <div key={label}>
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{label}</h2>
              <dl className="mt-3 space-y-2">
                {sectionRows.length === 0 && <p className="text-sm text-slate-400">No activity.</p>}
                {sectionRows.map((r) => (
                  <div key={r.line_item} className="flex justify-between text-sm">
                    <dt>{r.line_item}</dt>
                    <dd className={`font-semibold ${r.amount < 0 ? "text-red-700" : ""}`}>{formatMoney(r.amount)}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-sm font-bold">
                <span>Net {label}</span>
                <span>{formatMoney(sectionRows.reduce((s, r) => s + r.amount, 0))}</span>
              </div>
            </div>
          ))}

          <div className="space-y-2 border-t border-slate-200 pt-4 text-sm">
            <div className="flex justify-between">
              <span>Opening Cash &amp; Bank</span>
              <span className="font-semibold">{formatMoney(openingCash)}</span>
            </div>
            <div className="flex justify-between">
              <span>Net Change in Cash</span>
              <span className={`font-semibold ${netChange < 0 ? "text-red-700" : ""}`}>{formatMoney(netChange)}</span>
            </div>
            <div className="flex justify-between rounded-xl bg-slate-50 px-4 py-3 text-lg font-bold">
              <span>Closing Cash &amp; Bank</span>
              <span>{formatMoney(closingCash)}</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
