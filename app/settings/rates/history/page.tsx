import RateHistoryView from "./RateHistoryView";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";

type AuditLogRow = {
  audit_id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  details: Record<string, unknown>;
  user_name: string | null;
  user_role: string | null;
  created_at: string;
};

async function getAuditLog(): Promise<AuditLogRow[]> {
  return callRpcServer<AuditLogRow[]>("get_audit_log");
}

export default async function RateHistoryPage() {
  await requirePermission("viewAuditLog");

  const entries = await getAuditLog();
  const rateChanges = entries.filter((e) => e.action === "standard_rate_updated");

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <a
          href="/settings/rates"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Rates
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Administration
          </p>
          <h1 className="mt-2 text-4xl font-bold">Rate History</h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            Every standard-rate change ever recorded, grouped by hostel/
            sharing type or room, most recent first. Built from the audit
            log, so it only covers changes made since audit logging on rate
            edits went live — not rate changes from before that.
          </p>
        </div>

        <RateHistoryView entries={rateChanges} />
      </div>
    </main>
  );
}
