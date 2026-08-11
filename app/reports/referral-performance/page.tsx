import ReferralPerformanceView from "./ReferralPerformanceView";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";

type PerformanceRow = {
  referral_source_id: number;
  name: string;
  source_type: string;
  bookings_count: number;
  active_bookings_count: number;
  total_monthly_rent_value: number;
  total_commission: number;
};

type BookingReferralRow = {
  booking_id: number;
  bed_id: number;
  referral_source_id: number;
  referral_source_name: string;
  source_type: string;
  commission_amount: number | null;
  notes: string | null;
};

type BookingHistoryRow = {
  booking_id: number;
  full_name: string;
  hostel_name: string;
  room_number: string;
  bed_code: string | null;
  bed_number: string;
  start_date: string;
  monthly_rent: number;
  booking_status: string;
};

async function getReferralPerformance(): Promise<PerformanceRow[]> {
  return callRpcServer<PerformanceRow[]>("get_referral_performance");
}

async function getBookingReferrals(): Promise<BookingReferralRow[]> {
  return callRpcServer<BookingReferralRow[]>("get_booking_referrals");
}

async function getBookingHistory(): Promise<BookingHistoryRow[]> {
  return callRpcServer<BookingHistoryRow[]>("get_booking_history");
}

export default async function ReferralPerformancePage() {
  await requirePermission("viewFinancialReports");

  const [performance, referrals, bookingHistory] = await Promise.all([
    getReferralPerformance(),
    getBookingReferrals(),
    getBookingHistory(),
  ]);

  const bookingsById = new Map(bookingHistory.map((b) => [b.booking_id, b]));

  const referredBookings = referrals.map((r) => ({
    ...r,
    booking: bookingsById.get(r.booking_id) || null,
  }));

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
            Hostel Management
          </p>
          <h1 className="mt-2 text-4xl font-bold">Referral Performance</h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            Bookings and commissions attributed to each broker/referral
            source. Only covers bookings attributed after the{" "}
            <a href="/settings/referrals" className="font-semibold text-indigo-600">
              Referral Sources
            </a>{" "}
            feature went live — earlier bookings were never tagged with a
            source and won&apos;t appear here.
          </p>
        </div>

        <ReferralPerformanceView
          performance={performance}
          referredBookings={referredBookings}
        />
      </div>
    </main>
  );
}
