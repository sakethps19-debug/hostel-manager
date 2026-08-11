import { notFound, redirect } from "next/navigation";
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

type RecipientRow = {
  message_id: number;
  resident_id: number;
  recipient_mobile: string;
  status: string;
  failure_reason: string | null;
  created_at: string;
};

function getStatusClasses(status: string) {
  if (status === "sent" || status === "delivered" || status === "read") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "failed") return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-600";
}

type PageProps = {
  params: Promise<{ broadcastId: string }>;
};

export default async function BroadcastDetailPage({ params }: PageProps) {
  const { broadcastId } = await params;

  const role = await getMyRole();
  const canSend =
    hasPermission(role, "sendOperationalMessages") ||
    hasPermission(role, "sendFinanceMessages");

  if (!canSend) {
    redirect("/");
  }

  const broadcasts = await callRpcServer<BroadcastRow[]>("get_message_broadcasts");
  const broadcast = broadcasts.find((b) => String(b.broadcast_id) === broadcastId);

  if (!broadcast) {
    notFound();
  }

  const recipients = await callRpcServer<RecipientRow[]>("get_broadcast_recipients", {
    p_broadcast_id: broadcast.broadcast_id,
  });

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <a
          href="/communications"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Communications
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Broadcast #{broadcast.broadcast_id}
          </p>
          <h1 className="mt-2 text-3xl font-bold">{broadcast.target_group_label}</h1>
          <p className="mt-2 max-w-2xl whitespace-pre-wrap text-slate-600">
            {broadcast.message_body}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {broadcast.channel === "whatsapp" ? "WhatsApp" : "SMS"} ·{" "}
            {formatDateTime(broadcast.created_at)}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryTile label="Recipients" value={broadcast.recipient_count} />
          <SummaryTile label="Sent" value={broadcast.sent_count} tone="emerald" />
          <SummaryTile label="Delivered" value={broadcast.delivered_count} />
          <SummaryTile label="Failed" value={broadcast.failed_count} tone="red" />
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {recipients.length === 0 ? (
            <div className="px-6 py-16 text-center text-slate-500">
              No recipient-level records found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Mobile</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Failure Reason</th>
                    <th className="px-4 py-3">Sent At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recipients.map((r) => (
                    <tr key={r.message_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">{r.recipient_mobile}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusClasses(r.status)}`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{r.failure_reason || "-"}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                        {formatDateTime(r.created_at)}
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

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "emerald" | "red";
}) {
  const toneClass =
    tone === "emerald" ? "text-emerald-600" : tone === "red" ? "text-red-600" : "text-slate-900";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}
