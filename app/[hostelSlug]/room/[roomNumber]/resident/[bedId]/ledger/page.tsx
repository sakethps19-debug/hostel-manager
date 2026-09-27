import { notFound } from "next/navigation";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { buildResidentLedger } from "@/lib/residentLedger";
import { requirePermission } from "@/lib/auth";
import LedgerView from "./LedgerView";

type ResidentSummary = {
  booking_id: number;
  full_name: string;
  hostel_name: string;
  room_number: string;
  bed_code: string | null;
  bed_number: string;
  start_date: string;
  end_date: string | null;
  monthly_rent: number;
  security_deposit: number | null;
};

type RentRevisionRow = {
  previous_rent: number;
  new_rent: number;
  effective_date: string;
};

type PaymentHistoryRow = {
  payment_id: number;
  receipt_number: string;
  payment_date: string;
  payment_for_month: string | null;
  payment_type: string;
  amount: number;
  payment_mode: string;
  reference_number: string | null;
  notes: string | null;
  status: string;
  reversed_reason: string | null;
};

type PageProps = {
  params: Promise<{
    hostelSlug: string;
    roomNumber: string;
    bedId: string;
  }>;
};

export default async function ResidentLedgerPage({ params }: PageProps) {
  await requirePermission("viewFinancialReports");

  const { hostelSlug, bedId } = await params;

  const residentRows = await callRpcServer<ResidentSummary[]>(
    "get_resident_details",
    { p_bed_id: Number(bedId) }
  );

  const resident = residentRows.length > 0 ? residentRows[0] : null;

  if (!resident) {
    notFound();
  }

  const [rentHistory, payments] = await Promise.all([
    callRpcServer<RentRevisionRow[]>("get_rent_history", {
      p_booking_id: resident.booking_id,
    }),
    callRpcServer<PaymentHistoryRow[]>("get_payment_history", {
      p_booking_id: resident.booking_id,
    }),
  ]);

  const entries = buildResidentLedger({
    startDate: resident.start_date,
    endDate: resident.end_date,
    currentMonthlyRent: Number(resident.monthly_rent),
    securityDeposit: resident.security_deposit,
    rentHistory,
    payments,
  });

  const bedLabel = resident.bed_code || resident.bed_number;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900 print:bg-white">
      <div className="mx-auto max-w-5xl">
        <a
          href={`/${hostelSlug}/room/${resident.room_number}/resident/${bedId}`}
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 print:hidden"
        >
          ← Back to Resident Details
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            {resident.hostel_name} · {bedLabel}
          </p>

          <h1 className="mt-2 text-4xl font-bold">Resident Ledger Statement</h1>

          <p className="mt-2 text-slate-500">{resident.full_name}</p>
        </div>

        <LedgerView
          entries={entries}
          residentName={resident.full_name}
          hostelName={resident.hostel_name}
          bedLabel={bedLabel}
        />
      </div>
    </main>
  );
}
