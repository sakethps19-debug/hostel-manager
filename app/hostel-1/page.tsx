type RoomRow = {
  floor_number: number;
  room_number: string;
  sharing_type: number;
  monthly_rent: number;
  total_beds: number;
  occupied_beds: number;
  vacant_beds: number;
};

async function getHostelRooms(): Promise<RoomRow[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/get_hostel_rooms`,
    {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_hostel_name: "Hostel 1" }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Unable to load Hostel 1: ${errorText}`);
  }

  return response.json();
}

export default async function HostelOnePage() {
  const rooms = await getHostelRooms();

  const totalBeds = rooms.reduce((sum, room) => sum + room.total_beds, 0);
  const occupiedBeds = rooms.reduce(
    (sum, room) => sum + room.occupied_beds,
    0
  );
  const vacantBeds = rooms.reduce((sum, room) => sum + room.vacant_beds, 0);

  const floors = [1, 2, 3, 4];

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl">

        <a
          href="/"
          className="mb-6 inline-block text-sm font-semibold text-indigo-600"
        >
          ← Back to Dashboard
        </a>

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-indigo-600">
              Hostel Management
            </p>

            <h1 className="mt-1 text-4xl font-bold">
              Hostel 1
            </h1>

            <p className="mt-2 text-slate-500">
              4 floors · 28 rooms · {totalBeds} beds
            </p>
          </div>

          <button className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white shadow-sm">
            + New Booking
          </button>
        </div>

        <section className="mb-10 grid gap-4 sm:grid-cols-3">
          <StatCard label="Total Beds" value={totalBeds} />
          <StatCard label="Occupied" value={occupiedBeds} />
          <StatCard label="Vacant" value={vacantBeds} green />
        </section>

        <div className="space-y-10">
          {floors.map((floor) => {
            const floorRooms = rooms.filter(
              (room) => room.floor_number === floor
            );

            return (
              <section key={floor}>
                <div className="mb-4">
                  <h2 className="text-2xl font-bold">
                    Floor {floor}
                  </h2>

                  <p className="text-sm text-slate-500">
                    Rooms {floor}01–{floor}07
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {floorRooms.map((room) => (
                    <div
                      key={room.room_number}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-xl font-bold">
                            Room {room.room_number}
                          </h3>

                          <p className="mt-1 text-sm text-slate-500">
                            {room.sharing_type} Sharing
                          </p>
                        </div>

                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                          {room.vacant_beds} vacant
                        </span>
                      </div>

                      <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                        <RoomStat
                          value={room.total_beds}
                          label="Beds"
                        />

                        <RoomStat
                          value={room.occupied_beds}
                          label="Occupied"
                        />

                        <RoomStat
                          value={room.vacant_beds}
                          label="Vacant"
                          green
                        />
                      </div>

                      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                        <div>
                          <p className="text-xs text-slate-400">
                            Monthly Fee
                          </p>

                          <p className="text-lg font-bold">
                            Rs. {Number(room.monthly_rent).toLocaleString("en-IN")}
                          </p>
                        </div>
                        <a
  href={`/hostel-1/room/${room.room_number}`}
  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold transition hover:bg-slate-50"
>
  View Beds →
</a>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
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
      <p className="text-sm text-slate-500">{label}</p>

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

function RoomStat({
  value,
  label,
  green = false,
}: {
  value: number;
  label: string;
  green?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-3 ${
        green ? "bg-emerald-50" : "bg-slate-50"
      }`}
    >
      <p
        className={`text-lg font-bold ${
          green ? "text-emerald-600" : ""
        }`}
      >
        {value}
      </p>

      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
