import { notFound } from "next/navigation";
import { resolveHostelName } from "@/lib/hostel";
import { deriveBedStatus } from "@/lib/bedStatus";
import OccupancyProgressBar from "@/components/OccupancyProgressBar";
import OccupancyLegend from "@/components/OccupancyLegend";
import RoomOccupancyCard from "@/components/RoomOccupancyCard";

type BedGridRow = {
  bed_id: number;
  bed_code: string | null;
  bed_number: string;
  room_number: string;
  floor_number: number;
  floor_name: string | null;
  sharing_type: number;
  monthly_rent: number;
  bed_status: string;
  occupant_name: string | null;
  notice_given_at: string | null;
  is_future_booking: boolean;
};

type PageProps = {
  params: Promise<{ hostelSlug: string }>;
};

async function getHostelBedGrid(hostelName: string): Promise<BedGridRow[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/get_hostel_bed_grid`,
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
    throw new Error(`Unable to load ${hostelName}: ${errorText}`);
  }

  return response.json();
}

export default async function HostelPage({ params }: PageProps) {
  const { hostelSlug } = await params;

  const hostelName = await resolveHostelName(hostelSlug);

  if (!hostelName) {
    notFound();
  }

  const beds = await getHostelBedGrid(hostelName);

  const totalBeds = beds.length;

  const statusCounts = {
    available: 0,
    occupied: 0,
    vacating_soon: 0,
    reserved: 0,
    maintenance: 0,
  };

  for (const bed of beds) {
    const status = deriveBedStatus(bed);
    statusCounts[status] += 1;
  }

  const occupiedTotal = statusCounts.occupied + statusCounts.vacating_soon;
  const occupancy =
    totalBeds === 0 ? 0 : Math.round((occupiedTotal / totalBeds) * 1000) / 10;

  const floors = Array.from(
    new Set(beds.map((bed) => bed.floor_number))
  ).sort((a, b) => a - b);

  const rooms = Array.from(
    new Map(
      beds.map((bed) => [
        `${bed.floor_number}|${bed.room_number}`,
        {
          floorNumber: bed.floor_number,
          roomNumber: bed.room_number,
          sharingType: bed.sharing_type,
          monthlyRent: bed.monthly_rent,
        },
      ])
    ).values()
  );

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
              {hostelName}
            </h1>

            <p className="mt-2 text-slate-500">
              {floors.length} floor{floors.length === 1 ? "" : "s"} ·{" "}
              {rooms.length} room{rooms.length === 1 ? "" : "s"} ·{" "}
              {totalBeds} beds
            </p>
          </div>

          <a
            href="#floors"
            className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white shadow-sm"
          >
            + New Booking
          </a>
        </div>

        <section className="mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Total Beds" value={totalBeds} />
            <StatCard label="Occupied" value={statusCounts.occupied} />
            <StatCard label="Available" value={statusCounts.available} green />
            <StatCard label="Vacating Soon" value={statusCounts.vacating_soon} />
            <StatCard label="Reserved" value={statusCounts.reserved} />
            <StatCard label="Maintenance" value={statusCounts.maintenance} />
          </div>

          <div className="mt-5">
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-slate-500">Occupancy</span>
              <span className="font-semibold">{occupancy}%</span>
            </div>
            <OccupancyProgressBar percent={occupancy} />
          </div>

          <div className="mt-5">
            <OccupancyLegend />
          </div>
        </section>

        <div id="floors" className="space-y-10 scroll-mt-6">
          {floors.map((floor) => {
            const floorBeds = beds.filter((b) => b.floor_number === floor);
            const floorRooms = rooms.filter((r) => r.floorNumber === floor);
            const floorName = floorBeds[0]?.floor_name || `Floor ${floor}`;

            return (
              <section key={floor}>
                <div className="mb-4">
                  <h2 className="text-2xl font-bold">{floorName}</h2>

                  <p className="text-sm text-slate-500">
                    {floorRooms.length} room
                    {floorRooms.length === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {floorRooms.map((room) => {
                    const roomBeds = floorBeds
                      .filter((b) => b.room_number === room.roomNumber)
                      .map((b) => ({
                        bedId: b.bed_id,
                        status: deriveBedStatus(b),
                      }));

                    return (
                      <RoomOccupancyCard
                        key={room.roomNumber}
                        roomNumber={room.roomNumber}
                        sharingType={room.sharingType}
                        monthlyRent={room.monthlyRent}
                        beds={roomBeds}
                        href={`/${hostelSlug}/room/${room.roomNumber}`}
                      />
                    );
                  })}
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
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs text-slate-500">{label}</p>

      <p
        className={`mt-1 text-2xl font-bold ${
          green ? "text-emerald-600" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
