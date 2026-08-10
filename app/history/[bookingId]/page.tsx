import { notFound } from "next/navigation";
import { callRpcServer } from "@/lib/supabase/callRpcServer";

type BookingDetails = {
  booking_id: number;
  resident_id: number;
  full_name: string;
  mobile_number: string | null;
  email: string | null;
  emergency_contact: string | null;
  id_proof_type: string | null;
  id_proof_number: string | null;
  home_address: string | null;
  work_college_address: string | null;
  notes: string | null;
  hostel_name: string;
  floor_number: number;
  room_number: string;
  bed_number: string;
  bed_code: string | null;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  security_deposit: number | null;
  booking_status: string;
  created_at: string;
};

type Deduction = {
  category: string;
  amount: number;
  notes: string | null;
};

type Settlement = {
  settlement_id: number;
  settlement_date: string;
  outstanding_rent: number;
  other_charges: number;
  deposit_held: number;
  deductions_total: number;
  refund_amount: number;
  final_balance: number;
  notes: string | null;
  deductions: Deduction[];
};

type TransferRecord = {
  transfer_id: number;
  old_booking_id: number;
  new_booking_id: number;
  transfer_date: string;
  reason: string;
  new_hostel_name: string;
  new_room_number: string;
  new_bed_code: string | null;
};

type PageProps = {
  params: Promise<{
    bookingId: string;
  }>;
};

async function getBookingDetails(
  bookingId: string
): Promise<BookingDetails | null> {
  const data = await callRpcServer<BookingDetails[]>("get_booking_details", {
    p_booking_id: Number(bookingId),
  });

  return data.length ? data[0] : null;
}

async function getSettlement(bookingId: string): Promise<Settlement | null> {
  const data = await callRpcServer<Settlement[]>("get_booking_settlement", {
    p_booking_id: Number(bookingId),
  });
  return data.length > 0 && data[0].settlement_id ? data[0] : null;
}

async function getTransferHistory(residentId: number): Promise<TransferRecord[]> {
  return callRpcServer<TransferRecord[]>("get_transfer_history", {
    p_resident_id: residentId,
  });
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}

function money(value: number | null) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

