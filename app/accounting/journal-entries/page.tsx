import { notFound } from "next/navigation";
import { requirePermission, getMyRole } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { getChartOfAccounts } from "@/lib/accounting/queries";
import { getHostelList } from "@/lib/hostel";
import { todayIsoDateIST } from "@/lib/format";
import JournalEntriesView from "./JournalEntriesView";

type JournalEntryRow = {
  journal_entry_id: number;
  entry_date: string;
  hostel_name: string | null;
  source_type: string;
  source_id: number | null;
  narration: string;
  status: "posted" | "reversed";
  total_amount: number;
};

function defaultFromDate() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

type PageProps = {
  searchParams: Promise<{ from?: string; to?: string }>;
};

export default async function JournalEntriesPage({ searchParams }: PageProps) {
  await requirePermission("viewFinancialReports");
  if (!(await isFeatureEnabled("enable_accounting"))) notFound();

  const role = await getMyRole();
  const canPostManual = hasPermission(role, "manageJournalEntries");

  const { from, to } = await searchParams;
  const fromDate = from || defaultFromDate();
  const toDate = to || todayIsoDateIST();

  const [entries, accounts, hostels] = await Promise.all([
    callRpcServer<JournalEntryRow[]>("get_journal_entries", { p_start_date: fromDate, p_end_date: toDate }),
    getChartOfAccounts(),
    getHostelList(),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <a href="/" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
          ← Back to Dashboard
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Accounting</p>
          <h1 className="mt-2 text-4xl font-bold">Journal Entries</h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            Every posted transaction in the ledger. Most entries are posted automatically from
            payments, expenses, and asset activity — manual entries are for corrections and events
            with no other source (owner capital, adjustments).
          </p>
        </div>

        <JournalEntriesView
          initialEntries={entries}
          accounts={accounts}
          hostelNames={hostels.map((h) => h.hostel_name)}
          canPostManual={canPostManual}
          fromDate={fromDate}
          toDate={toDate}
        />
      </div>
    </main>
  );
}
