import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { getReconciliationFlags } from "@/lib/accounting/queries";
import ReconciliationView from "./ReconciliationView";

export default async function ReconciliationPage() {
  await requirePermission("viewFinancialReports");
  if (!(await isFeatureEnabled("enable_accounting"))) notFound();

  const flags = await getReconciliationFlags(false);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <a href="/" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
          ← Back to Dashboard
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Accounting</p>
          <h1 className="mt-2 text-4xl font-bold">Reconciliation</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Checks the ledger for exceptions — unbalanced entries, transactions missing their
            accounting posting, and the Asset Register&apos;s depreciation cache drifting from the ledger.
            Numbers on the financial statements are never silently displayed if a check like this
            fails; they&apos;re flagged here instead.
          </p>
        </div>

        <ReconciliationView initialFlags={flags} />
      </div>
    </main>
  );
}
