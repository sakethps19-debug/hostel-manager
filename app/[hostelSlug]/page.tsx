import { notFound } from "next/navigation";
import { resolveHostelName } from "@/lib/hostel";
import { deriveBedStatus } from "@/lib/bedStatus";
import OccupancyProgressBar from "@/components/OccupancyProgressBar";
import OccupancyLegend from "@/components/OccupancyLegend";
import StatTile from "@/components/StatTile";
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
  params: Promise<{ hostelSlug: string }>;
};

async function getHostelBedGrid(hostelName: string): Promise<BedGridRow[]> {
  return callRpcServer<BedGridRow[]>("get_hostel_bed_grid", {
    p_hostel_name: hostelName,
  });
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

  const floorNumbers = Array.from(
    new Set(beds.map((bed) => bed.floor_number))
  ).sort((a, b) => a - b);

  const rooms = Array.from(
    new Map(
      beds.map((bed) => [
        `${bed.floor_number}|${bed.room_number}`,
        {
          floorNumber: bed.floor_number,
          roomNumber: bed.room_number,
        },
      ])
    ).values()
  );

  const floors = floorNumbers.map((floorNumber) => {
    const floorBeds = beds.filter((b) => b.floor_number === floorNumber);
    const floorRooms = rooms.filter((r) => r.floorNumber === floorNumber);
    const floorName = floorBeds[0]?.floor_name || `Floor ${floorNumber}`;

    const counts = {
      available: 0,
      occupied: 0,
      vacating_soon: 0,
      reserved: 0,
      maintenance: 0,
    };

    for (const bed of floorBeds) {
      counts[deriveBedStatus(bed)] += 1;
    }

    const floorOccupiedTotal = counts.occupied + counts.vacating_soon;
    const floorOccupancy =
      floorBeds.length === 0
        ? 0
        : Math.round((floorOccupiedTotal / floorBeds.length) * 1000) / 10;

    return {
      floorNumber,
      floorName,
      roomCount: floorRooms.length,
      bedCount: floorBeds.length,
      counts,
      occupancy: floorOccupancy,
    };
  });

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
        </div>

        <section className="mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Total Beds" value={totalBeds} />
            <StatTile label="Occupied" value={statusCounts.occupied} />
            <StatTile label="Available" value={statusCounts.available} green />
            <StatTile label="Vacating Soon" value={statusCounts.vacating_soon} />
            <StatTile label="Reserved" value={statusCounts.reserved} />
            <StatTile label="Maintenance" value={statusCounts.maintenance} />
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
          <h2 className="text-xl font-bold">Select a Floor</h2>
          <p className="mt-1 text-sm text-slate-500">
            Choose a floor to see its rooms and beds.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {floors.map((floor) => (
            <a
              key={floor.floorNumber}
              href={`/${hostelSlug}/floor/${floor.floorNumber}`}
              className="block rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold">{floor.floorName}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {floor.roomCount} room{floor.roomCount === 1 ? "" : "s"} ·{" "}
                    {floor.bedCount} bed{floor.bedCount === 1 ? "" : "s"}
                  </p>
                </div>

                <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                  {floor.counts.available} vacant
                </span>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-slate-500">Occupancy</span>
                  <span className="font-semibold">{floor.occupancy}%</span>
                </div>
                <OccupancyProgressBar percent={floor.occupancy} />
              </div>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}

