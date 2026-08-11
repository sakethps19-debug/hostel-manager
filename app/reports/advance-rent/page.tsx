import AdvanceRentTable from "./AdvanceRentTable";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";

type LedgerRow = {
  booking_id: number;
  resident_id: number;
  full_name: string;
  mobile_number: string | null;
  hostel_name: string;
  room_number: string;
  bed_code: string | null;
  bed_number: string;
  monthly_rent: number;
  amount_due: number;
  amount_paid: number;
  balance_outstanding: number;
};

async function getRentLedgerAll(): Promise<LedgerRow[]> {
  return callRpcServer<LedgerRow[]>("get_rent_ledger_all");
}

export default async function AdvanceRentReportPage() {
  await requirePermission("viewFinancialReports");

  const ledger = await getRentLedgerAll();
  const advanceRows = ledger.filter((r) => r.balance_outstanding < 0);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <a
          href="/"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Dashboard
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Reports
          </p>
          <h1 className="mt-2 text-4xl font-bold">Advance Rent Report</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Residents who have paid more than their rent currently due -
            the surplus below is their advance balance, straight from the
            rent ledger.
          </p>
        </div>

        <AdvanceRentTable rows={advanceRows} />
      </div>
    </main>
  );
}
