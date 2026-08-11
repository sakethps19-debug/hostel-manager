import { slugifyHostelName } from "@/lib/hostel";
import OccupancyProgressBar from "@/components/OccupancyProgressBar";
import OccupancyLegend from "@/components/OccupancyLegend";
import AlertCard from "@/components/AlertCard";
import UserMenu from "@/components/UserMenu";
import NavDropdown from "@/components/NavDropdown";
import GlobalSearchForm from "@/components/GlobalSearchForm";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { getMyRole } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getFeatureFlags } from "@/lib/featureFlags";

type HostelDashboardRow = {
  hostel_id: number;
  hostel_name: string;
  floors: number;
  rooms: number;
  total_beds: number;
  occupied_beds: number;
  vacant_beds: number;
  vacating_soon_beds: number;
  reserved_beds: number;
  maintenance_beds: number;
};

type RentSummary = {
  rent_due_this_month: number;
  rent_collected_this_month: number;
  outstanding_total: number;
  overdue_residents_count: number;
  security_deposit_agreed_total: number;
};

type OperationalAlerts = {
  overdue_rent_count: number;
  vacating_7_days_count: number;
  vacating_30_days_count: number;
  deposit_pending_count: number;
  missing_id_proof_count: number;
  maintenance_count: number;
};

type TodaySnapshot = {
  checkins_today_count: number;
  checkouts_today_count: number;
  enquiries_followup_count: number;
};

async function getHostelDashboard(): Promise<HostelDashboardRow[]> {
  return callRpcServer<HostelDashboardRow[]>("get_hostel_dashboard");
}

async function getRentSummary(): Promise<RentSummary | null> {
  const data = await callRpcServer<RentSummary[]>("get_rent_dashboard_summary");
  return data.length > 0 ? data[0] : null;
}

async function getOperationalAlerts(): Promise<OperationalAlerts | null> {
  const data = await callRpcServer<OperationalAlerts[]>("get_operational_alerts");
  return data.length > 0 ? data[0] : null;
}

async function getTodaySnapshot(): Promise<TodaySnapshot | null> {
  const data = await callRpcServer<TodaySnapshot[]>("get_today_snapshot");
  return data.length > 0 ? data[0] : null;
}

async function getPendingPoliceVerificationCount(): Promise<number> {
  return callRpcServer<number>("get_pending_police_verification_count");
}

