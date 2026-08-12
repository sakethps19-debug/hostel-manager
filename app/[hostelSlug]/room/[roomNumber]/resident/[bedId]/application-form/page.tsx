import { notFound } from "next/navigation";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import ApplicationFormDocument from "@/components/ApplicationFormDocument";
import ApplicationFormPrintButton from "@/components/ApplicationFormPrintButton";
import {
  getBookingDetails,
  getProfileExtra,
  getStandardRate,
  getPrimaryPhotoUrl,
  getDeclarationText,
} from "@/lib/applicationForm";

type ResidentDetails = {
  booking_id: number;
};

type PageProps = {
  params: Promise<{
    hostelSlug: string;
    roomNumber: string;
    bedId: string;
  }>;
};

async function getBookingIdForBed(bedId: string): Promise<number | null> {
  const data = await callRpcServer<ResidentDetails[]>("get_resident_details", {
    p_bed_id: Number(bedId),
  });
  return data.length > 0 ? data[0].booking_id : null;
}

export default async function ApplicationFormPage({ params }: PageProps) {
  const { hostelSlug, roomNumber, bedId } = await params;

  const bookingId = await getBookingIdForBed(bedId);
  if (!bookingId) notFound();

  const booking = await getBookingDetails(bookingId);
  if (!booking) notFound();

  const [profileExtra, standardRate, photoUrl, declarationText] = await Promise.all([
    getProfileExtra(booking.resident_id),
    getStandardRate(booking.hostel_name, booking.room_number),
    getPrimaryPhotoUrl(booking.resident_id),
    getDeclarationText(),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between print:hidden">
          <a
            href={`/${hostelSlug}/room/${roomNumber}/resident/${bedId}`}
            className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
          >
            ← Back to Resident Details
          </a>
          <ApplicationFormPrintButton bookingId={booking.booking_id} />
        </div>

        <ApplicationFormDocument
          booking={booking}
          profileExtra={profileExtra}
          standardRate={standardRate}
          photoUrl={photoUrl}
          declarationText={declarationText}
          generatedAt={new Date().toISOString()}
        />
      </div>
    </main>
  );
}
