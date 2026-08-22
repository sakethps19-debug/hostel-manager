import { requirePermission } from "@/lib/auth";
import { getChartOfAccounts } from "@/lib/accounting/queries";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import AccountingConfigView from "./AccountingConfigView";

type SettingRow = { setting_key: string; setting_value: string };

export default async function AccountingConfigPage() {
  await requirePermission("manageChartOfAccounts");

  const [accounts, settings] = await Promise.all([
    getChartOfAccounts(),
    callRpcServer<SettingRow[]>("get_accounting_settings"),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <a href="/" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
          ← Back to Dashboard
        </a>

        <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              Accounting Configuration
            </p>
            <h1 className="mt-2 text-4xl font-bold">Chart of Accounts</h1>
            <p className="mt-2 max-w-2xl text-slate-500">
              Owner-only. Existing accounts marked &ldquo;System&rdquo; are referenced by name from the
              posting logic and can be deactivated but not deleted.
            </p>
          </div>
          <a
            href="/settings/accounting/opening-balances"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Opening Balances →
          </a>
        </div>

        <AccountingConfigView initialAccounts={accounts} initialSettings={settings} />
      </div>
    </main>
  );
}
