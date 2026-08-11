import MessageTemplatesTable from "./MessageTemplatesTable";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";

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

export default async function MessageTemplatesPage() {
  await requirePermission("manageMessageTemplates");

  const templates = await getTemplates();

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
            Administration
          </p>
          <h1 className="mt-2 text-4xl font-bold">Message Templates</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Reusable WhatsApp/SMS templates for resident communication. Use{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">
              {"{{resident_name}}"}
            </code>
            ,{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">
              {"{{hostel}}"}
            </code>
            ,{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">
              {"{{room}}"}
            </code>
            ,{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">
              {"{{bed_code}}"}
            </code>
            ,{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">
              {"{{monthly_rent}}"}
            </code>{" "}
            and{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">
              {"{{outstanding}}"}
            </code>{" "}
            as placeholders - they&apos;re filled in automatically when a
            template is used. Never include Aadhaar/PAN or other sensitive
            details in a template.
          </p>
        </div>

        <MessageTemplatesTable templates={templates} />
      </div>
    </main>
  );
}
