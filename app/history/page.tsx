import BookingSearchTable from "./BookingSearchTable";
import StatCard from "@/components/StatCard";
import { callRpcServer } from "@/lib/supabase/callRpcServer";

type BookingHistoryRow = {
  booking_id: number;
  resident_id: number;
  full_name: string;
  mobile_number: string | null;
  email: string | null;
  emergency_contact: string | null;
  notes: string | null;
  hostel_name: string;
  floor_number: number;
  room_number: string;
  bed_number: string;
  bed_code: string | null;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  security_deposit: number | null;
  booking_status: string;
  created_at: string;
};

async function getBookingHistory(): Promise<BookingHistoryRow[]> {
  return callRpcServer<BookingHistoryRow[]>("get_booking_history");
}

export default async function HistoryPage() {
  const bookings = await getBookingHistory();

  const active = bookings.filter(
    (booking) =>
      booking.booking_status === "confirmed" ||
      booking.booking_status === "checked_in"
  ).length;

  const completed = bookings.filter(
    (booking) => booking.booking_status === "completed"
  ).length;

  const noShows = bookings.filter(
    (booking) => booking.booking_status === "no_show"
  ).length;

  const futureBookingsConsidered = bookings.filter((booking) =>
    ["confirmed", "checked_in", "no_show"].includes(booking.booking_status)
  ).length;

  const noShowRate =
    futureBookingsConsidered === 0
      ? 0
      : Math.round((noShows / futureBookingsConsidered) * 1000) / 10;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl">

        <a
          href="/"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Dashboard
        </a>

        <div className="mt-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              Hostel Management
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              Booking History
            </h1>

            <p className="mt-2 text-slate-500">
              Current and former resident bookings.
            </p>
          </div>
        </div>

        <section className="mt-10 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            label="Total Bookings"
            value={bookings.length}
          />

          <StatCard
            label="Active"
            value={active}
            green
          />

          <StatCard
            label="Completed"
            value={completed}
          />

          <StatCard
            label="No Shows"
            value={noShows}
          />

          <StatCard
            label="No-Show Rate %"
            value={noShowRate}
          />
        </section>

        <BookingSearchTable bookings={bookings} />

      </div>
    </main>
  );
}
