"use client";

import { slugifyHostelName } from "@/lib/hostelSlug";

type PerformanceRow = {
  referral_source_id: number;
  name: string;
  source_type: string;
  bookings_count: number;
  active_bookings_count: number;
  total_monthly_rent_value: number;
  total_commission: number;
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

type ReferredBookingRow = {
  booking_id: number;
  bed_id: number;
  referral_source_id: number;
  referral_source_name: string;
  source_type: string;
  commission_amount: number | null;
  notes: string | null;
  booking: BookingHistoryRow | null;
};

function formatMoney(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

export default function ReferralPerformanceView({
  performance,
  referredBookings,
}: {
  performance: PerformanceRow[];
  referredBookings: ReferredBookingRow[];
}) {
  return (
    <section className="mt-8">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {performance.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-500">
            No referral sources set up yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Total Bookings</th>
                  <th className="px-4 py-3 text-right">Currently Active</th>
                  <th className="px-4 py-3 text-right">Active Rent Value/mo</th>
                  <th className="px-4 py-3 text-right">Total Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {performance.map((row) => (
                  <tr key={row.referral_source_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold">{row.name}</td>
                    <td className="px-4 py-3">{row.source_type}</td>
                    <td className="px-4 py-3 text-right">{row.bookings_count}</td>
                    <td className="px-4 py-3 text-right">{row.active_bookings_count}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatMoney(row.total_monthly_rent_value)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(row.total_commission)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2 className="mt-8 text-lg font-bold">Referred Bookings</h2>

      <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {referredBookings.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-500">
            No bookings attributed to a referral source yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Resident</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3 text-right">Commission</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {referredBookings.map((row) => (
                  <tr key={row.booking_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold">
                      {row.booking?.full_name || `Booking #${row.booking_id}`}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {row.booking
                        ? `${row.booking.hostel_name} · Room ${row.booking.room_number} · ${
                            row.booking.bed_code || row.booking.bed_number
                          }`
                        : "-"}
                    </td>
                    <td className="px-4 py-3">{row.referral_source_name}</td>
                    <td className="px-4 py-3 text-right">
                      {row.commission_amount ? formatMoney(row.commission_amount) : "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.booking && (
                        <a
                          href={`/${slugifyHostelName(row.booking.hostel_name)}/room/${row.booking.room_number}/resident/${row.bed_id}`}
                          className="font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                          View →
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
