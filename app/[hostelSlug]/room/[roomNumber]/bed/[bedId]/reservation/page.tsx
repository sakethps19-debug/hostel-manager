import { notFound } from "next/navigation";
import { resolveHostelName } from "@/lib/hostel";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import CancelReservationButton from "./CancelReservationButton";

type FutureBooking = {
  booking_id: number;
  full_name: string;
  mobile_number: string | null;
  start_date: string;
  end_date: string;
  monthly_rent: number;
};

type PageProps = {
  params: Promise<{
    hostelSlug: string;
    roomNumber: string;
    bedId: string;
  }>;
};

async function getFutureBooking(bedId: string): Promise<FutureBooking | null> {
  const data = await callRpcServer<FutureBooking[]>(
    "get_future_booking_for_bed",
    { p_bed_id: Number(bedId) }
  );
  return data.length > 0 ? data[0] : null;
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function ReservationPage({ params }: PageProps) {
  const { hostelSlug, roomNumber, bedId } = await params;

  const hostelName = await resolveHostelName(hostelSlug);

  if (!hostelName) {
    notFound();
  }

  const booking = await getFutureBooking(bedId);

  if (!booking) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <a
          href={`/${hostelSlug}/room/${roomNumber}`}
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Room {roomNumber}
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            {hostelName} · Room {roomNumber}
          </p>

          <h1 className="mt-2 text-4xl font-bold">{booking.full_name}</h1>

          <p className="mt-2 text-slate-500">Upcoming reservation</p>
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-slate-400">Mobile Number</p>
              <p className="mt-1 font-semibold">
                {booking.mobile_number || "Not provided"}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-400">Agreed Rent</p>
              <p className="mt-1 font-semibold">
                Rs. {Number(booking.monthly_rent).toLocaleString("en-IN")}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-400">Start Date</p>
              <p className="mt-1 font-semibold">
                {formatDate(booking.start_date)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-400">End Date</p>
              <p className="mt-1 font-semibold">
                {formatDate(booking.end_date)}
              </p>
            </div>
          </div>

          <div className="mt-6">
            <CancelReservationButton
              bookingId={booking.booking_id}
              redirectHref={`/${hostelSlug}/room/${roomNumber}`}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
