import { redirect } from "next/navigation";
import { getMyRole } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getRecipientCandidates } from "@/lib/communications/recipients";
import { getHostelList } from "@/lib/hostel";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import BroadcastComposer from "./BroadcastComposer";

type TemplateRow = {
  template_id: number;
  category: string;
  name: string;
  channel: "whatsapp" | "sms" | "both";
  body: string;
  is_active: boolean;
};

async function getTemplates(): Promise<TemplateRow[]> {
  return callRpcServer<TemplateRow[]>("get_message_templates");
}

export default async function NewBroadcastPage() {
  const role = await getMyRole();
  const canSend =
    hasPermission(role, "sendOperationalMessages") ||
    hasPermission(role, "sendFinanceMessages");

  if (!canSend) {
    redirect("/");
  }

  const [recipients, hostels, templates] = await Promise.all([
    getRecipientCandidates(),
    getHostelList(),
    getTemplates().catch(() => [] as TemplateRow[]),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <a
          href="/communications"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Communications
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Communications
          </p>
          <h1 className="mt-2 text-4xl font-bold">New Broadcast</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Filter recipients, review the count, and send a WhatsApp or SMS
            message to multiple residents at once.
          </p>
        </div>

        <BroadcastComposer
          recipients={recipients}
          hostelNames={hostels.map((h) => h.hostel_name)}
          templates={templates}
          role={role}
        />
      </div>
    </main>
  );
}
