import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { todayIsoDateIST } from "@/lib/format";
import { isCommsTestMode } from "@/lib/communications/provider";
import UsageCostView from "./UsageCostView";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type UsageSummary = {
  whatsapp_sent: number;
  sms_sent: number;
  utility_count: number;
  marketing_count: number;
  failed_count: number;
  estimated_cost: number;
  residents_messaged: number;
  avg_messages_per_resident: number;
};

type ExceedingRow = {
  resident_id: number;
  message_count: number;
};

type SettingRow = {
  setting_key: string;
  setting_value: string;
};

type PageProps = {
  searchParams: Promise<{ month?: string; year?: string }>;
};

export default async function CommunicationUsageCostPage({ searchParams }: PageProps) {
  await requirePermission("manageCommunicationSettings");

  const [todayYear, todayMonth] = todayIsoDateIST().split("-").map(Number);
  const { month: monthParam, year: yearParam } = await searchParams;
  const month = monthParam ? Number(monthParam) : todayMonth;
  const year = yearParam ? Number(yearParam) : todayYear;

  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
    notFound();
  }

  const [summaryRows, exceeding, settings] = await Promise.all([
    callRpcServer<UsageSummary[]>("get_communication_usage_summary", {
      p_period_year: year,
      p_period_month: month,
    }),
    callRpcServer<ExceedingRow[]>("get_residents_exceeding_communication_threshold", {
      p_period_year: year,
      p_period_month: month,
    }),
    callRpcServer<SettingRow[]>("get_communication_settings"),
  ]);

  const summary = summaryRows[0] ?? {
    whatsapp_sent: 0,
    sms_sent: 0,
    utility_count: 0,
    marketing_count: 0,
    failed_count: 0,
    estimated_cost: 0,
    residents_messaged: 0,
    avg_messages_per_resident: 0,
  };

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
            Communications
          </p>
          <h1 className="mt-2 text-4xl font-bold">Usage &amp; Cost</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            {MONTHS[month - 1]} {year} — estimated from configurable rates below,
            not actual provider billing.
            {isCommsTestMode() && (
              <>
                {" "}WhatsApp/SMS are currently in <strong>Test Mode</strong> — no
                real messages have been sent and no real cost has been incurred.
              </>
            )}
          </p>
        </div>

        <UsageCostView
          month={month}
          year={year}
          months={MONTHS}
          summary={summary}
          exceedingResidentCount={exceeding.length}
          settings={settings}
        />
      </div>
    </main>
  );
}
