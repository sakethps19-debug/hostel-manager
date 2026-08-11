import RentAgeingView from "./RentAgeingView";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";

type LedgerRow = {
  booking_id: number;
  resident_id: number;
  full_name: string;
  mobile_number: string | null;
  hostel_name: string;
  room_number: string;
  bed_id: number;
  bed_code: string | null;
  monthly_rent: number;
  balance_outstanding: number;
  payment_status: string;
  start_date: string;
};

async function getRentLedgerAll(): Promise<LedgerRow[]> {
  return callRpcServer<LedgerRow[]>("get_rent_ledger_all");
}

export default async function RentAgeingPage() {
  await requirePermission("viewFinancialReports");

  const ledger = await getRentLedgerAll();

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
            Hostel Management
          </p>
          <h1 className="mt-2 text-4xl font-bold">Receivable Ageing</h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            Outstanding balances grouped by how overdue they are, measured
            from the most recent rent-due date each resident has missed (the
            joining-date anniversary of their booking&apos;s start date, the
            same day the Rent Calendar uses).
          </p>
        </div>

        <RentAgeingView ledger={ledger} />
      </div>
    </main>
  );
}
