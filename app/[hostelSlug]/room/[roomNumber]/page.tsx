import { notFound } from "next/navigation";
import { resolveHostelName } from "@/lib/hostel";

type BedRow = {
  bed_id: number;
  bed_number: string;
  bed_status: string;
  occupant_name: string | null;
  booking_start: string | null;
  booking_end: string | null;
  monthly_rent: number | null;
};

type RoomRow = {
  floor_number: number;
  floor_name: string | null;
  room_number: string;
  sharing_type: number;
  monthly_rent: number;
  total_beds: number;
  occupied_beds: number;
  vacant_beds: number;
};

type PageProps = {
  params: Promise<{
    hostelSlug: string;
    roomNumber: string;
  }>;
};

async function getHostelRooms(hostelName: string): Promise<RoomRow[]> {
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
      body: JSON.stringify({ p_hostel_name: hostelName }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Unable to load rooms: ${errorText}`);
  }

  return response.json();
}

async function getRoomBeds(
  hostelName: string,
  roomNumber: string
): Promise<BedRow[]> {
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
        p_hostel_name: hostelName,
        p_room_number: roomNumber,
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

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function RoomPage({ params }: PageProps) {
  const { hostelSlug, roomNumber } = await params;

  const hostelName = await resolveHostelName(hostelSlug);

  if (!hostelName) {
    notFound();
  }

  const rooms = await getHostelRooms(hostelName);
  const room = rooms.find((r) => r.room_number === roomNumber);

  if (!room) {
    notFound();
  }

  const beds = await getRoomBeds(hostelName, roomNumber);

  const occupied = beds.filter(
    (bed) => bed.occupant_name !== null
  ).length;

  const vacant = beds.length - occupied;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">

        <a
          href={`/${hostelSlug}`}
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to {hostelName}
        </a>

        <div className="mt-7 flex items-end justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              {hostelName} · {room.floor_name || `Floor ${room.floor_number}`}
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              Room {roomNumber}
            </h1>

            <p className="mt-2 text-slate-500">
              {room.sharing_type} Sharing
              {Number(room.monthly_rent) > 0
                ? ` · Rs. ${Number(room.monthly_rent).toLocaleString("en-IN")} per bed / month`
                : " · Rate not set"}
            </p>
          </div>

          <a
            href="#beds"
            className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            + New Booking
          </a>
        </div>

        <section className="mt-10 grid gap-4 sm:grid-cols-3">
          <StatCard label="Total Beds" value={beds.length} />
          <StatCard label="Occupied" value={occupied} />
          <StatCard label="Vacant" value={vacant} green />
        </section>

        <section id="beds" className="mt-10 scroll-mt-6">
          <h2 className="text-2xl font-bold">
            Beds
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Individual bed availability and resident details.
          </p>

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
                              {bed.booking_start
                                ? formatDate(bed.booking_start)
                                : "-"}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-slate-400">
                              Until
                            </p>
                            <p className="mt-1">
                              {bed.booking_end
                                ? formatDate(bed.booking_end)
                                : "-"}
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
                          {Number(room.monthly_rent) > 0
                            ? `Rs. ${Number(room.monthly_rent).toLocaleString("en-IN")}`
                            : "Rate not set"}
                        </p>

                        {Number(room.monthly_rent) > 0 && (
                          <p className="text-xs text-slate-400">
                            per month
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  {isOccupied ? (
                    <a
                      href={`/${hostelSlug}/room/${roomNumber}/resident/${bed.bed_id}`}
                      className="mt-6 block w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold transition hover:bg-slate-50"
                    >
                      View Resident
                    </a>
                  ) : (
                    <a
                      href={`/${hostelSlug}/room/${roomNumber}/book/${bed.bed_id}`}
                      className="mt-6 block w-full rounded-xl bg-indigo-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                      Book This Bed
                    </a>
                  )}
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
