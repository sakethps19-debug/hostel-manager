import ReferralSourcesTable from "./ReferralSourcesTable";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";

type ReferralSourceRow = {
  referral_source_id: number;
  name: string;
  contact_number: string | null;
  source_type: string;
  notes: string | null;
};

async function getReferralSources(): Promise<ReferralSourceRow[]> {
  return callRpcServer<ReferralSourceRow[]>("get_referral_sources");
}

export default async function ReferralSourcesPage() {
  await requirePermission("manageOperationalRecords");

  const sources = await getReferralSources();

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
          <h1 className="mt-2 text-4xl font-bold">Referral Sources</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Brokers, agents, and other referral sources. Attribute a booking
            to one of these from the resident&apos;s detail page — see{" "}
            <a
              href="/reports/referral-performance"
              className="font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Referral Performance →
            </a>{" "}
            for the resulting bookings and commissions.
          </p>
        </div>

        <ReferralSourcesTable sources={sources} />
      </div>
    </main>
  );
}
