import CashReconciliationView from "./CashReconciliationView";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import { getHostelList } from "@/lib/hostel";

type ReconciliationRow = {
  reconciliation_id: number;
  reconciliation_date: string;
  hostel_name: string | null;
  expected_balance: number;
  counted_balance: number;
  variance: number;
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
};

async function getReconciliations(): Promise<ReconciliationRow[]> {
  return callRpcServer<ReconciliationRow[]>("get_cash_reconciliations");
}

export default async function CashReconciliationPage() {
  await requirePermission("manageExpenses");

  const [reconciliations, hostels] = await Promise.all([
    getReconciliations(),
    getHostelList(),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <a
          href="/expenses/petty-cash"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Petty Cash
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Hostel Management
          </p>
          <h1 className="mt-2 text-4xl font-bold">Cash Reconciliation</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Compare the physical cash count against the petty cash
            ledger&apos;s expected balance and record any variance.
          </p>
        </div>

        <CashReconciliationView
          reconciliations={reconciliations}
          hostelNames={hostels.map((h) => h.hostel_name)}
        />
      </div>
    </main>
  );
}
