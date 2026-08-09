import { slugifyHostelName } from "@/lib/hostel";

type HostelDashboardRow = {
  hostel_id: number;
  hostel_name: string;
  floors: number;
  rooms: number;
  total_beds: number;
  occupied_beds: number;
  vacant_beds: number;
};

type RentSummary = {
  rent_due_this_month: number;
  rent_collected_this_month: number;
  outstanding_total: number;
  overdue_residents_count: number;
  security_deposit_agreed_total: number;
};

async function getHostelDashboard(): Promise<HostelDashboardRow[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/get_hostel_dashboard`,
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
    throw new Error(
      `Failed to load hostel dashboard: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

async function getRentSummary(): Promise<RentSummary | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/get_rent_dashboard_summary`,
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
    throw new Error(
      `Failed to load rent summary: ${response.status} ${response.statusText}`
    );
  }

  const data: RentSummary[] = await response.json();
  return data.length > 0 ? data[0] : null;
}

function formatMoney(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

export default async function Home() {
  const hostels = await getHostelDashboard();
  const rentSummary = await getRentSummary();

  const totalBeds = hostels.reduce(
    (sum, hostel) => sum + Number(hostel.total_beds),
    0
  );

  const occupiedBeds = hostels.reduce(
    (sum, hostel) => sum + Number(hostel.occupied_beds),
    0
  );

  const vacantBeds = hostels.reduce(
    (sum, hostel) => sum + Number(hostel.vacant_beds),
    0
  );

  const occupancy =
    totalBeds === 0
      ? 0
      : Math.round((occupiedBeds / totalBeds) * 1000) / 10;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-indigo-600">
              Hostel Management
            </p>

            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Hostel Manager
            </h1>

            <p className="mt-2 text-slate-500">
              Bed availability and occupancy dashboard
            </p>
          </div>
         <div className="flex flex-wrap gap-3">
  <a
    href="/history"
    className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
  >
    Booking History
  </a>

  <a
    href={hostels.length ? `/${slugifyHostelName(hostels[0].hostel_name)}` : "/"}
    className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
  >
    + New Booking
  </a>
</div>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Total Beds</p>
            <p className="mt-2 text-3xl font-bold">{totalBeds}</p>
            <p className="mt-2 text-sm text-slate-400">
              Across {hostels.length} hostels
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Occupied</p>
            <p className="mt-2 text-3xl font-bold">{occupiedBeds}</p>
            <p className="mt-2 text-sm text-slate-400">Currently booked beds</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Vacant</p>
            <p className="mt-2 text-3xl font-bold text-emerald-600">
              {vacantBeds}
            </p>
            <p className="mt-2 text-sm text-slate-400">Available for booking</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Occupancy</p>
            <p className="mt-2 text-3xl font-bold">{occupancy}%</p>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-indigo-600"
                style={{ width: `${occupancy}%` }}
              />
            </div>
          </div>
        </section>

        {rentSummary && (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-700">
                Rent Collection · This Month
              </p>

              <a
                href="/rent/overdue"
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
              >
                View Overdue Rent →
              </a>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">
                  Rent Due
                </p>
                <p className="mt-2 text-2xl font-bold">
                  {formatMoney(rentSummary.rent_due_this_month)}
                </p>
              </div>

              <div className="rounded-xl bg-emerald-50 p-4">
                <p className="text-xs font-medium text-emerald-700">
                  Rent Collected
                </p>
                <p className="mt-2 text-2xl font-bold text-emerald-700">
                  {formatMoney(rentSummary.rent_collected_this_month)}
                </p>
              </div>

              <div className="rounded-xl bg-red-50 p-4">
                <p className="text-xs font-medium text-red-700">
                  Outstanding
                </p>
                <p className="mt-2 text-2xl font-bold text-red-700">
                  {formatMoney(rentSummary.outstanding_total)}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">
                  Collection %
                </p>
                <p className="mt-2 text-2xl font-bold">
                  {rentSummary.rent_due_this_month > 0
                    ? `${(
                        (rentSummary.rent_collected_this_month /
                          rentSummary.rent_due_this_month) *
                        100
                      ).toFixed(1)}%`
                    : "-"}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-5 text-sm text-slate-500">
              <span>
                <span className="font-semibold text-red-600">
                  {rentSummary.overdue_residents_count}
                </span>{" "}
                resident{rentSummary.overdue_residents_count === 1 ? "" : "s"}{" "}
                overdue
              </span>

              <span>
                Security deposits agreed:{" "}
                <span className="font-semibold text-slate-700">
                  {formatMoney(rentSummary.security_deposit_agreed_total)}
                </span>
              </span>
            </div>
          </section>
        )}

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <a
            href="/find-bed"
            className="block rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-left transition hover:bg-indigo-100"
          >
            <p className="text-lg font-semibold text-indigo-900">
              Find an Available Bed
            </p>
            <p className="mt-1 text-sm text-indigo-700">
              Search vacant beds by sharing type and rent.
            </p>
          </a>

          <a
            href="/vacancies"
            className="block rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:bg-slate-50"
          >
            <p className="text-lg font-semibold">View Upcoming Vacancies</p>
            <p className="mt-1 text-sm text-slate-500">
              See beds that will become available soon.
            </p>
          </a>
        </section>

        <section className="mt-10">
          <div className="mb-5">
            <h2 className="text-xl font-bold">Hostels</h2>
            <p className="mt-1 text-sm text-slate-500">
              Select a hostel to view floors, rooms and individual beds.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {hostels.map((hostel) => {
              const hostelOccupancy =
                Number(hostel.total_beds) === 0
                  ? 0
                  : Math.round(
                      (Number(hostel.occupied_beds) /
                        Number(hostel.total_beds)) *
                        1000
                    ) / 10;

              return (
                <div
                  key={hostel.hostel_id}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xl font-bold">
                        {hostel.hostel_name}
                      </h3>

                      <p className="mt-1 text-sm text-slate-500">
                        {hostel.floors} floors · {hostel.rooms} rooms
                      </p>
                    </div>

                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                      {hostel.vacant_beds} vacant
                    </span>
                  </div>

                  <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xl font-bold">
                        {hostel.total_beds}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Beds</p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xl font-bold">
                        {hostel.occupied_beds}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Occupied</p>
                    </div>

                    <div className="rounded-xl bg-emerald-50 p-3">
                      <p className="text-xl font-bold text-emerald-600">
                        {hostel.vacant_beds}
                      </p>
                      <p className="mt-1 text-xs text-emerald-700">Vacant</p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="mb-2 flex justify-between text-sm">
                      <span className="text-slate-500">Occupancy</span>
                      <span className="font-semibold">
                        {hostelOccupancy}%
                      </span>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-indigo-600"
                        style={{ width: `${hostelOccupancy}%` }}
                      />
                    </div>
                  </div>
                 <a
    href={`/${slugifyHostelName(hostel.hostel_name)}`}
    className="mt-6 block w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold transition hover:bg-slate-50"
  >
    View Hostel →
  </a>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-4 text-sm font-semibold text-slate-700">
            Bed Status
          </p>

          <div className="flex flex-wrap gap-5 text-sm">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-500" />
              Vacant
            </div>

            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-500" />
              Occupied
            </div>

            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-amber-500" />
              Vacating Soon
            </div>

            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-blue-500" />
              Future Booking
            </div>

            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-slate-400" />
              Maintenance
            </div>
          </div>
        </section>

        <footer className="py-8 text-center text-sm text-slate-400">
          Hostel Manager · Live Database
        </footer>
      </div>
    </main>
  );
}
