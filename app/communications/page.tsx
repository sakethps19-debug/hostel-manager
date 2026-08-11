import { redirect } from "next/navigation";
import { getMyRole } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { formatDateTime } from "@/lib/format";

type BroadcastRow = {
  broadcast_id: number;
  channel: "whatsapp" | "sms";
  message_body: string;
  target_group_label: string;
  recipient_count: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  status: string;
  created_at: string;
};

async function getBroadcasts(): Promise<{ rows: BroadcastRow[]; setupMissing: boolean }> {
  try {
    const rows = await callRpcServer<BroadcastRow[]>("get_message_broadcasts");
    return { rows, setupMissing: false };
  } catch {
    return { rows: [], setupMissing: true };
  }
}

export default async function CommunicationsPage() {
  const role = await getMyRole();
  const canSend =
    hasPermission(role, "sendOperationalMessages") ||
    hasPermission(role, "sendFinanceMessages");

  if (!canSend) {
    redirect("/");
  }

  const { rows: broadcasts, setupMissing } = await getBroadcasts();

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <a
          href="/"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Dashboard
        </a>

        <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              Communications
            </p>
            <h1 className="mt-2 text-4xl font-bold">Broadcast History</h1>
          </div>

          <a
            href="/communications/new"
            className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white"
          >
            + New Broadcast
          </a>
        </div>

        {setupMissing && (
          <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-medium text-amber-800">
            The Communications database tables haven&apos;t been set up yet, so
            there&apos;s no broadcast history to show. You can still open New
            Broadcast to compose a message once the pending SQL migration has
            been run.
          </p>
        )}

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {broadcasts.length === 0 ? (
            <div className="px-6 py-16 text-center text-slate-500">
              No broadcasts sent yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Message</th>
                    <th className="px-4 py-3">Target Group</th>
                    <th className="px-4 py-3">Channel</th>
                    <th className="px-4 py-3 text-right">Recipients</th>
                    <th className="px-4 py-3 text-right">Sent</th>
                    <th className="px-4 py-3 text-right">Failed</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {broadcasts.map((b) => (
                    <tr key={b.broadcast_id} className="hover:bg-slate-50">
                      <td className="max-w-xs px-4 py-3">
                        <a
                          href={`/communications/${b.broadcast_id}`}
                          className="truncate font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                          {b.message_body}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{b.target_group_label}</td>
                      <td className="px-4 py-3 capitalize">{b.channel}</td>
                      <td className="px-4 py-3 text-right">{b.recipient_count}</td>
                      <td className="px-4 py-3 text-right text-emerald-600">
                        {b.sent_count}
                      </td>
                      <td className="px-4 py-3 text-right text-red-600">
                        {b.failed_count}
                      </td>
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
