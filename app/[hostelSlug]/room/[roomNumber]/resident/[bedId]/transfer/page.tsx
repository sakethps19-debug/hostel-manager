import { notFound } from "next/navigation";
import TransferForm from "./TransferForm";

type ResidentDetails = {
  resident_id: number;
  booking_id: number;
  full_name: string;
  bed_number: string;
  bed_code: string | null;
  room_number: string;
  hostel_name: string;
  monthly_rent: number;
  security_deposit: number | null;
  end_date: string;
  booking_status: string;
};

type AvailableBedRow = {
  bed_id: number;
  bed_number: string;
  bed_code: string | null;
  hostel_name: string;
  floor_number: number;
  floor_name: string | null;
  room_number: string;
  sharing_type: number;
  monthly_rent: number;
};

type PageProps = {
  params: Promise<{
    hostelSlug: string;
    roomNumber: string;
    bedId: string;
  }>;
};

async function callRpc<T>(name: string, body: object): Promise<T> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`${name} failed: ${await response.text()}`);
  }

  return response.json();
}

export default async function TransferResidentPage({ params }: PageProps) {
  const { hostelSlug, roomNumber, bedId } = await params;

  const residentRows = await callRpc<ResidentDetails[]>(
    "get_resident_details",
    { p_bed_id: Number(bedId) }
  );

  const resident = residentRows.length > 0 ? residentRows[0] : null;

  if (!resident || resident.booking_status !== "checked_in") {
    notFound();
  }

  const availableBeds = await callRpc<AvailableBedRow[]>(
    "get_available_beds",
    {}
  );

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <a
          href={`/${hostelSlug}/room/${roomNumber}/resident/${bedId}`}
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Resident Details
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            {resident.hostel_name} · Room {roomNumber}
          </p>

          <h1 className="mt-2 text-4xl font-bold">
            Transfer {resident.full_name}
          </h1>

          <p className="mt-2 text-slate-500">
            Currently in {resident.bed_code || resident.bed_number}. Pick a
            new bed below — the resident&apos;s full history stays intact.
          </p>
        </div>

        <TransferForm
          bookingId={resident.booking_id}
          currentBedLabel={resident.bed_code || resident.bed_number}
          currentMonthlyRent={resident.monthly_rent}
          currentSecurityDeposit={resident.security_deposit || 0}
          currentEndDate={resident.end_date}
          availableBeds={availableBeds}
          backHref={`/${hostelSlug}/room/${roomNumber}/resident/${bedId}`}
        />
      </div>
    </main>
  );
}
