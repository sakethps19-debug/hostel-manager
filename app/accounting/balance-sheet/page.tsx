import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { getHostelList } from "@/lib/hostel";
import { getBalanceSheet, verifyBalanceSheetBalances } from "@/lib/accounting/queries";
import { formatMoney, todayIsoDateIST } from "@/lib/format";
import type { BalanceSheetRow } from "@/lib/accounting/types";
import XlsxExportButton from "@/components/XlsxExportButton";

type PageProps = {
  searchParams: Promise<{ as_of?: string; hostel?: string }>;
};

function Section({
  title,
  rows,
  hostelName,
}: {
  title: string;
  rows: BalanceSheetRow[];
  hostelName: string;
}) {
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  return (
    <div>
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h2>
      <dl className="mt-3 space-y-2">
        {rows
          .filter((r) => Math.round(r.amount * 100) !== 0)
          .map((r) => (
            <div key={r.account_code} className="flex justify-between text-sm">
              <dt>
                {r.account_code === "3199" ? (
                  r.account_name
                ) : (
                  <a
                    href={`/accounting/ledger?account=${r.account_code}&hostel=${encodeURIComponent(hostelName)}`}
                    className="text-indigo-600 hover:text-indigo-700"
                  >
                    {r.account_name}
                  </a>
                )}
              </dt>
              <dd className="font-semibold">{formatMoney(r.amount)}</dd>
            </div>
          ))}
        {rows.length === 0 && <p className="text-sm text-slate-400">Nothing posted.</p>}
      </dl>
      <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-sm font-bold">
        <span>Total {title}</span>
        <span>{formatMoney(total)}</span>
      </div>
    </div>
  );
}

export default async function BalanceSheetPage({ searchParams }: PageProps) {
  await requirePermission("viewFinancialReports");
  if (!(await isFeatureEnabled("enable_accounting"))) notFound();

  const { as_of: asOfParam, hostel } = await searchParams;
  const asOf = asOfParam || todayIsoDateIST();
  const hostelName = hostel || "";

  const [rows, balanced, hostels] = await Promise.all([
    getBalanceSheet(asOf, hostelName || null),
    verifyBalanceSheetBalances(asOf, hostelName || null),
    getHostelList(),
  ]);

  const assets = rows.filter((r) => r.section === "asset");
  const liabilities = rows.filter((r) => r.section === "liability");
  const equity = rows.filter((r) => r.section === "equity");
  const totalAssets = assets.reduce((sum, r) => sum + r.amount, 0);
  const totalLiabEquity = [...liabilities, ...equity].reduce((sum, r) => sum + r.amount, 0);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <a href="/" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
          ← Back to Dashboard
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Accounting</p>
          <h1 className="mt-2 text-4xl font-bold">Balance Sheet</h1>
          <p className="mt-2 max-w-2xl text-slate-500">As of {asOf}.</p>
        </div>

        <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            As of
            <input type="date" name="as_of" defaultValue={asOf} className="mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
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
            filename={`balance-sheet-${asOf}`}
            sheetName="Balance Sheet"
            columns={[
              { header: "Section", key: "section" },
              { header: "Account", key: "name" },
              { header: "Amount", key: "amount", type: "number" },
            ]}
            rows={rows.map((r) => ({ section: r.section, name: r.account_name, amount: r.amount }))}
          />
        </form>

        <div className={`mt-6 rounded-2xl px-5 py-4 text-sm font-semibold ${balanced ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {balanced
            ? `Balanced — Assets ${formatMoney(totalAssets)} = Liabilities + Equity ${formatMoney(totalLiabEquity)}.`
            : `NOT BALANCED — Assets ${formatMoney(totalAssets)} vs Liabilities + Equity ${formatMoney(totalLiabEquity)}. Check the Reconciliation page.`}
        </div>

        <section className="mt-5 grid gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Section title="Assets" rows={assets} hostelName={hostelName} />
          <Section title="Liabilities" rows={liabilities} hostelName={hostelName} />
          <Section title="Equity" rows={equity} hostelName={hostelName} />
        </section>
      </div>
    </main>
  );
}
