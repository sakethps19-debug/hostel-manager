import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { TEMPLATE_CATEGORY_LABELS, type TemplateCategory } from "@/lib/communications/templateCategories";

type AuditLogRow = {
  audit_id: number;
  action: string;
  entity_id: number | null;
  details: Record<string, unknown>;
  user_name: string | null;
  created_at: string;
};

type BroadcastRow = {
  broadcast_id: number;
  channel: "whatsapp" | "sms";
  template_id: number | null;
  target_group_label: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
};

type TemplateRow = {
  template_id: number;
  category: string;
};

async function getAuditLog(): Promise<AuditLogRow[]> {
  return callRpcServer<AuditLogRow[]>("get_audit_log");
}

async function getBroadcasts(): Promise<BroadcastRow[]> {
  try {
    return await callRpcServer<BroadcastRow[]>("get_message_broadcasts");
  } catch {
    return [];
  }
}

async function getTemplates(): Promise<TemplateRow[]> {
  try {
    return await callRpcServer<TemplateRow[]>("get_message_templates");
  } catch {
    return [];
  }
}

export default async function CommunicationReportsPage() {
  await requirePermission("viewAuditLog");

  const [auditLog, broadcasts, templates] = await Promise.all([
    getAuditLog(),
    getBroadcasts(),
    getTemplates(),
  ]);

  const categoryByTemplateId = new Map(templates.map((t) => [t.template_id, t.category]));

  const individualSends = auditLog.filter((e) => e.action === "resident_message_sent");
  const failedIndividual = individualSends.filter((e) => e.details.status === "failed");

  const channelCounts = new Map<string, number>();
  for (const e of individualSends) {
    const channel = String(e.details.channel || "unknown");
    channelCounts.set(channel, (channelCounts.get(channel) || 0) + 1);
  }
  for (const b of broadcasts) {
    channelCounts.set(b.channel, (channelCounts.get(b.channel) || 0) + b.recipient_count);
  }

  const userCounts = new Map<string, number>();
  for (const e of individualSends) {
    const user = e.user_name || "Unknown";
    userCounts.set(user, (userCounts.get(user) || 0) + 1);
  }

  const rentReminderCount = individualSends.filter((e) => {
    const templateId = e.details.template_id;
    if (typeof templateId !== "number") return false;
    const category = categoryByTemplateId.get(templateId);
    return category === "rent_reminder" || category === "rent_overdue";
  }).length;

  const totalBroadcastFailed = broadcasts.reduce((sum, b) => sum + b.failed_count, 0);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <a
          href="/communications"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Communications
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Reports
          </p>
          <h1 className="mt-2 text-4xl font-bold">Communication Reports</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Message counts, failures, and who sent what - derived from the
            audit log and broadcast history, not a separately-maintained
            total.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Tile label="Individual Messages" value={individualSends.length} />
          <Tile label="Failed (Individual)" value={failedIndividual.length} tone="red" />
          <Tile label="Broadcasts Sent" value={broadcasts.length} />
          <Tile label="Failed (Broadcast)" value={totalBroadcastFailed} tone="red" />
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Card title="Messages by Channel">
            {Array.from(channelCounts.entries()).map(([channel, count]) => (
              <Row key={channel} label={channel} value={count} />
            ))}
            {channelCounts.size === 0 && <p className="text-sm text-slate-500">No messages sent yet.</p>}
          </Card>

          <Card title="Individual Messages by User">
            {Array.from(userCounts.entries()).map(([user, count]) => (
              <Row key={user} label={user} value={count} />
            ))}
            {userCounts.size === 0 && <p className="text-sm text-slate-500">No messages sent yet.</p>}
            <p className="mt-3 text-xs text-slate-400">
              Rent Reminders Sent: {rentReminderCount}
            </p>
          </Card>
        </div>

        <h2 className="mt-8 text-lg font-bold">Broadcast History</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {broadcasts.length === 0 ? (
            <div className="px-6 py-16 text-center text-slate-500">No broadcasts sent yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Target Group</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Channel</th>
                    <th className="px-4 py-3 text-right">Sent</th>
                    <th className="px-4 py-3 text-right">Failed</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {broadcasts.map((b) => (
                    <tr key={b.broadcast_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <a
                          href={`/communications/${b.broadcast_id}`}
                          className="font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                          {b.target_group_label}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        {b.template_id && categoryByTemplateId.get(b.template_id)
                          ? TEMPLATE_CATEGORY_LABELS[
                              categoryByTemplateId.get(b.template_id) as TemplateCategory
                            ]
                          : "-"}
                      </td>
                      <td className="px-4 py-3 capitalize">{b.channel}</td>
                      <td className="px-4 py-3 text-right text-emerald-600">{b.sent_count}</td>
                      <td className="px-4 py-3 text-right text-red-600">{b.failed_count}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                        {formatDateTime(b.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: "red" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone === "red" ? "text-red-600" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="font-semibold text-slate-900">{title}</p>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="capitalize text-slate-600">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
