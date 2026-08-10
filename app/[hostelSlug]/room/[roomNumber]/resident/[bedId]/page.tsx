import { notFound } from "next/navigation";
import GiveNoticeButton from "./GiveNoticeButton";
import ExtendStayButton from "./ExtendStayButton";
import CopyTextButton from "@/components/CopyTextButton";
import ReviseRentButton from "./ReviseRentButton";
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
  notice_given_at: string | null;
  expected_vacate_date: string | null;
  notice_notes: string | null;
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

type RentRevisionRow = {
  revision_id: number;
  previous_rent: number;
  new_rent: number;
  effective_date: string;
  reason: string | null;
  notes: string | null;
};

type TransferRecord = {
  transfer_id: number;
  transfer_date: string;
  reason: string;
  notes: string | null;
  old_hostel_name: string;
  old_room_number: string;
  old_bed_code: string | null;
  new_hostel_name: string;
  new_room_number: string;
  new_bed_code: string | null;
  rent_before: number | null;
  rent_after: number | null;
};

type ProfileExtra = {
  date_of_birth: string | null;
  gender: string | null;
  photo_url: string | null;
  employer_or_college: string | null;
  occupation_or_course: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_mobile: string | null;
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

async function getProfileExtra(
  residentId: number
): Promise<ProfileExtra | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/get_resident_profile_extra`,
    {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_resident_id: residentId }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to load additional profile details: ${await response.text()}`
    );
  }

  const data: ProfileExtra[] = await response.json();
  return data.length > 0 ? data[0] : null;
}

async function getTransferHistory(
  residentId: number
): Promise<TransferRecord[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/get_transfer_history`,
    {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_resident_id: residentId }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to load transfer history: ${await response.text()}`
    );
  }

  return response.json();
}

async function getRentHistory(bookingId: number): Promise<RentRevisionRow[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_rent_history`, {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_booking_id: bookingId }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load rent history: ${await response.text()}`);
  }

  return response.json();
}

function computeProfileCompleteness(
  resident: ResidentDetails,
  extra: ProfileExtra | null
) {
  const hasMobile = Boolean(resident.mobile_number);
  const hasAddress = Boolean(resident.home_address);
  const hasIdProof = Boolean(resident.id_proof_number);
  const hasDeposit = Number(resident.security_deposit || 0) > 0;
  const hasEmergencyContact = Boolean(
    (extra?.emergency_contact_name && extra?.emergency_contact_mobile) ||
      resident.emergency_contact
  );
  const hasPhoto = Boolean(extra?.photo_url);

  const checklist = [
    { label: "Mobile Number", done: hasMobile },
    { label: "Home Address", done: hasAddress },
    { label: "ID Proof", done: hasIdProof },
    { label: "Security Deposit", done: hasDeposit },
    { label: "Emergency Contact", done: hasEmergencyContact },
    { label: "Photo", done: hasPhoto },
  ];

  const percent = Math.round(
    (checklist.filter((item) => item.done).length / checklist.length) * 100
  );

  return { percent, checklist };
}

