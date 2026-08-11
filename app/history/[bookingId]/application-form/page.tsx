import { notFound } from "next/navigation";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { getResidentFileSignedUrlServer } from "@/lib/supabase/residentFilesServer";
import ApplicationFormDocument, {
  type ApplicationFormBooking,
  type ApplicationFormProfileExtra,
} from "@/components/ApplicationFormDocument";
import ApplicationFormPrintButton from "@/components/ApplicationFormPrintButton";

type RoomRow = {
  room_number: string;
  monthly_rent: number;
};

type DocumentRow = {
  document_type: string;
  is_primary: boolean;
  storage_path: string;
};

type PageProps = {
  params: Promise<{
    bookingId: string;
  }>;
};

async function getBookingDetails(
  bookingId: string
): Promise<ApplicationFormBooking | null> {
  const data = await callRpcServer<ApplicationFormBooking[]>(
    "get_booking_details",
    { p_booking_id: Number(bookingId) }
  );
  return data.length > 0 ? data[0] : null;
}

async function getProfileExtra(
  residentId: number
): Promise<ApplicationFormProfileExtra> {
  const data = await callRpcServer<NonNullable<ApplicationFormProfileExtra>[]>(
    "get_resident_profile_extra",
    { p_resident_id: residentId }
  );
  return data.length > 0 ? data[0] : null;
}

async function getStandardRate(
  hostelName: string,
  roomNumber: string
): Promise<number | null> {
  const rooms = await callRpcServer<RoomRow[]>("get_hostel_rooms", {
    p_hostel_name: hostelName,
  });
  const room = rooms.find((r) => r.room_number === roomNumber);
  return room ? room.monthly_rent : null;
}

async function getPrimaryPhotoUrl(residentId: number): Promise<string | null> {
  const documents = await callRpcServer<DocumentRow[]>("get_resident_documents", {
    p_resident_id: residentId,
  });
  const photo = documents.find(
    (d) => d.document_type === "Resident Photo" && d.is_primary
  );
  if (!photo) return null;
  return getResidentFileSignedUrlServer(photo.storage_path, 3600);
}

export default async function HistoricalApplicationFormPage({
  params,
}: PageProps) {
  const { bookingId } = await params;

  const booking = await getBookingDetails(bookingId);
  if (!booking) notFound();

  const [profileExtra, standardRate, photoUrl] = await Promise.all([
    getProfileExtra(booking.resident_id),
    getStandardRate(booking.hostel_name, booking.room_number),
    getPrimaryPhotoUrl(booking.resident_id),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between print:hidden">
          <a
            href={`/history/${bookingId}`}
            className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
          >
            ← Back to Booking History
          </a>
          <ApplicationFormPrintButton bookingId={booking.booking_id} />
        </div>

        <ApplicationFormDocument
          booking={booking}
          profileExtra={profileExtra}
          standardRate={standardRate}
          photoUrl={photoUrl}
          declarationText={null}
          generatedAt={new Date().toISOString()}
        />
      </div>
    </main>
  );
}
