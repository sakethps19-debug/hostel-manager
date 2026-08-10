import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import { getHostelList } from "@/lib/hostel";
import { deriveBedStatus } from "@/lib/bedStatus";

type RoomRow = {
  room_number: string;
  monthly_rent: number;
};

type ResidentRow = {
  hostel_name: string;
  room_number: string;
  monthly_rent: number;
  outstanding_rent: number;
  booking_status: string;
};

type BedGridRow = {
  bed_id: number;
  room_number: string;
  monthly_rent: number;
  bed_status: string;
  occupant_name: string | null;
  notice_given_at: string | null;
  is_future_booking: boolean;
};

function formatMoney(value: number) {
  return `Rs. ${Math.round(value).toLocaleString("en-IN")}`;
}

async function getHostelRooms(hostelName: string): Promise<RoomRow[]> {
  return callRpcServer<RoomRow[]>("get_hostel_rooms", {
    p_hostel_name: hostelName,
  });
}

async function getHostelBedGrid(hostelName: string): Promise<BedGridRow[]> {
  return callRpcServer<BedGridRow[]>("get_hostel_bed_grid", {
    p_hostel_name: hostelName,
  });
}

export default async function HostelComparisonPage() {
  await requirePermission("viewFinancialReports");

  const [hostels, residents] = await Promise.all([
    getHostelList(),
    callRpcServer<ResidentRow[]>("get_resident_master_list"),
  ]);

  const activeResidents = residents.filter(
    (r) => r.booking_status === "confirmed" || r.booking_status === "checked_in"
  );

  const rows = await Promise.all(
    hostels.map(async (hostel) => {
      const [rooms, bedGrid] = await Promise.all([
        getHostelRooms(hostel.hostel_name),
        getHostelBedGrid(hostel.hostel_name),
      ]);

      const roomRate = new Map(rooms.map((r) => [r.room_number, Number(r.monthly_rent)]));

      const hostelResidents = activeResidents.filter(
        (r) => r.hostel_name === hostel.hostel_name
      );

      const avgAgreedRent =
        hostelResidents.length > 0
          ? hostelResidents.reduce((sum, r) => sum + Number(r.monthly_rent), 0) /
            hostelResidents.length
          : 0;

      const avgStandardRate =
        hostelResidents.length > 0
          ? hostelResidents.reduce(
              (sum, r) => sum + (roomRate.get(r.room_number) || 0),
              0
            ) / hostelResidents.length
          : 0;

      const discountValue = hostelResidents.reduce((sum, r) => {
        const standard = roomRate.get(r.room_number) || 0;
        const gap = standard - Number(r.monthly_rent);
        return sum + (gap > 0 ? gap : 0);
      }, 0);

      const outstanding = hostelResidents.reduce(
        (sum, r) => sum + Number(r.outstanding_rent || 0),
        0
      );

      const vacantBeds = bedGrid.filter(
        (b) => deriveBedStatus(b) === "available"
      );

      const dailyVacancyLoss = vacantBeds.reduce(
        (sum, b) => sum + Number(b.monthly_rent || 0) / 30,
        0
      );

      const occupancyPercent =
        Number(hostel.total_beds) === 0
          ? 0
          : Math.round(
              (Number(hostel.occupied_beds) / Number(hostel.total_beds)) * 1000
            ) / 10;

      return {
        hostelName: hostel.hostel_name,
        totalBeds: Number(hostel.total_beds),
        occupiedBeds: Number(hostel.occupied_beds),
        vacantBeds: Number(hostel.vacant_beds),
        occupancyPercent,
        avgStandardRate,
        avgAgreedRent,
        discountValue,
        outstanding,
        dailyVacancyLoss,
        monthlyVacancyLoss: dailyVacancyLoss * 30,
      };
    })
  );

  const consolidated = rows.reduce(
    (acc, r) => ({
      totalBeds: acc.totalBeds + r.totalBeds,
      occupiedBeds: acc.occupiedBeds + r.occupiedBeds,
      vacantBeds: acc.vacantBeds + r.vacantBeds,
      discountValue: acc.discountValue + r.discountValue,
      outstanding: acc.outstanding + r.outstanding,
      dailyVacancyLoss: acc.dailyVacancyLoss + r.dailyVacancyLoss,
      monthlyVacancyLoss: acc.monthlyVacancyLoss + r.monthlyVacancyLoss,
    }),
    {
      totalBeds: 0,
      occupiedBeds: 0,
      vacantBeds: 0,
      discountValue: 0,
      outstanding: 0,
      dailyVacancyLoss: 0,
      monthlyVacancyLoss: 0,
    }
  );

  const consolidatedOccupancy =
    consolidated.totalBeds === 0
      ? 0
      : Math.round((consolidated.occupiedBeds / consolidated.totalBeds) * 1000) / 10;

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
            Owner Insights
          </p>
          <h1 className="mt-2 text-4xl font-bold">Hostel Comparison</h1>
          <p className="mt-2 text-slate-500">
            Side-by-side comparison of Hostel A/B/C. Rent Collected and
            Maintenance/Operating Expense breakdowns by hostel aren&apos;t
            available yet — see the note below.
          </p>
        </div>

        <section className="mt-8 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-4">Hostel</th>
                <th className="px-6 py-4 text-right">Occupancy %</th>
                <th className="px-6 py-4 text-right">Occupied</th>
                <th className="px-6 py-4 text-right">Vacant</th>
                <th className="px-6 py-4 text-right">Avg Standard Rate</th>
                <th className="px-6 py-4 text-right">Avg Agreed Rent</th>
                <th className="px-6 py-4 text-right">Discount Value</th>
                <th className="px-6 py-4 text-right">Outstanding</th>
                <th className="px-6 py-4 text-right">Vacancy Loss / Month</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.hostelName} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-semibold">{r.hostelName}</td>
                  <td className="px-6 py-4 text-right">{r.occupancyPercent}%</td>
                  <td className="px-6 py-4 text-right">{r.occupiedBeds}</td>
                  <td className="px-6 py-4 text-right">{r.vacantBeds}</td>
                  <td className="px-6 py-4 text-right">{formatMoney(r.avgStandardRate)}</td>
                  <td className="px-6 py-4 text-right">{formatMoney(r.avgAgreedRent)}</td>
                  <td className="px-6 py-4 text-right text-amber-700">
                    {formatMoney(r.discountValue)}
                  </td>
                  <td className="px-6 py-4 text-right text-red-700">
                    {formatMoney(r.outstanding)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {formatMoney(r.monthlyVacancyLoss)}
                  </td>
                </tr>
              ))}

              <tr className="bg-slate-50 font-bold">
                <td className="px-6 py-4">Consolidated</td>
                <td className="px-6 py-4 text-right">{consolidatedOccupancy}%</td>
                <td className="px-6 py-4 text-right">{consolidated.occupiedBeds}</td>
                <td className="px-6 py-4 text-right">{consolidated.vacantBeds}</td>
                <td className="px-6 py-4 text-right">-</td>
                <td className="px-6 py-4 text-right">-</td>
                <td className="px-6 py-4 text-right text-amber-700">
                  {formatMoney(consolidated.discountValue)}
                </td>
                <td className="px-6 py-4 text-right text-red-700">
                  {formatMoney(consolidated.outstanding)}
                </td>
                <td className="px-6 py-4 text-right">
                  {formatMoney(consolidated.monthlyVacancyLoss)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <p className="mt-4 text-xs text-slate-400">
          Vacancy Loss estimates lost potential revenue from currently
          available beds at the room&apos;s standard rate — it excludes beds
          under maintenance, cleaning, or hold, and is a management/occupancy
          metric, not an accounting expense. Maintenance Cost, Operating
          Expense, and Net Operating Surplus per hostel require an
          expense-by-hostel breakdown not yet available from the existing
          expense records and are intentionally left out rather than guessed.
        </p>
      </div>
    </main>
  );
}
