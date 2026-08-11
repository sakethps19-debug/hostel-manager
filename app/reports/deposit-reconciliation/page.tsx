import DepositReconciliationTable from "./DepositReconciliationTable";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";

type DepositRow = {
  booking_id: number;
  resident_id: number;
  full_name: string;
  hostel_name: string;
  room_number: string;
  bed_number: string;
  bed_code: string | null;
  booking_status: string;
  deposit_agreed: number;
  deposit_received: number;
  deposit_refunded: number;
  deposit_balance: number;
  deposit_status: string;
};

async function getDepositReconciliation(): Promise<DepositRow[]> {
  return callRpcServer<DepositRow[]>("get_deposit_reconciliation");
}

export default async function DepositReconciliationPage() {
  await requirePermission("viewFinancialReports");

  const rows = await getDepositReconciliation();

  const totalAgreed = rows.reduce((s, r) => s + Number(r.deposit_agreed), 0);
  const totalReceived = rows.reduce((s, r) => s + Number(r.deposit_received), 0);
  const totalRefunded = rows.reduce((s, r) => s + Number(r.deposit_refunded), 0);
  const totalHeld = rows.reduce((s, r) => s + Number(r.deposit_balance), 0);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <a
          href="/"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Dashboard
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Owner Insights
          </p>
          <h1 className="mt-2 text-4xl font-bold">
            Security Deposit Reconciliation
          </h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Every booking&apos;s agreed deposit against what has actually
            been received and refunded, so a stale or missing deposit
            settlement stands out.
          </p>
        </div>

        <section className="mt-8 grid gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-500">Agreed</p>
            <p className="mt-1 text-xl font-bold">
              Rs. {totalAgreed.toLocaleString("en-IN")}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-500">Received</p>
            <p className="mt-1 text-xl font-bold text-emerald-600">
              Rs. {totalReceived.toLocaleString("en-IN")}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-500">Refunded</p>
            <p className="mt-1 text-xl font-bold text-red-600">
              Rs. {totalRefunded.toLocaleString("en-IN")}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-500">Held</p>
            <p className="mt-1 text-xl font-bold">
              Rs. {totalHeld.toLocaleString("en-IN")}
            </p>
          </div>
        </section>

        <DepositReconciliationTable rows={rows} />
      </div>
    </main>
  );
}
