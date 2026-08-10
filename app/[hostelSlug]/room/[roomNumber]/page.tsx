import { notFound } from "next/navigation";
import { resolveHostelName } from "@/lib/hostel";
import { deriveBedStatus, getBedStatusInfo } from "@/lib/bedStatus";
import BedStatusIcon from "@/components/BedStatusIcon";
import OccupancyLegend from "@/components/OccupancyLegend";
import StatCard from "@/components/StatCard";
import { callRpcServer } from "@/lib/supabase/callRpcServer";

type BedRow = {
  bed_id: number;
  bed_number: string;
  bed_code: string | null;
  bed_status: string;
  occupant_name: string | null;
  booking_start: string | null;
  booking_end: string | null;
  monthly_rent: number | null;
  notice_given_at: string | null;
  expected_vacate_date: string | null;
  is_future_booking: boolean;
  future_start_date: string | null;
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
  return callRpcServer<RoomRow[]>("get_hostel_rooms", {
    p_hostel_name: hostelName,
  });
}

async function getRoomBeds(
  hostelName: string,
  roomNumber: string
): Promise<BedRow[]> {
  return callRpcServer<BedRow[]>("get_room_beds", {
    p_hostel_name: hostelName,
    p_room_number: roomNumber,
  });
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

  const statusCounts = {
    available: 0,
    occupied: 0,
    vacating_soon: 0,
    reserved: 0,
    maintenance: 0,
  };

  for (const bed of beds) {
    const status = deriveBedStatus({
      occupant_name: bed.occupant_name,
      notice_given_at: bed.notice_given_at,
      is_future_booking: bed.is_future_booking,
      bed_status: bed.bed_status,
    });
    statusCounts[status] += 1;
  }

  const occupied = statusCounts.occupied + statusCounts.vacating_soon;
  const vacant = statusCounts.available;

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

        <section className="mt-10 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total Beds" value={beds.length} />
          <StatCard label="Occupied" value={occupied} />
          <StatCard label="Vacant" value={vacant} green />
          <StatCard label="Vacating Soon" value={statusCounts.vacating_soon} />
          <StatCard label="Reserved" value={statusCounts.reserved} />
          <StatCard label="Maintenance" value={statusCounts.maintenance} />
        </section>

        <section id="beds" className="mt-10 scroll-mt-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">
                Beds
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Individual bed availability and resident details.
              </p>
            </div>

            <OccupancyLegend />
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {beds.map((bed) => {
              const isOccupied = bed.occupant_name !== null;
              const status = deriveBedStatus({
                occupant_name: bed.occupant_name,
                notice_given_at: bed.notice_given_at,
                is_future_booking: bed.is_future_booking,
                bed_status: bed.bed_status,
              });
              const info = getBedStatusInfo(status);

              return (
                <div
                  key={bed.bed_id}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <BedStatusIcon status={status} />

                      <div>
                        <p className="text-xs font-medium text-slate-400">
                          BED ID
                        </p>

                        <h3 className="text-xl font-bold">
                          {bed.bed_code || bed.bed_number}
                        </h3>
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${info.badgeClasses}`}
                    >
                      {info.label}
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
                    ) : status === "maintenance" ? (
                      <p className="text-sm text-slate-500">
                        This bed is currently under maintenance and not
                        available for booking.
                      </p>
                    ) : status === "reserved" ? (
                      <>
                        <p className="text-sm text-slate-500">
                          Reserved for a booking starting{" "}
                          {bed.future_start_date
                            ? formatDate(bed.future_start_date)
                            : "soon"}
                          .
                        </p>

                        <p className="mt-4 text-lg font-bold">
                          {Number(room.monthly_rent) > 0
                            ? `Rs. ${Number(room.monthly_rent).toLocaleString("en-IN")}`
                            : "Rate not set"}
                        </p>
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
                  ) : status === "maintenance" ? (
                    <a
                      href={`/${hostelSlug}/room/${roomNumber}/bed/${bed.bed_id}/maintenance`}
                      className="mt-6 block w-full rounded-xl bg-slate-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-slate-700"
                    >
                      View Maintenance
                    </a>
                  ) : status === "reserved" ? (
                    <a
                      href={`/${hostelSlug}/room/${roomNumber}/bed/${bed.bed_id}/reservation`}
                      className="mt-6 block w-full rounded-xl border border-blue-200 bg-white px-4 py-3 text-center text-sm font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      View Reservation
                    </a>
                  ) : (
                    <>
                      <a
                        href={`/${hostelSlug}/room/${roomNumber}/book/${bed.bed_id}`}
                        className="mt-6 block w-full rounded-xl bg-indigo-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-indigo-700"
                      >
                        Book This Bed
                      </a>

                      <a
                        href={`/${hostelSlug}/room/${roomNumber}/bed/${bed.bed_id}/maintenance`}
                        className="mt-2 block w-full rounded-xl border border-slate-200 px-4 py-2 text-center text-xs font-semibold text-slate-500 hover:bg-slate-50"
                      >
                        Mark for Maintenance
                      </a>
                    </>
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
