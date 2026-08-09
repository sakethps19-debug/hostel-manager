import { notFound } from "next/navigation";
import PaymentForm from "./PaymentForm";

type ResidentSummary = {
  booking_id: number;
  full_name: string;
  hostel_name: string;
  room_number: string;
  bed_code: string | null;
  bed_number: string;
  monthly_rent: number;
};

type PageProps = {
  params: Promise<{
    hostelSlug: string;
    roomNumber: string;
    bedId: string;
  }>;
};

async function getResidentSummary(
  bedId: string
): Promise<ResidentSummary | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

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
      body: JSON.stringify({ p_bed_id: Number(bedId) }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to load resident: ${await response.text()}`);
  }

  const data: ResidentSummary[] = await response.json();
  return data.length > 0 ? data[0] : null;
}

export default async function NewPaymentPage({ params }: PageProps) {
  const { hostelSlug, roomNumber, bedId } = await params;

  const resident = await getResidentSummary(bedId);

  if (!resident) {
    notFound();
  }

  return (
    <PaymentForm
      hostelSlug={hostelSlug}
      roomNumber={roomNumber}
      bedId={bedId}
      bookingId={resident.booking_id}
      residentName={resident.full_name}
      hostelName={resident.hostel_name}
      bedLabel={resident.bed_code || resident.bed_number}
      monthlyRent={Number(resident.monthly_rent)}
    />
  );
}
