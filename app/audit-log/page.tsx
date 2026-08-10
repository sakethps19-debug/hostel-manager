import AuditLogTable from "./AuditLogTable";

type AuditLogRow = {
  audit_id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  details: Record<string, unknown>;
  created_at: string;
};

async function getAuditLog(): Promise<AuditLogRow[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_audit_log`, {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load audit log: ${await response.text()}`);
  }

  return response.json();
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
            client-side after each action succeeds — until authentication is
            set up, entries aren&apos;t attributed to a specific user.
          </p>
        </div>

        <AuditLogTable entries={entries} />
      </div>
    </main>
  );
}
