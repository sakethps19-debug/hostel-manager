import { notFound } from "next/navigation";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
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
  const data = await callRpcServer<ResidentSummary[]>("get_resident_details", {
    p_bed_id: Number(bedId),
  });
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
