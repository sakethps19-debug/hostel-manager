import { notFound } from "next/navigation";
import ExpenseApprovalsView from "./ExpenseApprovalsView";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import { getHostelList } from "@/lib/hostel";
import { isFeatureEnabled } from "@/lib/featureFlags";

type RequestRow = {
  request_id: number;
  hostel_name: string | null;
  category: string;
  amount: number;
  vendor: string | null;
  justification: string;
  status: string;
  requested_by_name: string | null;
  requested_at: string;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  resulting_expense_recorded: boolean;
};

async function getRequests(): Promise<RequestRow[]> {
  return callRpcServer<RequestRow[]>("get_expense_approval_requests");
}

export default async function ExpenseApprovalsPage() {
  await requirePermission("manageExpenses");

  if (!(await isFeatureEnabled("enable_expenses"))) {
    notFound();
  }

  const [requests, hostels] = await Promise.all([
    getRequests(),
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
          <h1 className="mt-2 text-4xl font-bold">Expense Approvals</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Submit an expense for approval before spending. Approving a
            request automatically records it in the Expenses log.
          </p>
        </div>

        <ExpenseApprovalsView
          requests={requests}
          hostelNames={hostels.map((h) => h.hostel_name)}
        />
      </div>
    </main>
  );
}
