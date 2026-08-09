import { notFound } from "next/navigation";
type ResidentDetails = {
  resident_id: number;
  booking_id: number;
  full_name: string;
  mobile_number: string | null;
  email: string | null;
  emergency_contact: string | null;
  id_proof_type: string | null;
id_proof_number: string | null;
  home_address: string | null;
  work_college_address: string | null;
  notes: string | null;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  security_deposit: number | null;
  booking_status: string;
  bed_number: string;
  bed_code: string | null;
  room_number: string;
  floor_number: number;
  hostel_name: string;
};

type BookingLedger = {
  booking_id: number;
  monthly_rent: number;
  months_elapsed: number;
  amount_due: number;
  amount_paid: number;
  balance_outstanding: number;
  last_payment_date: string | null;
  payment_status: string;
};

type DepositSummary = {
  deposit_agreed: number;
  deposit_received: number;
  deposit_refunded: number;
  deposit_balance: number;
  deposit_status: string;
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

async function getResidentDetails(
  bedId: string
): Promise<ResidentDetails | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/get_resident_details`,
    {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_bed_id: Number(bedId),
      }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const error = await response.text();

    throw new Error(
      `Failed to load resident details: ${error}`
    );
  }

  const data: ResidentDetails[] = await response.json();

  return data.length > 0 ? data[0] : null;
}

async function getBookingLedger(
  bookingId: number
): Promise<BookingLedger | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/get_booking_ledger`,
    {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_booking_id: bookingId }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to load rent ledger: ${await response.text()}`);
  }

  const data: BookingLedger[] = await response.json();
  return data.length > 0 ? data[0] : null;
}

async function getPaymentHistory(
  bookingId: number
): Promise<PaymentHistoryRow[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/get_payment_history`,
    {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_booking_id: bookingId }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to load payment history: ${await response.text()}`
    );
  }

  return response.json();
}

async function getDepositSummary(
  bookingId: number
): Promise<DepositSummary | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/get_deposit_summary`,
    {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_booking_id: bookingId }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to load deposit summary: ${await response.text()}`
    );
  }

  const data: DepositSummary[] = await response.json();
  return data.length > 0 ? data[0] : null;
}

function getDepositStatusClasses(status: string) {
  if (status === "Held") return "bg-emerald-50 text-emerald-700";
  if (status === "Refunded") return "bg-slate-100 text-slate-600";
  if (status === "Partially Received" || status === "Partially Refunded") {
    return "bg-amber-50 text-amber-700";
  }
  if (status === "Deposit Expected") return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-600";
}

function formatMonth(date: string | null) {
  if (!date) return "-";
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

function getPaymentStatusClasses(status: string) {
  if (status === "Paid" || status === "Advance Paid") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "Partially Paid") {
    return "bg-amber-50 text-amber-700";
  }
  if (status === "Overdue") {
    return "bg-red-50 text-red-700";
  }
  return "bg-slate-100 text-slate-600";
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

function formatMoney(value: number | null) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

export default async function ResidentPage({
  params,
}: PageProps) {
  const { hostelSlug, roomNumber, bedId } = await params;

  const resident = await getResidentDetails(bedId);

  if (!resident) {
    notFound();
  }

  const ledger = await getBookingLedger(resident.booking_id);
  const payments = await getPaymentHistory(resident.booking_id);
  const deposit = await getDepositSummary(resident.booking_id);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">

        <a
          href={`/${hostelSlug}/room/${roomNumber}`}
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Room {roomNumber}
        </a>

        <div className="mt-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">

          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              {resident.hostel_name} · Floor{" "}
              {resident.floor_number} · Room{" "}
              {resident.room_number}
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              {resident.full_name}
            </h1>

            <p className="mt-2 text-slate-500">
              {resident.bed_number}
            </p>
          </div>

          <span className="w-fit rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
            Active Booking
          </span>

        </div>

        <section className="mt-10 grid gap-5 md:grid-cols-2">

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <h2 className="text-xl font-bold">
              Resident Details
            </h2>

            <div className="mt-6 space-y-5">

              <DetailRow
                label="Full Name"
                value={resident.full_name}
              />

              <DetailRow
                label="Mobile Number"
                value={resident.mobile_number || "Not provided"}
              />

              <DetailRow
                label="Email"
                value={resident.email || "Not provided"}
              />

              <DetailRow
                label="Emergency Contact"
                value={
                  resident.emergency_contact || "Not provided"
                }
              />
<DetailRow
  label="ID Proof Type"
  value={resident.id_proof_type || "Not provided"}
/>

<DetailRow
  label="ID Proof Number / Value"
  value={resident.id_proof_number || "Not provided"}
/>

<DetailRow
  label="Home Address"
  value={resident.home_address || "Not provided"}
/>

<DetailRow
  label="Work / College Address"
  value={resident.work_college_address || "Not provided"}
/>
            </div>

          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <h2 className="text-xl font-bold">
              Bed & Booking
            </h2>

            <div className="mt-6 space-y-5">

              <DetailRow
                label="Hostel"
                value={resident.hostel_name}
              />

              <DetailRow
                label="Room"
                value={`Room ${resident.room_number}`}
              />

              <DetailRow
                label="Bed"
                value={resident.bed_number}
              />

              <DetailRow
                label="Bed ID"
                value={resident.bed_code || "Not set"}
              />

              <DetailRow
                label="Booking Status"
                value={resident.booking_status}
              />

            </div>

          </div>

        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

          <h2 className="text-xl font-bold">
            Stay & Rent Details
          </h2>

          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">

            <InfoCard
              label="Start Date"
              value={formatDate(resident.start_date)}
            />

            <InfoCard
              label="End Date"
              value={formatDate(resident.end_date)}
            />

            <InfoCard
              label="Agreed Monthly Rent"
              value={formatMoney(resident.monthly_rent)}
            />

            <InfoCard
              label="Security Deposit"
              value={formatMoney(
                resident.security_deposit
              )}
            />

          </div>

        </section>

        {deposit && (
          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <h2 className="text-xl font-bold">
              Security Deposit
            </h2>

            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <InfoCard
                label="Deposit Agreed"
                value={formatMoney(deposit.deposit_agreed)}
              />

              <InfoCard
                label="Deposit Received"
                value={formatMoney(deposit.deposit_received)}
              />

              <InfoCard
                label="Deposit Balance"
                value={formatMoney(deposit.deposit_balance)}
              />

              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-400">
                  Deposit Status
                </p>
                <span
                  className={`mt-2 inline-block rounded-full px-3 py-1 text-sm font-semibold ${getDepositStatusClasses(
                    deposit.deposit_status
                  )}`}
                >
                  {deposit.deposit_status}
                </span>
              </div>
            </div>
          </section>
        )}

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">
              Rent Ledger
            </h2>

            <a
              href={`/${hostelSlug}/room/${roomNumber}/resident/${bedId}/payment/new`}
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Record Payment
            </a>
          </div>

          {ledger && (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <InfoCard
                label="Monthly Rent"
                value={formatMoney(ledger.monthly_rent)}
              />

              <InfoCard
                label="Amount Due"
                value={formatMoney(ledger.amount_due)}
              />

              <InfoCard
                label="Amount Paid"
                value={formatMoney(ledger.amount_paid)}
              />

              <InfoCard
                label="Balance Outstanding"
                value={formatMoney(ledger.balance_outstanding)}
              />

              <InfoCard
                label="Last Payment Date"
                value={
                  ledger.last_payment_date
                    ? formatDate(ledger.last_payment_date)
                    : "No payments yet"
                }
              />

              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-400">
                  Payment Status
                </p>
                <span
                  className={`mt-2 inline-block rounded-full px-3 py-1 text-sm font-semibold ${getPaymentStatusClasses(
                    ledger.payment_status
                  )}`}
                >
                  {ledger.payment_status}
                </span>
              </div>
            </div>
          )}

          <div className="mt-8">
            <h3 className="text-sm font-semibold text-slate-700">
              Payment History
            </h3>

            {payments.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No payments recorded yet.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Receipt No.</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">For Month</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Mode</th>
                      <th className="px-4 py-3">Reference</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {payments.map((payment) => (
                      <tr
                        key={payment.payment_id}
                        className={
                          payment.status === "reversed"
                            ? "bg-slate-50 text-slate-400 line-through"
                            : "hover:bg-slate-50"
                        }
                      >
                        <td className="px-4 py-3 font-semibold">
                          {payment.receipt_number}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {formatDate(payment.payment_date)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {formatMonth(payment.payment_for_month)}
                        </td>
                        <td className="px-4 py-3">{payment.payment_type}</td>
                        <td className="px-4 py-3 font-semibold">
                          {formatMoney(payment.amount)}
                        </td>
                        <td className="px-4 py-3">{payment.payment_mode}</td>
                        <td className="px-4 py-3">
                          {payment.reference_number || "-"}
                        </td>
                        <td className="px-4 py-3 text-right no-underline">
                          {payment.status === "active" ? (
                            <a
                              href={`/${hostelSlug}/room/${roomNumber}/resident/${bedId}/payment/${payment.payment_id}/receipt`}
                              className="font-semibold text-indigo-600 hover:text-indigo-700"
                            >
                              Receipt →
                            </a>
                          ) : (
                            <span className="text-xs">
                              Reversed
                              {payment.reversed_reason
                                ? `: ${payment.reversed_reason}`
                                : ""}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

          <h2 className="text-xl font-bold">
            Notes
          </h2>

          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">
            {resident.notes || "No notes added."}
          </p>

        </section>

        <section className="mt-8 flex flex-wrap gap-3">

        <a
  href={`/${hostelSlug}/room/${roomNumber}/resident/${bedId}/edit`}
  className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
>
  Edit Details
</a>

          <a
            href={`/${hostelSlug}/room/${roomNumber}/resident/${bedId}/settle`}
            className="rounded-xl border border-red-200 bg-white px-5 py-3 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            Vacate / Final Settlement
          </a>

        </section>

      </div>
    </main>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">

      <p className="text-xs font-medium text-slate-400">
        {label}
      </p>

      <p className="mt-1 font-semibold text-slate-900">
        {value}
      </p>

    </div>
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">

      <p className="text-xs font-medium text-slate-400">
        {label}
      </p>

      <p className="mt-2 font-bold text-slate-900">
        {value}
      </p>

    </div>
  );
}
