import { notFound } from "next/navigation";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
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

export default async function SettlePage({ params }: PageProps) {
  await requirePermission("manageBookings");

  const { hostelSlug, roomNumber, bedId } = await params;

  const residentRows = await callRpcServer<ResidentSummary[]>(
    "get_resident_details",
    { p_bed_id: Number(bedId) }
  );

  const resident = residentRows.length > 0 ? residentRows[0] : null;

  if (!resident) {
    notFound();
  }

  const ledgerRows = await callRpcServer<BookingLedger[]>(
    "get_booking_ledger",
    { p_booking_id: resident.booking_id }
  );

  const depositRows = await callRpcServer<DepositSummary[]>(
    "get_deposit_summary",
    { p_booking_id: resident.booking_id }
  );

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
