import { notFound } from "next/navigation";
import { resolveHostelName } from "@/lib/hostel";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import BookingForm from "./BookingForm";

type RoomRow = {
  room_number: string;
  monthly_rent: number;
};

type BedRow = {
  bed_id: number;
  bed_code: string | null;
};

type PageProps = {
  params: Promise<{
    hostelSlug: string;
    roomNumber: string;
    bedId: string;
  }>;
};

async function getHostelRooms(hostelName: string): Promise<RoomRow[]> {
  return callRpcServer<RoomRow[]>("get_hostel_rooms", {
    p_hostel_name: hostelName,
  });
}

async function getRoomBeds(
  hostelName: string,
  roomNumber: string
): Promise<BedRow[]> {
  return callRpcServer<BedRow[]>("get_room_beds", {
    p_hostel_name: hostelName,
    p_room_number: roomNumber,
  });
}

export default async function BookingPage({ params }: PageProps) {
  await requirePermission("manageBookings");

  const { hostelSlug, roomNumber, bedId } = await params;

  const hostelName = await resolveHostelName(hostelSlug);

  if (!hostelName) {
    notFound();
  }

  const rooms = await getHostelRooms(hostelName);
  const room = rooms.find((r) => r.room_number === roomNumber);

  if (!room) {
    notFound();
  }

  const beds = await getRoomBeds(hostelName, roomNumber);
  const bed = beds.find((b) => b.bed_id === Number(bedId));

  return (
    <BookingForm
      hostelSlug={hostelSlug}
      hostelName={hostelName}
      roomNumber={roomNumber}
      bedId={Number(bedId)}
      bedCode={bed?.bed_code || null}
      standardFee={Number(room.monthly_rent)}
    />
  );
}