export default async function BookingHistoryDetailsPage({
  params,
}: PageProps) {
  const { bookingId } = await params;

  const booking = await getBookingDetails(bookingId);

  if (!booking) {
    notFound();
  }

  const settlement =
    booking.booking_status === "completed"
      ? await getSettlement(bookingId)
      : null;

  const transfers = await getTransferHistory(booking.resident_id);
  const outgoingTransfer = transfers.find(
    (t) => t.old_booking_id === booking.booking_id
  );
  const incomingTransfer = transfers.find(
    (t) => t.new_booking_id === booking.booking_id
  );

  const active =
    booking.booking_status === "confirmed" ||
    booking.booking_status === "checked_in";

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">

        <a
          href="/history"
          className="text-sm font-semibold text-indigo-600"
        >
          ← Back to Booking History
        </a>

        <div className="mt-7 flex flex-wrap items-end justify-between gap-4">

          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              Booking #{booking.booking_id}
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              {booking.full_name}
            </h1>

            <p className="mt-2 text-slate-500">
              {booking.hostel_name} · Room {booking.room_number} ·{" "}
              {booking.bed_code || booking.bed_number}
            </p>
          </div>

          <span
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              active
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            {booking.booking_status}
          </span>

        </div>

        {outgoingTransfer && (
          <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <p className="font-semibold text-blue-800">
              Transferred on {formatDate(outgoingTransfer.transfer_date)}
            </p>
            <p className="mt-1 text-sm text-blue-700">
              Moved to {outgoingTransfer.new_hostel_name} / Room{" "}
              {outgoingTransfer.new_room_number} ·{" "}
              {outgoingTransfer.new_bed_code || "-"} ({outgoingTransfer.reason}
              ).{" "}
              <a
                href={`/history/${outgoingTransfer.new_booking_id}`}
                className="font-semibold underline"
              >
                View new booking →
              </a>
            </p>
          </div>
        )}

        {incomingTransfer && (
          <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <p className="font-semibold text-blue-800">
              Started via transfer on{" "}
              {formatDate(incomingTransfer.transfer_date)}
            </p>
            <p className="mt-1 text-sm text-blue-700">
              {incomingTransfer.reason}.{" "}
              <a
                href={`/history/${incomingTransfer.old_booking_id}`}
                className="font-semibold underline"
              >
                View previous booking →
              </a>
            </p>
          </div>
        )}

        <section className="mt-10 grid gap-5 md:grid-cols-2">

          <Card title="Resident Details">
            <Row label="Full Name" value={booking.full_name} />
            <Row
              label="Mobile Number"
              value={booking.mobile_number || "Not provided"}
            />
            <Row
              label="Email"
              value={booking.email || "Not provided"}
            />
            <Row
              label="Emergency Contact"
              value={booking.emergency_contact || "Not provided"}
            />
            <Row
              label="ID Proof Type"
              value={booking.id_proof_type || "Not provided"}
            />
            <Row
              label="ID Proof Number / Value"
              value={booking.id_proof_number || "Not provided"}
            />
            <Row
              label="Home Address"
              value={booking.home_address || "Not provided"}
            />
            <Row
              label="Work / College Address"
              value={booking.work_college_address || "Not provided"}
            />
          </Card>

          <Card title="Accommodation">
            <Row label="Hostel" value={booking.hostel_name} />
            <Row label="Floor" value={`Floor ${booking.floor_number}`} />
            <Row label="Room" value={`Room ${booking.room_number}`} />
            <Row label="Bed" value={booking.bed_number} />
            <Row label="Bed ID" value={booking.bed_code || "Not set"} />
          </Card>

        </section>

        <section className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

          <Info
            label="Start Date"
            value={formatDate(booking.start_date)}
          />

          <Info
            label="End Date"
            value={formatDate(booking.end_date)}
          />

          <Info
            label="Agreed Rent"
            value={money(booking.monthly_rent)}
          />

          <Info
            label="Security Deposit"
            value={money(booking.security_deposit)}
          />

        </section>

        {settlement && (
          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <h2 className="text-xl font-bold">
              Final Settlement
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Settled on {formatDate(settlement.settlement_date)}
            </p>

            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Info
                label="Outstanding Rent"
                value={money(settlement.outstanding_rent)}
              />
              <Info
                label="Other Charges"
                value={money(settlement.other_charges)}
              />
              <Info
                label="Deposit Held"
                value={money(settlement.deposit_held)}
              />
              <Info
                label="Deductions"
                value={money(settlement.deductions_total)}
              />
            </div>

            {settlement.deductions.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-medium text-slate-400">
                  Deduction Breakdown
                </p>
                <div className="mt-2 space-y-2">
                  {settlement.deductions.map((d, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2 text-sm"
                    >
                      <span>
                        {d.category}
                        {d.notes ? ` — ${d.notes}` : ""}
                      </span>
                      <span className="font-semibold">
                        {money(d.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 rounded-xl bg-slate-50 p-5">
              {settlement.final_balance >= 0 ? (
                <div className="flex justify-between text-lg font-bold text-emerald-600">
                  <span>Refund Amount</span>
                  <span>{money(settlement.refund_amount)}</span>
                </div>
              ) : (
                <div className="flex justify-between text-lg font-bold text-red-600">
                  <span>Amount Owed by Resident</span>
                  <span>{money(Math.abs(settlement.final_balance))}</span>
                </div>
              )}
            </div>

            {settlement.notes && (
              <p className="mt-4 text-sm text-slate-600">
                {settlement.notes}
              </p>
            )}

          </section>
        )}

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

          <h2 className="text-xl font-bold">
            Notes
          </h2>

          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">
            {booking.notes || "No notes added."}
          </p>

        </section>

      </div>
    </main>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

      <h2 className="text-xl font-bold">
        {title}
      </h2>

      <div className="mt-6 space-y-4">
        {children}
      </div>

    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="border-b border-slate-100 pb-4 last:border-0">

      <p className="text-xs text-slate-400">
        {label}
      </p>

      <p className="mt-1 font-semibold">
        {value}
      </p>

    </div>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

      <p className="text-xs text-slate-400">
        {label}
      </p>

      <p className="mt-2 font-bold">
        {value}
      </p>

    </div>
  );
}
