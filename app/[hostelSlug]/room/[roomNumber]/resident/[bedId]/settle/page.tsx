import { notFound } from "next/navigation";
import SettlementForm from "./SettlementForm";

type ResidentSummary = {
  booking_id: number;
  full_name: string;
  hostel_name: string;
  room_number: string;
  bed_code: string | null;
  bed_number: string;
  booking_status: string;
};

type BookingLedger = {
  balance_outstanding: number;
};

type DepositSummary = {
  deposit_held: number;
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

export default async function SettlePage({ params }: PageProps) {
  const { hostelSlug, roomNumber, bedId } = await params;

  const residentRows = await callRpc<ResidentSummary[]>(
    "get_resident_details",
    { p_bed_id: Number(bedId) }
  );

  const resident = residentRows.length > 0 ? residentRows[0] : null;

  if (!resident) {
    notFound();
  }

  const ledgerRows = await callRpc<BookingLedger[]>("get_booking_ledger", {
    p_booking_id: resident.booking_id,
  });

  const depositRows = await callRpc<DepositSummary[]>("get_deposit_summary", {
    p_booking_id: resident.booking_id,
  });

  const outstandingRent =
    ledgerRows.length > 0 ? Math.max(ledgerRows[0].balance_outstanding, 0) : 0;

  const depositHeld = depositRows.length > 0 ? depositRows[0].deposit_held : 0;

  return (
    <SettlementForm
      hostelSlug={hostelSlug}
      roomNumber={roomNumber}
      bedId={bedId}
      bookingId={resident.booking_id}
      residentName={resident.full_name}
      hostelName={resident.hostel_name}
      bedLabel={resident.bed_code || resident.bed_number}
      outstandingRent={Number(outstandingRent)}
      depositHeld={Number(depositHeld)}
    />
  );
}
