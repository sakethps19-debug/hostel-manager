import NewExpenseForm from "./NewExpenseForm";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";

type HostelRow = {
  hostel_name: string;
};

async function getHostelNames(): Promise<string[]> {
  const hostels = await callRpcServer<HostelRow[]>("get_hostel_dashboard");
  return hostels.map((h) => h.hostel_name);
}

export default async function NewExpensePage() {
  await requirePermission("manageExpenses");

  const hostelNames = await getHostelNames();

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <a
          href="/expenses"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Expenses
        </a>

        <div className="mt-7">
          <h1 className="text-4xl font-bold">Record Expense</h1>
          <p className="mt-2 text-slate-500">
            Security deposits and refunds are tracked separately as deposit
            transactions, not as expenses.
          </p>
        </div>

        <NewExpenseForm hostelNames={hostelNames} />
      </div>
    </main>
  );
}
