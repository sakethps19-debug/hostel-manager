import { notFound } from "next/navigation";
import { resolveHostelName } from "@/lib/hostel";
import { deriveBedStatus } from "@/lib/bedStatus";
import OccupancyProgressBar from "@/components/OccupancyProgressBar";
import OccupancyLegend from "@/components/OccupancyLegend";
import RoomOccupancyCard from "@/components/RoomOccupancyCard";
import { callRpcServer } from "@/lib/supabase/callRpcServer";

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
  params: Promise<{ hostelSlug: string; floorNumber: string }>;
};

async function getHostelBedGrid(hostelName: string): Promise<BedGridRow[]> {
  return callRpcServer<BedGridRow[]>("get_hostel_bed_grid", {
    p_hostel_name: hostelName,
  });
}

export default async function FloorPage({ params }: PageProps) {
  const { hostelSlug, floorNumber } = await params;

  const hostelName = await resolveHostelName(hostelSlug);

  if (!hostelName) {
    notFound();
  }

  const floorNum = Number(floorNumber);

  if (!Number.isInteger(floorNum)) {
    notFound();
  }

  const beds = await getHostelBedGrid(hostelName);
  const floorBeds = beds.filter((b) => b.floor_number === floorNum);

  if (floorBeds.length === 0) {
    notFound();
  }

  const floorName = floorBeds[0]?.floor_name || `Floor ${floorNum}`;

  const rooms = Array.from(
    new Map(
      floorBeds.map((bed) => [
        bed.room_number,
        {
          roomNumber: bed.room_number,
          sharingType: bed.sharing_type,
          monthlyRent: bed.monthly_rent,
        },
      ])
    ).values()
  );

  const totalBeds = floorBeds.length;

  const statusCounts = {
    available: 0,
    occupied: 0,
    vacating_soon: 0,
    reserved: 0,
    maintenance: 0,
  };

  for (const bed of floorBeds) {
    statusCounts[deriveBedStatus(bed)] += 1;
  }

  const occupiedTotal = statusCounts.occupied + statusCounts.vacating_soon;
  const occupancy =
    totalBeds === 0 ? 0 : Math.round((occupiedTotal / totalBeds) * 1000) / 10;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <a
          href={`/${hostelSlug}`}
          className="mb-6 inline-block text-sm font-semibold text-indigo-600"
        >
          ← Back to {hostelName}
        </a>

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-indigo-600">
              {hostelName}
            </p>

            <h1 className="mt-1 text-4xl font-bold">{floorName}</h1>

            <p className="mt-2 text-slate-500">
              {rooms.length} room{rooms.length === 1 ? "" : "s"} ·{" "}
              {totalBeds} beds
            </p>
          </div>
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

        <div className="mb-5">
          <h2 className="text-xl font-bold">Select a Room</h2>
          <p className="mt-1 text-sm text-slate-500">
            Choose a room to view and manage its beds.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rooms.map((room) => {
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
