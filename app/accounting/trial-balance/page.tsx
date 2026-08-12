import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { getHostelList } from "@/lib/hostel";
import { getTrialBalance } from "@/lib/accounting/queries";
import { formatMoney, todayIsoDateIST } from "@/lib/format";
import XlsxExportButton from "@/components/XlsxExportButton";

type PageProps = {
  searchParams: Promise<{ as_of?: string; hostel?: string }>;
};

export default async function TrialBalancePage({ searchParams }: PageProps) {
  await requirePermission("viewFinancialReports");
  if (!(await isFeatureEnabled("enable_accounting"))) notFound();

  const { as_of: asOfParam, hostel: hostelParam } = await searchParams;
  const asOf = asOfParam || todayIsoDateIST();
  const hostelName = hostelParam || "";

  const [rows, hostels] = await Promise.all([
    getTrialBalance(asOf, hostelName || null),
    getHostelList(),
  ]);

  const totalDebit = rows.reduce((sum, r) => sum + r.debit_balance, 0);
  const totalCredit = rows.reduce((sum, r) => sum + r.credit_balance, 0);
  const balanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <a href="/" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
          ← Back to Dashboard
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Accounting</p>
          <h1 className="mt-2 text-4xl font-bold">Trial Balance</h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            Every account&apos;s debit or credit balance as of the selected date. Total debits must equal
            total credits — every financial statement in this module depends on that holding true.
          </p>
        </div>

        <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            As of
            <input
              type="date"
              name="as_of"
              defaultValue={asOf}
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
          <button
            type="submit"
            className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white"
          >
            Apply
          </button>

          <XlsxExportButton
            filename={`trial-balance-${asOf}`}
            sheetName="Trial Balance"
            columns={[
              { header: "Code", key: "code" },
              { header: "Account", key: "name" },
              { header: "Type", key: "type" },
              { header: "Debit", key: "debit", type: "number" },
              { header: "Credit", key: "credit", type: "number" },
            ]}
            rows={rows.map((r) => ({
              code: r.account_code,
              name: r.account_name,
              type: r.account_type,
              debit: r.debit_balance,
              credit: r.credit_balance,
            }))}
          />
        </form>

        <div
          className={`mt-6 rounded-2xl px-5 py-4 text-sm font-semibold ${
            balanced ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {balanced
            ? `Balanced — total debits and credits both ${formatMoney(totalDebit)}.`
            : `NOT BALANCED — debits ${formatMoney(totalDebit)} vs credits ${formatMoney(totalCredit)}. Check the Reconciliation page.`}
        </div>

        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Debit</th>
                  <th className="px-4 py-3 text-right">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.account_code} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-400">{r.account_code}</td>
                    <td className="px-4 py-3">
                      <a
                        href={`/accounting/ledger?account=${r.account_code}&hostel=${encodeURIComponent(hostelName)}`}
                        className="font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        {r.account_name}
                      </a>
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-500">{r.account_type}</td>
                    <td className="px-4 py-3 text-right">{r.debit_balance ? formatMoney(r.debit_balance) : "-"}</td>
                    <td className="px-4 py-3 text-right">{r.credit_balance ? formatMoney(r.credit_balance) : "-"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                <tr>
                  <td className="px-4 py-3" colSpan={3}>
                    Total
                  </td>
                  <td className="px-4 py-3 text-right">{formatMoney(totalDebit)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
