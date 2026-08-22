import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { getHostelList } from "@/lib/hostel";
import { getChartOfAccounts, getGeneralLedger } from "@/lib/accounting/queries";
import { formatDate, formatMoney, todayIsoDateIST } from "@/lib/format";

type PageProps = {
  searchParams: Promise<{ account?: string; from?: string; to?: string; hostel?: string }>;
};

function defaultFromDate() {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}

export default async function GeneralLedgerPage({ searchParams }: PageProps) {
  await requirePermission("viewFinancialReports");
  if (!(await isFeatureEnabled("enable_accounting"))) notFound();

  const { account, from, to, hostel } = await searchParams;
  const accounts = await getChartOfAccounts();
  const selectedAccount = account || accounts[0]?.code || "";
  const fromDate = from || defaultFromDate();
  const toDate = to || todayIsoDateIST();
  const hostelName = hostel || "";

  const [rows, hostels] = await Promise.all([
    selectedAccount ? getGeneralLedger(selectedAccount, fromDate, toDate, hostelName || null) : Promise.resolve([]),
    getHostelList(),
  ]);

  const selected = accounts.find((a) => a.code === selectedAccount);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <a href="/" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
          ← Back to Dashboard
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Accounting</p>
          <h1 className="mt-2 text-4xl font-bold">General Ledger</h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            Every transaction posted to a single account, with a running balance — the drill-down
            target from any figure on the Balance Sheet, P&L, or Trial Balance.
          </p>
        </div>

        <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            Account
            <select
              name="account"
              defaultValue={selectedAccount}
              className="mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
            >
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            From
            <input
              type="date"
              name="from"
              defaultValue={fromDate}
              className="mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
            />
          </label>
          <label className="block text-sm">
            To
            <input
              type="date"
              name="to"
              defaultValue={toDate}
              className="mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
            />
          </label>
          <label className="block text-sm">
            Hostel
            <select
              name="hostel"
              defaultValue={hostelName}
              className="mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
            >
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

        {selected && (
          <p className="mt-4 text-sm text-slate-500">
            {selected.name} · Normal balance: {selected.normal_balance}
          </p>
        )}

        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {rows.length === 0 ? (
            <div className="px-6 py-16 text-center text-slate-500">No transactions in this range.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Narration</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3 text-right">Debit</th>
                    <th className="px-4 py-3 text-right">Credit</th>
                    <th className="px-4 py-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.journal_entry_line_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(r.entry_date)}</td>
                      <td className="px-4 py-3">
                        <a
                          href={`/accounting/journal-entries/${r.journal_entry_id}`}
                          className="text-indigo-600 hover:text-indigo-700"
                        >
                          {r.narration}
                        </a>
                        {r.memo && <p className="text-xs text-slate-400">{r.memo}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{r.source_type}</td>
                      <td className="px-4 py-3 text-right">{r.debit ? formatMoney(r.debit) : "-"}</td>
                      <td className="px-4 py-3 text-right">{r.credit ? formatMoney(r.credit) : "-"}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatMoney(r.running_balance)}</td>
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
