import { notFound } from "next/navigation";
import ApplicationFormDocument from "@/components/ApplicationFormDocument";
import ApplicationFormPrintButton from "@/components/ApplicationFormPrintButton";
import {
  getBookingDetails,
  getProfileExtra,
  getStandardRate,
  getPrimaryPhotoUrl,
  getDeclarationText,
} from "@/lib/applicationForm";

type PageProps = {
  params: Promise<{
    bookingId: string;
  }>;
};

export default async function HistoricalApplicationFormPage({
  params,
}: PageProps) {
  const { bookingId } = await params;

  const booking = await getBookingDetails(Number(bookingId));
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
          declarationText={declarationText}
          generatedAt={new Date().toISOString()}
        />
      </div>
    </main>
  );
}
