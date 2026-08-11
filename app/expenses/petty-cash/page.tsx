import PettyCashView from "./PettyCashView";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import { getHostelList } from "@/lib/hostel";

type PettyCashTransactionRow = {
  transaction_id: number;
  hostel_name: string | null;
  transaction_type: string;
  amount: number;
  description: string;
  transaction_date: string;
  running_balance: number;
  created_at: string;
};

async function getTransactions(): Promise<PettyCashTransactionRow[]> {
  return callRpcServer<PettyCashTransactionRow[]>(
    "get_petty_cash_transactions"
  );
}

async function getBalance(): Promise<number> {
  return callRpcServer<number>("get_petty_cash_balance");
}

export default async function PettyCashPage() {
  await requirePermission("manageExpenses");

  const [transactions, balance, hostels] = await Promise.all([
    getTransactions(),
    getBalance(),
    getHostelList(),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <a
          href="/expenses"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Expenses
        </a>

        <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              Hostel Management
            </p>
            <h1 className="mt-2 text-4xl font-bold">Petty Cash / Cashbook</h1>
            <p className="mt-2 max-w-2xl text-slate-500">
              A running ledger for cash-in-hand: top-ups and cash spends,
              kept separate from the main Expenses log for reconciliation.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 text-right shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Current Balance
            </p>
            <p className="mt-1 text-2xl font-bold">
              Rs. {Number(balance).toLocaleString("en-IN")}
            </p>
          </div>
        </div>

        <PettyCashView
          transactions={transactions}
          hostelNames={hostels.map((h) => h.hostel_name)}
        />
      </div>
    </main>
  );
}