function formatDobAge(dob: string) {
  const birth = new Date(`${dob}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return `${birth.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} (${age} yrs)`;
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
  const profileExtra = await getProfileExtra(resident.resident_id);
  const completeness = computeProfileCompleteness(resident, profileExtra);
  const transfers = await getTransferHistory(resident.resident_id);
  const rentHistory = await getRentHistory(resident.booking_id);

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

          <span
            className={`w-fit rounded-full px-4 py-2 text-sm font-semibold ${
              resident.notice_given_at
                ? "bg-amber-50 text-amber-700"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {resident.notice_given_at ? "Vacating Soon" : "Active Booking"}
          </span>

        </div>

        {resident.notice_given_at && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="font-semibold text-amber-800">
              Notice given on {formatDate(resident.notice_given_at)}
            </p>
            <p className="mt-1 text-sm text-amber-700">
              Expected to vacate on{" "}
              {resident.expected_vacate_date
                ? formatDate(resident.expected_vacate_date)
                : "not specified"}
              {resident.notice_notes ? ` — ${resident.notice_notes}` : ""}
            </p>
          </div>
        )}

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-700">
              Profile {completeness.percent}% Complete
            </p>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${
                completeness.percent === 100
                  ? "bg-emerald-500"
                  : completeness.percent >= 50
                  ? "bg-amber-500"
                  : "bg-red-500"
              }`}
              style={{ width: `${completeness.percent}%` }}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {completeness.checklist.map((item) => (
              <span
                key={item.label}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  item.done
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {item.done ? "✓" : "○"} {item.label}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-5 grid gap-5 md:grid-cols-2">

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
                  profileExtra?.emergency_contact_name
                    ? `${profileExtra.emergency_contact_name}${
                        profileExtra.emergency_contact_relationship
                          ? ` (${profileExtra.emergency_contact_relationship})`
                          : ""
                      }${
                        profileExtra.emergency_contact_mobile
                          ? ` · ${profileExtra.emergency_contact_mobile}`
                          : ""
                      }`
                    : resident.emergency_contact || "Not provided"
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
            Additional Details
          </h2>

          <div className="mt-6 grid gap-5 md:grid-cols-2">

            <DetailRow
              label="Date of Birth"
              value={
                profileExtra?.date_of_birth
                  ? formatDobAge(profileExtra.date_of_birth)
                  : "Not provided"
              }
            />

            <DetailRow
              label="Gender"
              value={profileExtra?.gender || "Not provided"}
            />

            <DetailRow
              label="Employer / College"
              value={profileExtra?.employer_or_college || "Not provided"}
            />

            <DetailRow
              label="Occupation / Course"
              value={profileExtra?.occupation_or_course || "Not provided"}
            />

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

        {rentHistory.length > 0 && (
          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">Rent History</h2>

            <div className="mt-5 space-y-3">
              {rentHistory.map((rev) => (
                <div
                  key={rev.revision_id}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <p className="text-xs font-medium text-slate-400">
                    Effective from {formatDate(rev.effective_date)}
                    {rev.reason ? ` · ${rev.reason}` : ""}
                  </p>
                  <p className="mt-1 font-semibold">
                    {formatMoney(rev.previous_rent)} → {formatMoney(rev.new_rent)}
                  </p>
                  {rev.notes && (
                    <p className="mt-1 text-sm text-slate-500">{rev.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

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

        {transfers.length > 0 && (
          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">Transfer History</h2>

            <div className="mt-5 space-y-4">
              {transfers.map((transfer) => (
                <div
                  key={transfer.transfer_id}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <p className="text-xs font-medium text-slate-400">
                    {formatDate(transfer.transfer_date)} · {transfer.reason}
                  </p>
                  <p className="mt-1 font-semibold">
                    {transfer.old_hostel_name} / Room{" "}
                    {transfer.old_room_number} ·{" "}
                    {transfer.old_bed_code || "-"} → {transfer.new_hostel_name}{" "}
                    / Room {transfer.new_room_number} ·{" "}
                    {transfer.new_bed_code || "-"}
                  </p>
                  {transfer.rent_before !== transfer.rent_after && (
                    <p className="mt-1 text-sm text-slate-500">
                      Rent changed from {formatMoney(transfer.rent_before)} to{" "}
                      {formatMoney(transfer.rent_after)}
                    </p>
                  )}
                  {transfer.notes && (
                    <p className="mt-1 text-sm text-slate-500">
                      {transfer.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

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

          {!resident.notice_given_at && (
            <a
              href={`/${hostelSlug}/room/${roomNumber}/resident/${bedId}/transfer`}
              className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Transfer to Another Bed
            </a>
          )}

          {!resident.notice_given_at && (
            <ExtendStayButton
              resident={{
                booking_id: resident.booking_id,
                full_name: resident.full_name,
                mobile_number: resident.mobile_number,
                email: resident.email,
                emergency_contact: resident.emergency_contact,
                id_proof_type: resident.id_proof_type,
                id_proof_number: resident.id_proof_number,
                home_address: resident.home_address,
                work_college_address: resident.work_college_address,
                notes: resident.notes,
                start_date: resident.start_date,
                end_date: resident.end_date,
                monthly_rent: resident.monthly_rent,
                security_deposit: resident.security_deposit,
              }}
            />
          )}

          {!resident.notice_given_at && (
            <ReviseRentButton
              bookingId={resident.booking_id}
              currentRent={resident.monthly_rent}
            />
          )}

          {!resident.notice_given_at && (
            <GiveNoticeButton bookingId={resident.booking_id} />
          )}

          <a
            href={`/${hostelSlug}/room/${roomNumber}/resident/${bedId}/settle`}
            className="rounded-xl border border-red-200 bg-white px-5 py-3 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            Vacate / Final Settlement
          </a>

        </section>

        <section className="mt-3 flex flex-wrap gap-3">
          {ledger && ledger.balance_outstanding > 0 && (
            <CopyTextButton
              label="Copy Rent Reminder"
              text={`Hi ${resident.full_name}, this is a reminder that your rent of ${formatMoney(ledger.balance_outstanding)} is outstanding for ${resident.hostel_name} (${resident.bed_code || resident.bed_number}). Please clear it at your earliest convenience. Thank you — VNR Boys Hostel.`}
            />
          )}

          {resident.notice_given_at && (
            <CopyTextButton
              label="Copy Checkout Reminder"
              text={`Hi ${resident.full_name}, this is a reminder that your vacate date for ${resident.hostel_name} (${resident.bed_code || resident.bed_number}) is ${
                resident.expected_vacate_date
                  ? formatDate(resident.expected_vacate_date)
                  : "coming up"
              }. Please ensure all dues are cleared and the room is vacated on time. Thank you — VNR Boys Hostel.`}
            />
          )}
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
