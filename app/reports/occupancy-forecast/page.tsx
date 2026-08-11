import OccupancyForecastView from "./OccupancyForecastView";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";

type HostelDashboardRow = {
  hostel_id: number;
  hostel_name: string;
  total_beds: number;
  occupied_beds: number;
};

type CheckinRow = {
  booking_id: number;
  hostel_name: string;
  full_name: string;
  room_number: string;
  bed_code: string | null;
  bed_number: string;
  start_date: string;
  days_until: number;
  monthly_rent: number;
};

type VacancyRow = {
  booking_id: number;
  hostel_name: string;
  full_name: string;
  room_number: string;
  bed_number: string;
  end_date: string;
  days_left: number;
  monthly_rent: number;
};

async function getHostelDashboard(): Promise<HostelDashboardRow[]> {
  return callRpcServer<HostelDashboardRow[]>("get_hostel_dashboard");
}

async function getUpcomingCheckins(): Promise<CheckinRow[]> {
  return callRpcServer<CheckinRow[]>("get_upcoming_checkins", { p_days: 90 });
}

async function getUpcomingVacancies(): Promise<VacancyRow[]> {
  return callRpcServer<VacancyRow[]>("get_upcoming_vacancies", { p_days: 90 });
}

export default async function OccupancyForecastPage() {
  await requirePermission("viewFinancialReports");

  const [hostels, checkins, vacancies] = await Promise.all([
    getHostelDashboard(),
    getUpcomingCheckins(),
    getUpcomingVacancies(),
  ]);

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
          <h1 className="mt-2 text-4xl font-bold">Occupancy Forecasting</h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            A week-by-week projection built only from confirmed bookings
            already in the system — confirmed reservations checking in, and
            active residents checking out. It intentionally does not include
            enquiries or waitlist entries, since those aren&apos;t confirmed
            and would make this a guess rather than a projection.
          </p>
        </div>

        <OccupancyForecastView
          hostels={hostels}
          checkins={checkins}
          vacancies={vacancies}
        />
      </div>
    </main>
  );
}
