import { notFound } from "next/navigation";
import PrintButton from "./PrintButton";
import CopyTextButton from "@/components/CopyTextButton";
import { callRpcServer } from "@/lib/supabase/callRpcServer";

type ResidentSummary = {
  booking_id: number;
  full_name: string;
  mobile_number: string | null;
  hostel_name: string;
  room_number: string;
  bed_code: string | null;
  bed_number: string;
  monthly_rent: number;
};

type PaymentRow = {
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
};

type PageProps = {
  params: Promise<{
    hostelSlug: string;
    roomNumber: string;
    bedId: string;
    paymentId: string;
  }>;
};

async function getResidentSummary(
  bedId: string
): Promise<ResidentSummary | null> {
  const data = await callRpcServer<ResidentSummary[]>("get_resident_details", {
    p_bed_id: Number(bedId),
  });
  return data.length > 0 ? data[0] : null;
}

async function getPayment(
  bookingId: number,
  paymentId: string
): Promise<PaymentRow | null> {
  const data = await callRpcServer<PaymentRow[]>("get_payment_history", {
    p_booking_id: bookingId,
  });
  return data.find((p) => p.payment_id === Number(paymentId)) || null;
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMonth(date: string | null) {
  if (!date) return "-";
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

function formatMoney(value: number) {
  return `Rs. ${Number(value).toLocaleString("en-IN")}`;
}

export default async function ReceiptPage({ params }: PageProps) {
  const { hostelSlug, roomNumber, bedId, paymentId } = await params;

  const resident = await getResidentSummary(bedId);

  if (!resident) {
    notFound();
  }

  const payment = await getPayment(resident.booking_id, paymentId);

  if (!payment) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between print:hidden">
          <a
            href={`/${hostelSlug}/room/${roomNumber}/resident/${bedId}`}
            className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
          >
            ← Back to Resident Details
          </a>

          <div className="flex gap-3">
            {payment.status === "active" && (
              <CopyTextButton
                label="Copy Confirmation"
                text={`Hi ${resident.full_name}, we've received your payment of ${formatMoney(payment.amount)} (${payment.payment_type}) on ${formatDate(payment.payment_date)} for ${resident.hostel_name} (${resident.bed_code || resident.bed_number}). Receipt No. ${payment.receipt_number}. Thank you — ${resident.hostel_name}.`}
              />
            )}
            <PrintButton />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm print:rounded-none print:border-0 print:shadow-none">
          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div>
              <h1 className="text-2xl font-bold">{resident.hostel_name}</h1>
              <p className="mt-1 text-sm text-slate-500">Payment Receipt</p>
            </div>

            <div className="text-right">
              <p className="text-sm text-slate-500">Receipt No.</p>
              <p className="text-lg font-bold">{payment.receipt_number}</p>
              <p className="mt-1 text-sm text-slate-500">
                {formatDate(payment.payment_date)}
              </p>
            </div>
          </div>

          {payment.status === "reversed" && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              This payment has been reversed and is void.
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-5">
            <ReceiptField label="Resident Name" value={resident.full_name} />
            <ReceiptField
              label="Mobile Number"
              value={resident.mobile_number || "Not provided"}
            />
            <ReceiptField label="Hostel" value={resident.hostel_name} />
            <ReceiptField label="Room" value={resident.room_number} />
            <ReceiptField
              label="Bed ID"
              value={resident.bed_code || resident.bed_number}
            />
            <ReceiptField
              label="Agreed Monthly Rent"
              value={formatMoney(resident.monthly_rent)}
            />
          </div>

          <div className="mt-6 border-t border-slate-200 pt-6">
            <div className="grid grid-cols-2 gap-5">
              <ReceiptField label="Payment Type" value={payment.payment_type} />
              <ReceiptField
                label="Payment For Month"
                value={formatMonth(payment.payment_for_month)}
              />
              <ReceiptField label="Payment Mode" value={payment.payment_mode} />
              <ReceiptField
                label="Reference Number"
                value={payment.reference_number || "-"}
              />
            </div>

            <div className="mt-6 rounded-xl bg-slate-50 p-5 print:bg-white print:border print:border-slate-300">
              <p className="text-sm text-slate-500">Amount Paid</p>
              <p className="mt-1 text-3xl font-bold">
                {formatMoney(payment.amount)}
              </p>
            </div>

            {payment.notes && (
              <div className="mt-6">
                <p className="text-xs font-medium text-slate-400">Notes</p>
                <p className="mt-1 text-sm text-slate-600">{payment.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function ReceiptField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-900">{value}</p>
    </div>
  );
}
