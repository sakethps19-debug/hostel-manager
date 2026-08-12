import { getHostelList } from "@/lib/hostel";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import { deriveBedStatus } from "@/lib/bedStatus";
import { formatMoney } from "@/lib/format";

type BedGridRow = {
  room_number: string;
  floor_number: number;
  floor_name: string | null;
  monthly_rent: number;
  bed_status: string;
  occupant_name: string | null;
  notice_given_at: string | null;
  is_future_booking: boolean;
};

type ResidentRow = {
  hostel_name: string;
  room_number: string;
  monthly_rent: number;
  booking_status: string;
};

type VacancyRow = {
  hostel_name: string;
  floor_number: number;
};

type PageProps = {
  searchParams: Promise<{ hostel?: string }>;
};

export default async function FloorPerformancePage({ searchParams }: PageProps) {
  await requirePermission("manageOperationalRecords");

  const { hostel: hostelParam } = await searchParams;

  const hostels = await getHostelList();
  const selectedHostel = hostelParam || hostels[0]?.hostel_name || "";

  const [bedGrid, residents, vacancies] = await Promise.all([
    callRpcServer<BedGridRow[]>("get_hostel_bed_grid", {
      p_hostel_name: selectedHostel,
    }),
    callRpcServer<ResidentRow[]>("get_resident_master_list"),
    callRpcServer<VacancyRow[]>("get_upcoming_vacancies", { p_days: 30 }),
  ]);

  const roomToFloor = new Map(
    bedGrid.map((b) => [b.room_number, { floorNumber: b.floor_number, floorName: b.floor_name }])
  );

  const activeResidents = residents.filter(
    (r) =>
      r.hostel_name === selectedHostel &&
      (r.booking_status === "confirmed" || r.booking_status === "checked_in")
  );

  const floorNumbers = Array.from(new Set(bedGrid.map((b) => b.floor_number))).sort(
    (a, b) => a - b
  );

  const rows = floorNumbers.map((floorNumber) => {
    const floorBeds = bedGrid.filter((b) => b.floor_number === floorNumber);
    const floorName = floorBeds[0]?.floor_name || `Floor ${floorNumber}`;

    const statuses = floorBeds.map((b) => deriveBedStatus(b));
    const occupied = statuses.filter(
      (s) => s === "occupied" || s === "vacating_soon"
    ).length;
    const available = statuses.filter((s) => s === "available").length;
    const maintenance = statuses.filter((s) => s === "maintenance").length;

    const occupancyPercent =
      floorBeds.length === 0 ? 0 : Math.round((occupied / floorBeds.length) * 1000) / 10;

    const floorResidents = activeResidents.filter(
      (r) => roomToFloor.get(r.room_number)?.floorNumber === floorNumber
    );

    const avgAgreedRent =
      floorResidents.length > 0
        ? Math.round(
            floorResidents.reduce((sum, r) => sum + Number(r.monthly_rent), 0) /
              floorResidents.length
          )
        : 0;

    const vacantBeds = floorBeds.filter((b) => deriveBedStatus(b) === "available");
    const monthlyVacancyLoss = vacantBeds.reduce(
      (sum, b) => sum + Number(b.monthly_rent || 0),
      0
    );

    const upcomingVacancies = vacancies.filter(
      (v) => v.hostel_name === selectedHostel && v.floor_number === floorNumber
    ).length;

    return {
      floorNumber,
      floorName,
      totalBeds: floorBeds.length,
      occupancyPercent,
      available,
      upcomingVacancies,
      maintenance,
      avgAgreedRent,
      monthlyVacancyLoss,
    };
  });

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <a
          href="/"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Dashboard
        </a>

        <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              Hostel Management
            </p>
            <h1 className="mt-2 text-4xl font-bold">Floor Performance</h1>
            <p className="mt-2 text-slate-500">
              Compare floors within a hostel to spot chronic vacancy or
              maintenance issues.
            </p>
          </div>

          <div className="flex gap-2">
            {hostels.map((h) => (
              <a
                key={h.hostel_name}
                href={`/reports/floor-performance?hostel=${encodeURIComponent(h.hostel_name)}`}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
                  h.hostel_name === selectedHostel
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {h.hostel_name}
              </a>
            ))}
          </div>
        </div>

        <section className="mt-8 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-4">Floor</th>
                <th className="px-6 py-4 text-right">Occupancy %</th>
                <th className="px-6 py-4 text-right">Available Beds</th>
                <th className="px-6 py-4 text-right">Upcoming Vacancies</th>
                <th className="px-6 py-4 text-right">Maintenance</th>
                <th className="px-6 py-4 text-right">Avg Agreed Rent</th>
                <th className="px-6 py-4 text-right">Vacancy Loss / Month</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.floorNumber} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-semibold">{r.floorName}</td>
                  <td className="px-6 py-4 text-right">{r.occupancyPercent}%</td>
                  <td className="px-6 py-4 text-right">{r.available}</td>
                  <td className="px-6 py-4 text-right">{r.upcomingVacancies}</td>
                  <td className="px-6 py-4 text-right">{r.maintenance}</td>
                  <td className="px-6 py-4 text-right">{formatMoney(r.avgAgreedRent)}</td>
                  <td className="px-6 py-4 text-right">
                    {formatMoney(r.monthlyVacancyLoss)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
