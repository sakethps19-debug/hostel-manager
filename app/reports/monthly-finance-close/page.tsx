import MonthlyFinanceCloseView from "./MonthlyFinanceCloseView";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import { todayIsoDateIST } from "@/lib/format";

type CloseRow = {
  close_id: number;
  month: number;
  year: number;
  rent_revenue: number;
  other_revenue: number;
  operating_expenses: number;
  net_surplus: number;
  outstanding_rent_total: number;
  deposits_held_total: number;
  notes: string | null;
  closed_by_name: string | null;
  closed_at: string;
  reopened_at: string | null;
};

async function getCloses(): Promise<CloseRow[]> {
  return callRpcServer<CloseRow[]>("get_monthly_finance_closes");
}

export default async function MonthlyFinanceClosePage() {
  await requirePermission("manageUsers");

  const closes = await getCloses();
  const [todayYear, todayMonth] = todayIsoDateIST().split("-").map(Number);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <a
          href="/"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Dashboard
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Owner Insights
          </p>
          <h1 className="mt-2 text-4xl font-bold">Monthly Finance Close</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Snapshot a month&apos;s P&amp;L, outstanding rent, and deposits
            held to a permanent record. Closing does not lock or prevent
            further edits elsewhere in the app — it&apos;s a checkpoint, not
            an enforcement mechanism.
          </p>
        </div>

        <MonthlyFinanceCloseView
          closes={closes}
          defaultMonth={todayMonth}
          defaultYear={todayYear}
        />
      </div>
    </main>
  );
}
