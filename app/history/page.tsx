import BookingSearchTable from "./BookingSearchTable";

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
  start_date: string;
  end_date: string;
  monthly_rent: number;
  security_deposit: number | null;
  booking_status: string;
  created_at: string;
};

async function getBookingHistory(): Promise<BookingHistoryRow[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/get_booking_history`,
    {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to load booking history: ${error}`);
  }

  return response.json();
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

        <section className="mt-10 grid gap-4 sm:grid-cols-3">
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
        </section>

        <BookingSearchTable bookings={bookings} />

      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  green = false,
}: {
  label: string;
  value: number;
  green?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

      <p className="text-sm text-slate-500">
        {label}
      </p>

      <p
        className={`mt-2 text-3xl font-bold ${
          green ? "text-emerald-600" : ""
        }`}
      >
        {value}
      </p>

    </div>
  );
}
