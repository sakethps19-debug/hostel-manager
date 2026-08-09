import { slugifyHostelName } from "@/lib/hostel";

type UpcomingVacancyRow = {
  booking_id: number;
  bed_id: number;
  bed_number: string;
  hostel_name: string;
  floor_number: number;
  room_number: string;
  resident_id: number;
  full_name: string;
  mobile_number: string | null;
  end_date: string;
  days_left: number;
  monthly_rent: number;
};

async function getUpcomingVacancies(): Promise<UpcomingVacancyRow[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/get_upcoming_vacancies`,
    {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_days: 30 }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to load upcoming vacancies: ${error}`);
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

function getDaysLeftClasses(daysLeft: number) {
  if (daysLeft <= 7) return "bg-red-50 text-red-700";
  if (daysLeft <= 15) return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export default async function VacanciesPage() {
  const vacancies = await getUpcomingVacancies();

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <a
          href="/"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Dashboard
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Hostel Management
          </p>

          <h1 className="mt-2 text-4xl font-bold">Upcoming Vacancies</h1>

          <p className="mt-2 text-slate-500">
            Bookings ending in the next 30 days, sorted by soonest first.
          </p>
        </div>

        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {vacancies.length === 0 ? (
            <div className="px-6 py-16 text-center text-slate-500">
              No bookings are ending in the next 30 days.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Resident</th>
                    <th className="px-6 py-4">Location</th>
                    <th className="px-6 py-4">Vacating On</th>
                    <th className="px-6 py-4">Days Left</th>
                    <th className="px-6 py-4">Rent</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {vacancies.map((vacancy) => (
                    <tr key={vacancy.booking_id} className="hover:bg-slate-50">
                      <td className="px-6 py-5">
                        <p className="font-semibold text-slate-900">
                          {vacancy.full_name}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {vacancy.mobile_number || "No mobile number"}
                        </p>
                      </td>

                      <td className="px-6 py-5">
                        <p className="font-medium">{vacancy.hostel_name}</p>

                        <p className="mt-1 text-xs text-slate-500">
                          Room {vacancy.room_number} · {vacancy.bed_number}
                        </p>
                      </td>

                      <td className="px-6 py-5 whitespace-nowrap">
                        {formatDate(vacancy.end_date)}
                      </td>

                      <td className="px-6 py-5">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${getDaysLeftClasses(
                            vacancy.days_left
                          )}`}
                        >
                          {vacancy.days_left} day
                          {vacancy.days_left === 1 ? "" : "s"}
                        </span>
                      </td>

                      <td className="px-6 py-5 whitespace-nowrap font-semibold">
                        Rs. {Number(vacancy.monthly_rent).toLocaleString("en-IN")}
                      </td>

                      <td className="px-6 py-5 text-right">
                        <a
                          href={`/${slugifyHostelName(vacancy.hostel_name)}/room/${vacancy.room_number}/resident/${vacancy.bed_id}`}
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
