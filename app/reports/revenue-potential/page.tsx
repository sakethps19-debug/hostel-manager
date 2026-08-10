import { getHostelList } from "@/lib/hostel";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import { deriveBedStatus } from "@/lib/bedStatus";

type BedGridRow = {
  room_number: string;
  monthly_rent: number;
  bed_status: string;
  occupant_name: string | null;
  notice_given_at: string | null;
  is_future_booking: boolean;
};

type ResidentRow = {
  hostel_name: string;
  monthly_rent: number;
  outstanding_rent: number;
  booking_status: string;
};

type RentSummary = {
  rent_collected_this_month: number;
};

function formatMoney(value: number) {
  return `Rs. ${Math.round(value).toLocaleString("en-IN")}`;
}

export default async function RevenuePotentialPage() {
  await requirePermission("viewFinancialReports");

  const [hostels, residents, rentSummaryRows] = await Promise.all([
    getHostelList(),
    callRpcServer<ResidentRow[]>("get_resident_master_list"),
    callRpcServer<RentSummary[]>("get_rent_dashboard_summary"),
  ]);

  const rentSummary = rentSummaryRows.length > 0 ? rentSummaryRows[0] : null;

  const activeResidents = residents.filter(
    (r) => r.booking_status === "confirmed" || r.booking_status === "checked_in"
  );

  const rows = await Promise.all(
    hostels.map(async (hostel) => {
      const bedGrid = await callRpcServer<BedGridRow[]>("get_hostel_bed_grid", {
        p_hostel_name: hostel.hostel_name,
      });

      const potentialRevenue = bedGrid.reduce(
        (sum, b) => sum + Number(b.monthly_rent || 0),
        0
      );

      const vacantBeds = bedGrid.filter((b) => deriveBedStatus(b) === "available");
      const vacancyLoss = vacantBeds.reduce(
        (sum, b) => sum + Number(b.monthly_rent || 0),
        0
      );

      const occupiedAtStandard = potentialRevenue - vacancyLoss;

      const hostelResidents = activeResidents.filter(
        (r) => r.hostel_name === hostel.hostel_name
      );

      const agreedRentRevenue = hostelResidents.reduce(
        (sum, r) => sum + Number(r.monthly_rent),
        0
      );

      const discountImpact = Math.max(occupiedAtStandard - agreedRentRevenue, 0);

      const outstanding = hostelResidents.reduce(
        (sum, r) => sum + Number(r.outstanding_rent || 0),
        0
      );

      return {
        hostelName: hostel.hostel_name,
        potentialRevenue,
        discountImpact,
        agreedRentRevenue,
        outstanding,
        vacancyLoss,
      };
    })
  );

  const consolidated = rows.reduce(
    (acc, r) => ({
      potentialRevenue: acc.potentialRevenue + r.potentialRevenue,
      discountImpact: acc.discountImpact + r.discountImpact,
      agreedRentRevenue: acc.agreedRentRevenue + r.agreedRentRevenue,
      outstanding: acc.outstanding + r.outstanding,
      vacancyLoss: acc.vacancyLoss + r.vacancyLoss,
    }),
    {
      potentialRevenue: 0,
      discountImpact: 0,
      agreedRentRevenue: 0,
      outstanding: 0,
      vacancyLoss: 0,
    }
  );

  const cards = [
    ...rows.map((r) => ({ label: r.hostelName, ...r })),
    {
      label: "Consolidated",
      ...consolidated,
    },
  ];

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
          <h1 className="mt-2 text-4xl font-bold">Revenue Potential vs Actual</h1>
          <p className="mt-2 text-slate-500">
            Current month. Historical month/year selection isn&apos;t available
            yet — this reflects today&apos;s occupancy and agreed rents, not a
            stored monthly record.
          </p>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {cards.map((c) => (
            <div
              key={c.label}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-lg font-bold">{c.label}</h2>

              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Potential Revenue (Standard Rates)</span>
                  <span className="font-semibold">{formatMoney(c.potentialRevenue)}</span>
                </div>

                <div className="flex items-center justify-between text-amber-700">
                  <span>Less: Discount / Negotiation Impact</span>
                  <span className="font-semibold">- {formatMoney(c.discountImpact)}</span>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-3 font-semibold">
                  <span>Agreed Rent Revenue</span>
                  <span>{formatMoney(c.agreedRentRevenue)}</span>
                </div>

                <div className="flex items-center justify-between text-red-700">
                  <span>Outstanding</span>
                  <span className="font-semibold">{formatMoney(c.outstanding)}</span>
                </div>

                <div className="flex items-center justify-between text-slate-500">
                  <span>Estimated Vacancy Loss (management metric, not an expense)</span>
                  <span className="font-semibold">{formatMoney(c.vacancyLoss)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {rentSummary && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">
              Rent Collected This Month (consolidated across all hostels — a
              per-hostel breakdown of collections isn&apos;t available yet)
            </p>
            <p className="mt-2 text-2xl font-bold text-emerald-700">
              {formatMoney(rentSummary.rent_collected_this_month)}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
