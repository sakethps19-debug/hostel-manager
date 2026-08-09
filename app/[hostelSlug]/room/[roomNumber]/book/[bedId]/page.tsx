import { notFound } from "next/navigation";
import { resolveHostelName } from "@/lib/hostel";
import BookingForm from "./BookingForm";

type RoomRow = {
  room_number: string;
  monthly_rent: number;
};

type PageProps = {
  params: Promise<{
    hostelSlug: string;
    roomNumber: string;
    bedId: string;
  }>;
};

async function getHostelRooms(hostelName: string): Promise<RoomRow[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/get_hostel_rooms`,
    {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_hostel_name: hostelName }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Unable to load rooms: ${errorText}`);
  }

  return response.json();
}

export default async function BookingPage({ params }: PageProps) {
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

  return (
    <BookingForm
      hostelSlug={hostelSlug}
      hostelName={hostelName}
      roomNumber={roomNumber}
      bedId={Number(bedId)}
      standardFee={Number(room.monthly_rent)}
    />
  );
}
