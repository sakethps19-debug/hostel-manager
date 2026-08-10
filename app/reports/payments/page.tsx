import PaymentsReportTable from "./PaymentsReportTable";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";

type PaymentRow = {
  payment_id: number;
  receipt_number: string;
  payment_date: string;
  payment_type: string;
  amount: number;
  payment_mode: string;
  reference_number: string | null;
  status: string;
  resident_name: string;
  mobile_number: string;
  hostel_name: string;
  room_number: string;
  bed_code: string | null;
  bed_number: string;
};

type PageProps = {
  searchParams: Promise<{ start?: string; end?: string }>;
};

async function getPayments(start?: string, end?: string): Promise<PaymentRow[]> {
  return callRpcServer<PaymentRow[]>("get_all_payments_report", {
    p_start_date: start || null,
    p_end_date: end || null,
  });
}

export default async function PaymentsReportPage({ searchParams }: PageProps) {
  await requirePermission("viewFinancialReports");

  const params = await searchParams;
  const payments = await getPayments(params.start, params.end);

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
          <h1 className="mt-2 text-4xl font-bold">Payments Report</h1>
          <p className="mt-2 text-slate-500">
            Every recorded payment across all hostels, most recent first.
            Reversed payments are shown for record-keeping but marked so they
            aren&apos;t mistaken for active collections.
          </p>
        </div>

        <PaymentsReportTable payments={payments} initialStart={params.start || ""} initialEnd={params.end || ""} />
      </div>
    </main>
  );
}
