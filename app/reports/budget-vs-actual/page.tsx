import { notFound } from "next/navigation";
import BudgetVsActualView from "./BudgetVsActualView";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import { getHostelList } from "@/lib/hostel";
import { todayIsoDateIST } from "@/lib/format";
import { isFeatureEnabled } from "@/lib/featureFlags";

type BudgetRow = {
  budget_id: number;
  category: string;
  hostel_name: string | null;
  monthly_budget_amount: number;
  notes: string | null;
  updated_at: string;
};

type BudgetVsActualRow = {
  category: string;
  hostel_name: string | null;
  budgeted_amount: number;
  actual_amount: number;
  variance: number;
};

type PageProps = {
  searchParams: Promise<{ month?: string; year?: string }>;
};

async function getBudgets(): Promise<BudgetRow[]> {
  return callRpcServer<BudgetRow[]>("get_expense_budgets");
}

async function getBudgetVsActual(
  month: number,
  year: number
): Promise<BudgetVsActualRow[]> {
  return callRpcServer<BudgetVsActualRow[]>("get_budget_vs_actual", {
    p_month: month,
    p_year: year,
  });
}

export default async function BudgetVsActualPage({ searchParams }: PageProps) {
  await requirePermission("manageExpenses");

  if (!(await isFeatureEnabled("enable_expenses"))) {
    notFound();
  }

  const params = await searchParams;
  const [todayYear, todayMonth] = todayIsoDateIST().split("-").map(Number);
  const parsedMonth = Number(params.month);
  const parsedYear = Number(params.year);
  const month =
    Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
      ? parsedMonth
      : todayMonth;
  const year =
    Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
      ? parsedYear
      : todayYear;

  const [budgets, comparison, hostels] = await Promise.all([
    getBudgets(),
    getBudgetVsActual(month, year),
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
          <h1 className="mt-2 text-4xl font-bold">Budget vs Actual</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Set a standing monthly budget per category and hostel, then
            compare it against what was actually recorded each month.
          </p>
        </div>

        <BudgetVsActualView
          budgets={budgets}
          comparison={comparison}
          hostelNames={hostels.map((h) => h.hostel_name)}
          month={month}
          year={year}
        />
      </div>
    </main>
  );
}
