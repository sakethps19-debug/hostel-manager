type BedRow = {
  bed_id: number;
  bed_number: string;
  bed_status: string;
  occupant_name: string | null;
  booking_start: string | null;
  booking_end: string | null;
  monthly_rent: number | null;
};

async function getRoomBeds(): Promise<BedRow[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/get_room_beds`,
    {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_hostel_name: "Hostel 1",
        p_room_number: "101",
      }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to load beds: ${error}`);
  }

  return response.json();
}

export default async function Room101Page() {
  const beds = await getRoomBeds();

  const occupied = beds.filter((bed) => bed.occupant_name !== null).length;
  const vacant = beds.length - occupied;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">

        <a
          href="/hostel-1"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Hostel 1
        </a>

        <div className="mt-7 flex items-end justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              Hostel 1 · Floor 1
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              Room 101
            </h1>

            <p className="mt-2 text-slate-500">
              3 Sharing · Rs. 7,000 per bed / month
            </p>
          </div>

          <button className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700">
            + New Booking
          </button>
        </div>

        <section className="mt-10 grid gap-4 sm:grid-cols-3">

          <StatCard
            label="Total Beds"
            value={beds.length}
          />

          <StatCard
            label="Occupied"
            value={occupied}
          />

          <StatCard
            label="Vacant"
            value={vacant}
            green
          />

        </section>

        <section className="mt-10">

          <div>
            <h2 className="text-2xl font-bold">
              Beds
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Individual bed availability and resident details.
            </p>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-3">

            {beds.map((bed) => {
              const isOccupied = bed.occupant_name !== null;

              return (
                <div
                  key={bed.bed_id}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex items-start justify-between">

                    <div>
                      <p className="text-xs font-medium text-slate-400">
                        BED
                      </p>

                      <h3 className="mt-1 text-xl font-bold">
                        {bed.bed_number}
                      </h3>
                    </div>

                    <span
                      className={
                        isOccupied
                          ? "rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700"
                          : "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                      }
                    >
                      {isOccupied ? "Occupied" : "Vacant"}
                    </span>

                  </div>

                  <div className="mt-6 border-t border-slate-100 pt-5">

                    {isOccupied ? (
                      <>
                        <p className="text-xs text-slate-400">
                          Resident
                        </p>

                        <p className="mt-1 font-semibold">
                          {bed.occupant_name}
                        </p>

                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">

                          <div>
                            <p className="text-xs text-slate-400">
                              From
                            </p>
                            <p className="mt-1">
                              {bed.booking_start}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-slate-400">
                              Until
                            </p>
                            <p className="mt-1">
                              {bed.booking_end}
                            </p>
                          </div>

                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-slate-500">
                          This bed is currently available.
                        </p>

                        <p className="mt-4 text-lg font-bold">
                          Rs. 7,000
                        </p>

                        <p className="text-xs text-slate-400">
                          per month
                        </p>
                      </>
                    )}

                  </div>

                  <button
                    className={
                      isOccupied
                        ? "mt-6 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold hover:bg-slate-50"
                        : "mt-6 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
                    }
                  >
                    {isOccupied ? "View Resident" : "Book This Bed"}
                  </button>

                </div>
              );
            })}

          </div>
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
