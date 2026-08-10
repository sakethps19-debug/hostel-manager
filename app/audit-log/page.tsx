import AuditLogTable from "./AuditLogTable";
import { callRpcServer } from "@/lib/supabase/callRpcServer";

type AuditLogRow = {
  audit_id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  details: Record<string, unknown>;
  created_at: string;
};

async function getAuditLog(): Promise<AuditLogRow[]> {
  return callRpcServer<AuditLogRow[]>("get_audit_log");
}

export default async function AuditLogPage() {
  const entries = await getAuditLog();

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <a
          href="/"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Dashboard
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Hostel Management
          </p>
          <h1 className="mt-2 text-4xl font-bold">Audit Log</h1>
          <p className="mt-2 text-slate-500">
            Read-only record of material changes across the app. Logged
            client-side after each action succeeds — entries aren&apos;t yet
            attributed to a specific user (that needs the profiles/role data
            wired into each log call, not done yet).
          </p>
        </div>

        <AuditLogTable entries={entries} />
      </div>
    </main>
  );
}
