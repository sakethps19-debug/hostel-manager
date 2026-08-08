import { notFound } from "next/navigation";
import VacateButton from "./VacateButton";
type ResidentDetails = {
  resident_id: number;
  booking_id: number;
  full_name: string;
  mobile_number: string | null;
  email: string | null;
  emergency_contact: string | null;
  id_proof_type: string | null;
id_proof_number: string | null;
  notes: string | null;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  security_deposit: number | null;
  booking_status: string;
  bed_number: string;
  room_number: string;
  floor_number: number;
  hostel_name: string;
};

type PageProps = {
  params: Promise<{
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
  const { roomNumber, bedId } = await params;

  const resident = await getResidentDetails(bedId);

  if (!resident) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">

        <a
          href={`/hostel-1/room/${roomNumber}`}
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
  href={`/hostel-1/room/${roomNumber}/resident/${bedId}/edit`}
  className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
>
  Edit Details
</a>

          <button
            disabled
            className="cursor-not-allowed rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-400"
          >
            Extend Booking
          </button>

          <VacateButton
  bookingId={resident.booking_id}
  roomNumber={roomNumber}
/>

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
