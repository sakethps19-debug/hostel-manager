import { notFound } from "next/navigation";
import ReceivablesView from "./ReceivablesView";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { getHostelList } from "@/lib/hostel";
import { getReceivableAgeing } from "@/lib/accounting/queries";
import { todayIsoDateIST } from "@/lib/format";

type ResidentRow = {
  resident_id: number;
  booking_id: number;
  full_name: string;
  mobile_number: string | null;
  hostel_name: string;
  room_number: string;
  bed_code: string | null;
};

type AccrualStatus = {
  total_active_bookings: number;
  already_accrued: number;
  pending: number;
};

export default async function ReceivablesPage() {
  await requirePermission("viewFinancialReports");
  if (!(await isFeatureEnabled("enable_accounting"))) notFound();

  const today = todayIsoDateIST();
  const now = new Date(`${today}T00:00:00`);

  const [ageing, residents, hostels, accrualStatusRows] = await Promise.all([
    getReceivableAgeing(today),
    callRpcServer<ResidentRow[]>("get_resident_master_list"),
    getHostelList(),
    callRpcServer<AccrualStatus[]>("get_rent_accrual_status", {
      p_period_year: now.getFullYear(),
      p_period_month: now.getMonth() + 1,
    }),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <a href="/" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
          ← Back to Dashboard
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Accounting</p>
          <h1 className="mt-2 text-4xl font-bold">Accounts Receivable</h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            Rent already accrued (due) but not yet collected — from the ledger, not a rebuild of the
            operational Rent Ageing view. Ageing buckets here (0-7/8-30/31-60/60+) are the formal
            accounting buckets, separate from the quick-glance 0-30/31-60/61-90/90+ buckets on{" "}
            <a href="/rent/ageing" className="text-indigo-600 hover:text-indigo-700">
              Rent Ageing
            </a>
            .
          </p>
        </div>

        <ReceivablesView
          ageing={ageing}
          residents={residents}
          hostelNames={hostels.map((h) => h.hostel_name)}
          accrualStatus={accrualStatusRows.length > 0 ? accrualStatusRows[0] : null}
          periodYear={now.getFullYear()}
          periodMonth={now.getMonth() + 1}
        />
      </div>
    </main>
  );
}
