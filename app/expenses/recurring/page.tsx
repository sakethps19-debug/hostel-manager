import RecurringExpensesView from "./RecurringExpensesView";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import { getHostelList } from "@/lib/hostel";

type RecurringTemplateRow = {
  template_id: number;
  hostel_name: string | null;
  category: string;
  amount: number;
  vendor: string | null;
  payment_mode: string;
  reference_number: string | null;
  notes: string | null;
  day_of_month: number;
  is_active: boolean;
  last_generated_for: string | null;
};

async function getTemplates(): Promise<RecurringTemplateRow[]> {
  return callRpcServer<RecurringTemplateRow[]>(
    "get_recurring_expense_templates"
  );
}

export default async function RecurringExpensesPage() {
  await requirePermission("manageExpenses");

  const [templates, hostels] = await Promise.all([
    getTemplates(),
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

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Hostel Management
          </p>
          <h1 className="mt-2 text-4xl font-bold">Recurring Expenses</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Set up expenses that repeat every month (rent, salaries,
            estimated utilities). Use &quot;Generate Due Expenses&quot; to
            record this month&apos;s occurrences into the main{" "}
            <a
              href="/expenses"
              className="font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Expenses log →
            </a>
            .
          </p>
        </div>

        <RecurringExpensesView
          templates={templates}
          hostelNames={hostels.map((h) => h.hostel_name)}
        />
      </div>
    </main>
  );
}