function formatMoney(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

export default async function Home() {
  await callRpcServer("capture_daily_occupancy_snapshot_if_missing").catch(
    () => {}
  );

  const hostels = await getHostelDashboard();
  const rentSummary = await getRentSummary();
  const alerts = await getOperationalAlerts();
  const today = await getTodaySnapshot();
  const pendingPoliceVerificationCount = await getPendingPoliceVerificationCount();
  const featureFlags = await getFeatureFlags().catch(() => []);
  const isFeatureEnabled = (key: string) => {
    const flag = featureFlags.find((f) => f.key === key);
    return flag ? flag.enabled : true;
  };
  const role = await getMyRole();
  const canManageBookings = hasPermission(role, "manageBookings");
  const canManageResidents = hasPermission(role, "manageResidents");
  const canManageOperationalRecords = hasPermission(
    role,
    "manageOperationalRecords"
  );
  const canManageExpenses = hasPermission(role, "manageExpenses");
  const canViewFinancialReports = hasPermission(role, "viewFinancialReports");
  const canViewAuditLog = hasPermission(role, "viewAuditLog");
  const canManageUsers = hasPermission(role, "manageUsers");
  const canManageRates = hasPermission(role, "manageRates");
  const overdueRentHref = canViewFinancialReports ? "/rent/overdue" : "/residents";

  const totalBeds = hostels.reduce(
    (sum, hostel) => sum + Number(hostel.total_beds),
    0
  );

  const occupiedBeds = hostels.reduce(
    (sum, hostel) => sum + Number(hostel.occupied_beds),
    0
  );

  const vacantBeds = hostels.reduce(
    (sum, hostel) => sum + Number(hostel.vacant_beds),
    0
  );

  const vacatingSoonBeds = hostels.reduce(
    (sum, hostel) => sum + Number(hostel.vacating_soon_beds),
    0
  );

  const reservedBeds = hostels.reduce(
    (sum, hostel) => sum + Number(hostel.reserved_beds),
    0
  );

  const maintenanceBeds = hostels.reduce(
    (sum, hostel) => sum + Number(hostel.maintenance_beds),
    0
  );

  const occupancy =
    totalBeds === 0
      ? 0
      : Math.round((occupiedBeds / totalBeds) * 1000) / 10;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-indigo-600">
              Hostel Management
            </p>

            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Hostel Manager
            </h1>

            <p className="mt-2 text-slate-500">
              Bed availability and occupancy dashboard
            </p>
          </div>
         <div className="flex flex-wrap items-center gap-3">
  <NavDropdown
    label="Operations"
    items={[
      { label: "Residents", href: "/residents" },
      ...(hasPermission(role, "manageMaintenance")
        ? [{ label: "Housekeeping", href: "/housekeeping" }]
        : []),
      ...(canManageResidents
        ? [{ label: "Emergency Directory", href: "/emergency-directory" }]
        : []),
      { label: "Booking History", href: "/history" },
      ...(canManageOperationalRecords
        ? [
            { label: "Enquiries", href: "/enquiries" },
            ...(isFeatureEnabled("enable_waitlist")
              ? [{ label: "Waitlist", href: "/waitlist" }]
              : []),
            { label: "Bed Holds", href: "/holds" },
            { label: "Complaints", href: "/complaints" },
            { label: "Referral Sources", href: "/settings/referrals" },
            { label: "Floor Performance", href: "/reports/floor-performance" },
            { label: "Enquiry Conversion", href: "/reports/enquiry-conversion" },
          ]
        : []),
      ...(hasPermission(role, "manageDocuments")
        ? [{ label: "Document Expiry Alerts", href: "/documents/expiring" }]
        : []),
    ]}
  />

  {canViewFinancialReports && (
    <NavDropdown
      label="Finance"
      items={[
        { label: "Overdue Rent", href: "/rent/overdue" },
        { label: "Rent Calendar", href: "/rent/calendar" },
        { label: "Receivable Ageing", href: "/rent/ageing" },
        { label: "Payments Report", href: "/reports/payments" },
        ...(canManageExpenses && isFeatureEnabled("enable_expenses")
          ? [
              { label: "Expenses", href: "/expenses" },
              { label: "Vendors", href: "/settings/vendors" },
            ]
          : []),
        { label: "P&L", href: "/reports/pnl" },
        { label: "Revenue Potential vs Actual", href: "/reports/revenue-potential" },
        { label: "Occupancy History", href: "/reports/occupancy-history" },
        { label: "Occupancy Forecasting", href: "/reports/occupancy-forecast" },
        { label: "Referral Performance", href: "/reports/referral-performance" },
        { label: "Hostel Comparison", href: "/reports/hostel-comparison" },
      ]}
    />
  )}

  {canManageUsers && (
    <NavDropdown
      label="Admin"
      items={[
        ...(canViewAuditLog
          ? [{ label: "Audit Log", href: "/audit-log" }]
          : []),
        { label: "Owner Daily Digest", href: "/owner/digest" },
        { label: "Users", href: "/settings/users" },
        { label: "Data Health", href: "/data-health" },
        { label: "Feature Flags", href: "/settings/feature-flags" },
        { label: "Import / Export", href: "/settings/data-tools" },
        ...(canManageRates
          ? [
              { label: "Rates", href: "/settings/rates" },
              { label: "Discount Analytics", href: "/reports/discounts" },
            ]
          : []),
      ]}
    />
  )}

  <UserMenu role={role} />

  <NavDropdown
    label="+ Quick Actions"
    variant="primary"
    items={[
      ...(canManageBookings
        ? [{ label: "New Booking", href: "#hostels" }]
        : []),
      { label: "Find a Bed", href: "/find-bed" },
      ...(canManageOperationalRecords
        ? [
            { label: "New Enquiry", href: "/enquiries/new" },
            { label: "Add to Waitlist", href: "/waitlist/new" },
            { label: "New Complaint", href: "/complaints/new" },
          ]
        : []),
      ...(canManageExpenses
        ? [{ label: "New Expense", href: "/expenses/new" }]
        : []),
    ]}
  />
</div>
        </div>

        <div className="mb-8">
          <GlobalSearchForm />
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Beds</p>
              <p className="mt-1 text-2xl font-bold">{totalBeds}</p>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-500">Occupied</p>
              <p className="mt-1 text-2xl font-bold">{occupiedBeds}</p>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-500">Available</p>
              <p className="mt-1 text-2xl font-bold text-emerald-600">
                {vacantBeds}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-500">
                Vacating Soon
              </p>
              <p className="mt-1 text-2xl font-bold text-amber-600">
                {vacatingSoonBeds}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-500">Reserved</p>
              <p className="mt-1 text-2xl font-bold text-blue-600">
                {reservedBeds}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-500">
                Maintenance
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-500">
                {maintenanceBeds}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-slate-500">
                Occupancy · Across {hostels.length} hostels
              </span>
              <span className="font-semibold">{occupancy}%</span>
            </div>
            <OccupancyProgressBar percent={occupancy} />
          </div>

          <div className="mt-5">
            <OccupancyLegend />
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-4 text-sm font-semibold text-slate-700">
            Today
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AlertCard
              count={today?.checkins_today_count ?? 0}
              label="Expected Check-ins Today"
              href="/checkins/today"
              tone="indigo"
            />

            <AlertCard
              count={today?.checkouts_today_count ?? 0}
              label="Expected Check-outs Today"
              href="/checkouts/today"
              tone="indigo"
            />

            <AlertCard
              count={vacantBeds}
              label="Available Beds Today"
              href="/find-bed"
              tone="emerald"
            />

            {alerts && (
              <AlertCard
                count={alerts.vacating_7_days_count}
                label="Vacating Within 7 Days"
                href="/vacancies"
                tone="amber"
              />
            )}
          </div>
        </section>

        {alerts && (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-4 text-sm font-semibold text-slate-700">
              Needs Attention
            </p>

            {alerts.overdue_rent_count === 0 &&
            alerts.vacating_30_days_count === 0 &&
            alerts.deposit_pending_count === 0 &&
            alerts.missing_id_proof_count === 0 &&
            alerts.maintenance_count === 0 &&
            (today?.enquiries_followup_count ?? 0) === 0 &&
            pendingPoliceVerificationCount === 0 ? (
              <p className="text-sm text-emerald-600">
                All caught up — nothing needs attention right now.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {alerts.overdue_rent_count > 0 && (
                  <AlertCard
                    count={alerts.overdue_rent_count}
                    label="Residents with overdue rent"
                    href={overdueRentHref}
                    tone="red"
                  />
                )}

                {alerts.vacating_30_days_count > 0 && (
                  <AlertCard
                    count={alerts.vacating_30_days_count}
                    label="Vacating within 30 days"
                    href="/vacancies"
                    tone="amber"
                  />
                )}

                {alerts.deposit_pending_count > 0 && (
                  <AlertCard
                    count={alerts.deposit_pending_count}
                    label="Deposit pending"
                    href="/residents"
                    tone="blue"
                  />
                )}

                {alerts.missing_id_proof_count > 0 && (
                  <AlertCard
                    count={alerts.missing_id_proof_count}
                    label="Missing ID proof"
                    href="/residents"
                    tone="blue"
                  />
                )}

                {alerts.maintenance_count > 0 && (
                  <AlertCard
                    count={alerts.maintenance_count}
                    label="Beds under maintenance"
                    href="/maintenance"
                    tone="slate"
                  />
                )}

                {(today?.enquiries_followup_count ?? 0) > 0 && (
                  <AlertCard
                    count={today!.enquiries_followup_count}
                    label="Enquiries requiring follow-up"
                    href="/enquiries"
                    tone="blue"
                  />
                )}

                {pendingPoliceVerificationCount > 0 && (
                  <AlertCard
                    count={pendingPoliceVerificationCount}
                    label="Police verification pending"
                    href="/residents"
                    tone="amber"
                  />
                )}
              </div>
            )}
          </section>
        )}

        {rentSummary && (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-700">
                Rent Collection · This Month
              </p>

              <a
                href={overdueRentHref}
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
              >
                View Overdue Rent →
              </a>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">
                  Rent Due
                </p>
                <p className="mt-2 text-2xl font-bold">
                  {formatMoney(rentSummary.rent_due_this_month)}
                </p>
              </div>

              <div className="rounded-xl bg-emerald-50 p-4">
                <p className="text-xs font-medium text-emerald-700">
                  Rent Collected
                </p>
                <p className="mt-2 text-2xl font-bold text-emerald-700">
                  {formatMoney(rentSummary.rent_collected_this_month)}
                </p>
              </div>

              <div className="rounded-xl bg-red-50 p-4">
                <p className="text-xs font-medium text-red-700">
                  Outstanding
                </p>
                <p className="mt-2 text-2xl font-bold text-red-700">
                  {formatMoney(rentSummary.outstanding_total)}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">
                  Collection %
                </p>
                <p className="mt-2 text-2xl font-bold">
                  {rentSummary.rent_due_this_month > 0
                    ? `${(
                        (rentSummary.rent_collected_this_month /
                          rentSummary.rent_due_this_month) *
                        100
                      ).toFixed(1)}%`
                    : "-"}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-5 text-sm text-slate-500">
              <span>
                <span className="font-semibold text-red-600">
                  {rentSummary.overdue_residents_count}
                </span>{" "}
                resident{rentSummary.overdue_residents_count === 1 ? "" : "s"}{" "}
                overdue
              </span>

              <span>
                Security deposits agreed:{" "}
                <span className="font-semibold text-slate-700">
                  {formatMoney(rentSummary.security_deposit_agreed_total)}
                </span>
              </span>
            </div>
          </section>
        )}

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <a
            href="/find-bed"
            className="block rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-left transition hover:bg-indigo-100"
          >
            <p className="text-lg font-semibold text-indigo-900">
              Find an Available Bed
            </p>
            <p className="mt-1 text-sm text-indigo-700">
              Search vacant beds by sharing type and rent.
            </p>
          </a>

          <a
            href="/vacancies"
            className="block rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:bg-slate-50"
          >
            <p className="text-lg font-semibold">View Upcoming Vacancies</p>
            <p className="mt-1 text-sm text-slate-500">
              See beds that will become available soon.
            </p>
          </a>
        </section>

        <section id="hostels" className="mt-10 scroll-mt-6">
          <div className="mb-5">
            <h2 className="text-xl font-bold">Hostels</h2>
            <p className="mt-1 text-sm text-slate-500">
              Select a hostel to view floors, rooms and individual beds.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {hostels.map((hostel) => {
              const hostelOccupancy =
                Number(hostel.total_beds) === 0
                  ? 0
                  : Math.round(
                      (Number(hostel.occupied_beds) /
                        Number(hostel.total_beds)) *
                        1000
                    ) / 10;

              return (
                <div
                  key={hostel.hostel_id}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xl font-bold">
                        {hostel.hostel_name}
                      </h3>

                      <p className="mt-1 text-sm text-slate-500">
                        {hostel.floors} floors · {hostel.rooms} rooms
                      </p>
                    </div>

                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                      {hostel.vacant_beds} vacant
                    </span>
                  </div>

                  <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xl font-bold">
                        {hostel.total_beds}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Beds</p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xl font-bold">
                        {hostel.occupied_beds}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Occupied</p>
                    </div>

                    <div className="rounded-xl bg-emerald-50 p-3">
                      <p className="text-xl font-bold text-emerald-600">
                        {hostel.vacant_beds}
                      </p>
                      <p className="mt-1 text-xs text-emerald-700">
                        Available
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-xl bg-amber-50 p-3">
                      <p className="text-lg font-bold text-amber-600">
                        {hostel.vacating_soon_beds}
                      </p>
                      <p className="mt-1 text-xs text-amber-700">
                        Vacating Soon
                      </p>
                    </div>

                    <div className="rounded-xl bg-blue-50 p-3">
                      <p className="text-lg font-bold text-blue-600">
                        {hostel.reserved_beds}
                      </p>
                      <p className="mt-1 text-xs text-blue-700">Reserved</p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-lg font-bold text-slate-500">
                        {hostel.maintenance_beds}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Maintenance
                      </p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="mb-2 flex justify-between text-sm">
                      <span className="text-slate-500">Occupancy</span>
                      <span className="font-semibold">
                        {hostelOccupancy}%
                      </span>
                    </div>

                    <OccupancyProgressBar percent={hostelOccupancy} />
                  </div>
                 <a
    href={`/${slugifyHostelName(hostel.hostel_name)}`}
    className="mt-6 block w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold transition hover:bg-slate-50"
  >
    View Hostel →
  </a>
                </div>
              );
            })}
          </div>
        </section>

        <footer className="py-8 text-center text-sm text-slate-400">
          Hostel Manager · Live Database
        </footer>
      </div>
    </main>
  );
}
