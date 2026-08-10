import { slugifyHostelName } from "@/lib/hostel";
import { callRpcServer } from "@/lib/supabase/callRpcServer";

type TodayCheckoutRow = {
  booking_id: number;
  bed_id: number;
  bed_number: string;
  bed_code: string | null;
  hostel_name: string;
  floor_number: number;
  room_number: string;
  resident_id: number;
  full_name: string;
  mobile_number: string | null;
  checkout_date: string;
  notice_given: boolean;
  monthly_rent: number;
};

async function getTodaysCheckouts(): Promise<TodayCheckoutRow[]> {
  return callRpcServer<TodayCheckoutRow[]>("get_todays_checkouts");
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function TodaysCheckoutsPage() {
  const checkouts = await getTodaysCheckouts();

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

          <h1 className="mt-2 text-4xl font-bold">Expected Check-outs Today</h1>

          <p className="mt-2 text-slate-500">
            Residents vacating today, across all hostels.
          </p>
        </div>

        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {checkouts.length === 0 ? (
            <div className="px-6 py-16 text-center text-slate-500">
              No check-outs are expected today.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Resident</th>
                    <th className="px-6 py-4">Location</th>
                    <th className="px-6 py-4">Vacating On</th>
                    <th className="px-6 py-4">Rent</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {checkouts.map((checkout) => (
                    <tr key={checkout.booking_id} className="hover:bg-slate-50">
                      <td className="px-6 py-5">
                        <p className="font-semibold text-slate-900">
                          {checkout.full_name}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {checkout.mobile_number || "No mobile number"}
                        </p>
                      </td>

                      <td className="px-6 py-5">
                        <p className="font-medium">{checkout.hostel_name}</p>

                        <p className="mt-1 text-xs text-slate-500">
                          Room {checkout.room_number} ·{" "}
                          {checkout.bed_code || checkout.bed_number}
                        </p>
                      </td>

                      <td className="px-6 py-5 whitespace-nowrap">
                        {formatDate(checkout.checkout_date)}
                        {checkout.notice_given && (
                          <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                            Notice Given
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-5 whitespace-nowrap font-semibold">
                        Rs. {Number(checkout.monthly_rent).toLocaleString("en-IN")}
                      </td>

                      <td className="px-6 py-5 text-right">
                        <a
                          href={`/${slugifyHostelName(checkout.hostel_name)}/room/${checkout.room_number}/resident/${checkout.bed_id}`}
                          className="font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                          View →
                        </a>
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
