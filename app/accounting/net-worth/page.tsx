import { notFound } from "next/navigation";
import { requirePermission, getMyRole } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { getHostelList } from "@/lib/hostel";
import { getNetWorth, getBalanceSnapshots } from "@/lib/accounting/queries";
import { formatMoney, todayIsoDateIST } from "@/lib/format";
import CaptureSnapshotButton from "./CaptureSnapshotButton";

type PageProps = {
  searchParams: Promise<{ hostel?: string }>;
};

function monthsAgoIso(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

export default async function NetWorthPage({ searchParams }: PageProps) {
  await requirePermission("viewFinancialReports");
  if (!(await isFeatureEnabled("enable_accounting"))) notFound();

  const role = await getMyRole();
  const canCaptureSnapshot = hasPermission(role, "manageAccountingPeriod") || hasPermission(role, "manageJournalEntries");

  const { hostel } = await searchParams;
  const hostelName = hostel || "";
  const today = todayIsoDateIST();
  const oneMonthAgo = monthsAgoIso(1);

  const [current, previous, snapshots, hostels] = await Promise.all([
    getNetWorth(today, hostelName || null),
    getNetWorth(oneMonthAgo, hostelName || null),
    getBalanceSnapshots(hostelName || null, monthsAgoIso(12), today),
    getHostelList(),
  ]);

  const currentNetWorth = current?.net_worth ?? 0;
  const previousNetWorth = previous?.net_worth ?? 0;
  const change = currentNetWorth - previousNetWorth;
  const changePct = previousNetWorth !== 0 ? (change / Math.abs(previousNetWorth)) * 100 : null;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <a href="/" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
          ← Back to Dashboard
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Accounting</p>
          <h1 className="mt-2 text-4xl font-bold">Net Worth</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Total Assets minus Total Liabilities — accounting net worth / owner equity. This is not a
            business valuation: it doesn&apos;t reflect goodwill, brand value, or future earnings potential.
          </p>
        </div>

        <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
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
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Assets</p>
            <p className="mt-2 text-2xl font-bold">{formatMoney(current?.total_assets || 0)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Liabilities</p>
            <p className="mt-2 text-2xl font-bold">{formatMoney(current?.total_liabilities || 0)}</p>
          </div>
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Net Worth</p>
            <p className="mt-2 text-2xl font-bold text-indigo-800">{formatMoney(currentNetWorth)}</p>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Change vs. Last Month</h2>
          <div className="mt-3 flex items-center gap-4">
            <p className={`text-xl font-bold ${change >= 0 ? "text-emerald-700" : "text-red-700"}`}>
              {change >= 0 ? "+" : ""}
              {formatMoney(change)}
            </p>
            {changePct !== null && (
              <p className={`text-sm font-semibold ${change >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                ({change >= 0 ? "+" : ""}
                {changePct.toFixed(1)}%)
              </p>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Compared to {oneMonthAgo} — computed live from the ledger, not from a stored snapshot.
          </p>
        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Net Worth Trend</h2>
            {canCaptureSnapshot && <CaptureSnapshotButton hostelName={hostelName || null} />}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Built from captured month-end snapshots — capture one each month (e.g. as part of Month
            Close) to build up history here.
          </p>

          {snapshots.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">No snapshots captured yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2 text-right">Total Assets</th>
                    <th className="px-4 py-2 text-right">Total Liabilities</th>
                    <th className="px-4 py-2 text-right">Net Worth</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {snapshots.map((s) => (
                    <tr key={s.snapshot_id}>
                      <td className="px-4 py-2">{s.snapshot_date}</td>
                      <td className="px-4 py-2 text-right">{formatMoney(s.total_assets)}</td>
                      <td className="px-4 py-2 text-right">{formatMoney(s.total_liabilities)}</td>
                      <td className="px-4 py-2 text-right font-semibold">{formatMoney(s.net_worth)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
