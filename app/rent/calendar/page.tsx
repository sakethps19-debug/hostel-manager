import RentCalendarView from "./RentCalendarView";
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
  months_elapsed: number;
  amount_due: number;
  amount_paid: number;
  balance_outstanding: number;
  last_payment_date: string | null;
  payment_status: string;
  start_date: string;
  end_date: string;
};

async function getRentLedgerAll(): Promise<LedgerRow[]> {
  return callRpcServer<LedgerRow[]>("get_rent_ledger_all");
}

export default async function RentCalendarPage() {
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
          <h1 className="mt-2 text-4xl font-bold">Rent Calendar</h1>
          <p className="mt-2 text-slate-500">
            Every active resident, grouped by the day of the month their rent
            is due — starting from today and wrapping around.
          </p>
          <p className="mt-2 max-w-3xl text-sm text-amber-700">
            Due day is currently derived from each booking&apos;s start date
            (the day they moved in). There is no separately configurable rent
            due date yet — once that business rule is decided, this page
            should switch to whatever field stores it.
          </p>
        </div>

        <RentCalendarView ledger={ledger} />
      </div>
    </main>
  );
}
