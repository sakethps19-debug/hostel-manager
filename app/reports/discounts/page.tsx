import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import { getHostelList } from "@/lib/hostel";
import StatCard from "@/components/StatCard";

type ResidentRow = {
  resident_id: number;
  booking_id: number;
  full_name: string;
  hostel_name: string;
  room_number: string;
  bed_code: string | null;
  monthly_rent: number;
  booking_status: string;
};

type RoomRow = {
  room_number: string;
  sharing_type: number;
  monthly_rent: number;
};

type DiscountedResident = {
  bookingId: number;
  fullName: string;
  hostelName: string;
  roomNumber: string;
  bedCode: string | null;
  standardRate: number;
  agreedRent: number;
  discount: number;
  discountPercent: number;
};

function formatMoney(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

async function getResidents(): Promise<ResidentRow[]> {
  return callRpcServer<ResidentRow[]>("get_resident_master_list");
}

async function getHostelRooms(hostelName: string): Promise<RoomRow[]> {
  return callRpcServer<RoomRow[]>("get_hostel_rooms", {
    p_hostel_name: hostelName,
  });
}

export default async function DiscountAnalyticsPage() {
  await requirePermission("manageRates");

  const [hostels, residents] = await Promise.all([
    getHostelList(),
    getResidents(),
  ]);

  const roomsByHostel = new Map(
    await Promise.all(
      hostels.map(
        async (h) => [h.hostel_name, await getHostelRooms(h.hostel_name)] as const
      )
    )
  );

  const active = residents.filter(
    (r) => r.booking_status === "confirmed" || r.booking_status === "checked_in"
  );

  const discounted: DiscountedResident[] = [];

  for (const resident of active) {
    const rooms = roomsByHostel.get(resident.hostel_name) || [];
    const room = rooms.find((r) => r.room_number === resident.room_number);
    const standardRate = Number(room?.monthly_rent || 0);
    const agreedRent = Number(resident.monthly_rent || 0);

    if (standardRate <= 0) continue;

    const discount = standardRate - agreedRent;

    discounted.push({
      bookingId: resident.booking_id,
      fullName: resident.full_name,
      hostelName: resident.hostel_name,
      roomNumber: resident.room_number,
      bedCode: resident.bed_code,
      standardRate,
      agreedRent,
      discount,
      discountPercent: standardRate > 0 ? (discount / standardRate) * 100 : 0,
    });
  }

  const withKnownRate = discounted.length;
  const onDiscount = discounted.filter((d) => d.discount > 0);

  const totalMonthlyDiscount = onDiscount.reduce((sum, d) => sum + d.discount, 0);
  const avgDiscount =
    onDiscount.length > 0 ? totalMonthlyDiscount / onDiscount.length : 0;
  const avgDiscountPercent =
    onDiscount.length > 0
      ? onDiscount.reduce((sum, d) => sum + d.discountPercent, 0) / onDiscount.length
      : 0;
  const avgStandardRate =
    withKnownRate > 0
      ? discounted.reduce((sum, d) => sum + d.standardRate, 0) / withKnownRate
      : 0;
  const avgAgreedRent =
    withKnownRate > 0
      ? discounted.reduce((sum, d) => sum + d.agreedRent, 0) / withKnownRate
      : 0;
  const effectiveRealizedRate =
    avgStandardRate > 0 ? (avgAgreedRent / avgStandardRate) * 100 : 0;

  const sortedDiscounted = [...onDiscount].sort((a, b) => b.discount - a.discount);

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
          <h1 className="mt-2 text-4xl font-bold">Discount Analytics</h1>
          <p className="mt-2 text-slate-500">
            Gap between standard room rates and each resident&apos;s agreed
            rent. Historical agreed rents are never modified by this report.
          </p>
        </div>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Monthly Discount" value={totalMonthlyDiscount} />
          <StatCard label="Residents on Discounted Rent" value={onDiscount.length} />
          <StatCard label="Average Discount" value={Math.round(avgDiscount)} />
          <StatCard label="Average Discount %" value={Math.round(avgDiscountPercent)} />
        </section>

        <section className="mt-4 grid gap-4 sm:grid-cols-3">
          <StatCard label="Average Standard Rate" value={Math.round(avgStandardRate)} />
          <StatCard label="Average Agreed Rent" value={Math.round(avgAgreedRent)} />
          <StatCard label="Effective Realized Rate %" value={Math.round(effectiveRealizedRate)} />
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {sortedDiscounted.length === 0 ? (
            <div className="px-6 py-16 text-center text-slate-500">
              No residents are currently below the standard rate for their room.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Resident</th>
                    <th className="px-6 py-4">Location</th>
                    <th className="px-6 py-4 text-right">Standard Rate</th>
                    <th className="px-6 py-4 text-right">Agreed Rent</th>
                    <th className="px-6 py-4 text-right">Monthly Discount</th>
                    <th className="px-6 py-4 text-right">Discount %</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {sortedDiscounted.map((d) => (
                    <tr key={d.bookingId} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-semibold">{d.fullName}</td>
                      <td className="px-6 py-4">
                        {d.hostelName} · Room {d.roomNumber}
                        {d.bedCode ? ` · ${d.bedCode}` : ""}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {formatMoney(d.standardRate)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {formatMoney(d.agreedRent)}
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-amber-700">
                        {formatMoney(d.discount)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {d.discountPercent.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
