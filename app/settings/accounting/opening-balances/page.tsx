import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { getChartOfAccounts } from "@/lib/accounting/queries";
import { getHostelList } from "@/lib/hostel";
import OpeningBalancesView from "./OpeningBalancesView";

type BatchRow = {
  batch_id: number;
  as_of_date: string;
  status: "draft" | "posted";
  journal_entry_id: number | null;
  created_at: string;
  posted_at: string | null;
};

export default async function OpeningBalancesPage() {
  await requirePermission("manageOpeningBalances");
  if (!(await isFeatureEnabled("enable_accounting"))) notFound();

  const [batches, accounts, hostels] = await Promise.all([
    callRpcServer<BatchRow[]>("get_opening_balance_batches"),
    getChartOfAccounts(),
    getHostelList(),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <a href="/" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
          ← Back to Dashboard
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Accounting Configuration
          </p>
          <h1 className="mt-2 text-4xl font-bold">Opening Balances</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Since this ledger starts recording from whenever it's switched on, not from when the
            hostel business actually began, enter the balances that existed as of a chosen date here
            — cash on hand, bank balance, existing fixed assets and their accumulated depreciation,
            outstanding receivables/payables, resident deposits already held, and owner capital. A
            batch must balance (debits = credits) before it can be posted; use the Opening Balance
            Equity account as a plug if the true owner capital figure isn't yet determined.
          </p>
        </div>

        <OpeningBalancesView initialBatches={batches} accounts={accounts} hostelNames={hostels.map((h) => h.hostel_name)} />
      </div>
    </main>
  );
}
