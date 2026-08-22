import { notFound } from "next/navigation";
import PayablesView from "./PayablesView";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { getHostelList } from "@/lib/hostel";
import { getPayableAgeing } from "@/lib/accounting/queries";
import { todayIsoDateIST } from "@/lib/format";
import type { PayableRow } from "@/lib/accounting/types";

type VendorRow = { vendor_id: number; name: string; is_active: boolean };

export default async function PayablesPage() {
  await requirePermission("viewFinancialReports");
  if (!(await isFeatureEnabled("enable_accounting"))) notFound();

  await callRpcServer("refresh_payable_statuses", { p_as_of_date: todayIsoDateIST() });

  const [payables, ageing, vendors, hostels] = await Promise.all([
    callRpcServer<PayableRow[]>("get_payables"),
    getPayableAgeing(todayIsoDateIST()),
    callRpcServer<VendorRow[]>("get_vendors"),
    getHostelList(),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <a href="/" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
          ← Back to Dashboard
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Accounting</p>
          <h1 className="mt-2 text-4xl font-bold">Accounts Payable</h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            Vendor invoices received but not yet fully paid. This is separate from the Expenses log,
            which records transactions already paid at the moment of entry — an invoice recorded here
            books the expense as accrued immediately, and a payment against it later clears the
            liability without affecting the P&L again.
          </p>
        </div>

        <PayablesView
          initialPayables={payables}
          ageing={ageing}
          vendors={vendors.filter((v) => v.is_active)}
          hostelNames={hostels.map((h) => h.hostel_name)}
        />
      </div>
    </main>
  );
}
