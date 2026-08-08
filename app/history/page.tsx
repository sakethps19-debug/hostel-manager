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

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(value: number | null) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function getStatusClasses(status: string) {
  if (status === "confirmed" || status === "checked_in") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (status === "completed") {
    return "bg-slate-100 text-slate-600";
  }

  if (status === "cancelled") {
    return "bg-red-50 text-red-700";
  }

  return "bg-amber-50 text-amber-700";
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

        <section className="mt-10 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="text-xl font-bold">
              Resident Bookings
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {bookings.length} booking record
              {bookings.length === 1 ? "" : "s"}
            </p>
          </div>

          {bookings.length === 0 ? (
            <div className="px-6 py-16 text-center text-slate-500">
              No booking history available.
            </div>
          ) : (
            <div className="overflow-x-auto">

              <table className="min-w-full text-left text-sm">

                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Resident</th>
                    <th className="px-6 py-4">Location</th>
                    <th className="px-6 py-4">Stay</th>
                    <th className="px-6 py-4">Rent</th>
                    <th className="px-6 py-4">Deposit</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">

                  {bookings.map((booking) => (
                    <tr
                      key={booking.booking_id}
                      className="hover:bg-slate-50"
                    >
                      <td className="px-6 py-5">

                        <p className="font-semibold text-slate-900">
                          {booking.full_name}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {booking.mobile_number || "No mobile number"}
                        </p>

                      </td>

                      <td className="px-6 py-5">

                        <p className="font-medium">
                          {booking.hostel_name}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          Room {booking.room_number} · {booking.bed_number}
                        </p>

                      </td>

                      <td className="px-6 py-5 whitespace-nowrap">

                        <p>
                          {formatDate(booking.start_date)}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          to {formatDate(booking.end_date)}
                        </p>

                      </td>

                      <td className="px-6 py-5 whitespace-nowrap font-semibold">
                        {formatMoney(booking.monthly_rent)}
                      </td>

                      <td className="px-6 py-5 whitespace-nowrap">
                        {formatMoney(booking.security_deposit)}
                      </td>

                      <td className="px-6 py-5">

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                            booking.booking_status
                          )}`}
                        >
                          {booking.booking_status}
                        </span>

                      </td>

                      <td className="px-6 py-5 text-right">

                        <a
                          href={`/history/${booking.booking_id}`}
                          className="font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                          View →
                        </a>

                      </td>
                    </tr>
                  ))}

                </tbody>

              </table>

            </div>
          )}

        </section>

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
