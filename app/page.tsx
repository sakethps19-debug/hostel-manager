import { slugifyHostelName } from "@/lib/hostel";
import OccupancyProgressBar from "@/components/OccupancyProgressBar";
import OccupancyLegend from "@/components/OccupancyLegend";
import AlertCard from "@/components/AlertCard";
import UserMenu from "@/components/UserMenu";
import NavDropdown from "@/components/NavDropdown";
import GlobalSearchForm from "@/components/GlobalSearchForm";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { getMyRole } from "@/lib/auth";
import { hasPermission, roleLabel, type Role } from "@/lib/permissions";
import { getFeatureFlags } from "@/lib/featureFlags";

const PREVIEWABLE_ROLES: Role[] = ["finance_manager", "operations_manager"];

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

type PageProps = {
  searchParams: Promise<{ viewAs?: string }>;
};

export default async function Home({ searchParams }: PageProps) {
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
  const actualRole = await getMyRole();
  const { viewAs } = await searchParams;
  // Owner-only "view as" preview: lets the Owner see what the nav/quick
  // actions look like for Finance Manager or Operations Manager, without
  // actually switching accounts. Every hasPermission(role, ...) check below
  // uses this effective role, so the preview only ever narrows what's shown
  // - it can't grant the Owner anything they don't already have, and every
  // linked page still re-checks the REAL session role server-side regardless
  // of what's clicked here.
  const previewRole =
    actualRole === "owner" && PREVIEWABLE_ROLES.includes(viewAs as Role)
      ? (viewAs as Role)
      : null;
  const role = previewRole ?? actualRole;
  const canManageBookings = hasPermission(role, "manageBookings");
  const canManageResidents = hasPermission(role, "manageResidents");
  const canManageOperationalRecords = hasPermission(
    role,
    "manageOperationalRecords"
  );
  const canManageExpenses = hasPermission(role, "manageExpenses");
  const canManageMaintenance = hasPermission(role, "manageMaintenance");
  const canViewFinancialReports = hasPermission(role, "viewFinancialReports");
  const canViewAuditLog = hasPermission(role, "viewAuditLog");
  const canManageUsers = hasPermission(role, "manageUsers");
  const canManageRates = hasPermission(role, "manageRates");
  const canSendMessages =
    hasPermission(role, "sendOperationalMessages") ||
    hasPermission(role, "sendFinanceMessages");
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
        {actualRole === "owner" && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
            {previewRole ? (
              <>
                <span className="font-semibold text-amber-800">
                  Previewing the nav as {roleLabel(previewRole)} — this only changes what&apos;s shown below;
                  you&apos;re still signed in as Owner and every page still checks your real access.
                </span>
                <a
                  href="/"
                  className="ml-auto rounded-lg border border-amber-300 bg-white px-3 py-1 font-semibold text-amber-800 hover:bg-amber-100"
                >
                  Exit Preview
                </a>
              </>
            ) : (
              <form method="get" className="flex flex-wrap items-center gap-2">
                <label htmlFor="viewAs" className="font-semibold text-amber-800">
                  Preview dashboard as:
                </label>
                <select
                  id="viewAs"
                  name="viewAs"
                  defaultValue=""
                  className="rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-sm outline-none"
                >
                  <option value="" disabled>
                    Choose a role…
                  </option>
                  {PREVIEWABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {roleLabel(r)}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700"
                >
                  Preview
                </button>
              </form>
            )}
          </div>
        )}

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
      { label: "Residents", href: "/residents", section: "Manage" },
      ...(hasPermission(role, "manageMaintenance")
        ? [
            { label: "Housekeeping", href: "/housekeeping", section: "Manage" },
            { label: "Purchase Requests", href: "/purchase-requests", section: "Manage" },
          ]
        : []),
      ...(canManageResidents
        ? [{ label: "Emergency Directory", href: "/emergency-directory", section: "Manage" }]
        : []),
      { label: "Booking History", href: "/history", section: "Manage" },
      ...(hasPermission(role, "viewAssetRegister") && !canViewFinancialReports
        ? [{ label: "Asset Register", href: "/settings/assets", section: "Manage" }]
        : []),
      ...(canManageOperationalRecords
        ? [
            { label: "Enquiries", href: "/enquiries", section: "Manage" },
            ...(isFeatureEnabled("enable_waitlist")
              ? [{ label: "Waitlist", href: "/waitlist", section: "Manage" }]
              : []),
            { label: "Bed Holds", href: "/holds", section: "Manage" },
            { label: "Complaints", href: "/complaints", section: "Manage" },
            { label: "Referral Sources", href: "/settings/referrals", section: "Manage" },
          ]
        : []),
      ...(hasPermission(role, "manageDocuments")
        ? [{ label: "Document Expiry Alerts", href: "/documents/expiring", section: "Manage" }]
        : []),
      ...(canSendMessages
        ? [{ label: "Communications", href: "/communications", section: "Manage" }]
        : []),
      ...(canManageOperationalRecords
        ? [
            { label: "Current Occupancy", href: "/reports/current-occupancy", section: "Reports" },
            { label: "Occupancy History", href: "/reports/occupancy-history", section: "Reports" },
            { label: "Occupancy Forecasting", href: "/reports/occupancy-forecast", section: "Reports" },
            { label: "Floor Performance", href: "/reports/floor-performance", section: "Reports" },
            { label: "Enquiry Conversion", href: "/reports/enquiry-conversion", section: "Reports" },
          ]
        : []),
    ]}
  />

  {canViewFinancialReports && (
    <NavDropdown
      label="Finance"
      items={[
        { label: "Overdue Rent", href: "/rent/overdue", section: "Rent & Payments" },
        { label: "Rent Calendar", href: "/rent/calendar", section: "Rent & Payments" },
        { label: "Receivable Ageing", href: "/rent/ageing", section: "Rent & Payments" },
        { label: "Advance Rent", href: "/reports/advance-rent", section: "Rent & Payments" },
        { label: "Payments Report", href: "/reports/payments", section: "Rent & Payments" },
        ...(canManageExpenses && isFeatureEnabled("enable_expenses")
          ? [
              { label: "Expenses", href: "/expenses", section: "Expenses" },
              { label: "Recurring Expenses", href: "/expenses/recurring", section: "Expenses" },
              { label: "Petty Cash / Cashbook", href: "/expenses/petty-cash", section: "Expenses" },
              { label: "Cash Reconciliation", href: "/expenses/cash-reconciliation", section: "Expenses" },
              { label: "Expense Approvals", href: "/expenses/approvals", section: "Expenses" },
              { label: "Budget vs Actual", href: "/reports/budget-vs-actual", section: "Expenses" },
              { label: "Vendors", href: "/settings/vendors", section: "Expenses" },
            ]
          : []),
        { label: "P&L", href: "/reports/pnl", section: "Reports" },
        { label: "Monthly Report Pack", href: "/reports/monthly-pack", section: "Reports" },
        { label: "Revenue Potential vs Actual", href: "/reports/revenue-potential", section: "Reports" },
        { label: "Occupancy History", href: "/reports/occupancy-history", section: "Reports" },
        { label: "Occupancy Forecasting", href: "/reports/occupancy-forecast", section: "Reports" },
        { label: "Referral Performance", href: "/reports/referral-performance", section: "Reports" },
        { label: "Hostel Comparison", href: "/reports/hostel-comparison", section: "Reports" },
        { label: "Deposit Reconciliation", href: "/reports/deposit-reconciliation", section: "Reports" },
        { label: "Asset Register", href: "/settings/assets", section: "Fixed Assets" },
        ...(isFeatureEnabled("enable_accounting")
          ? [
              { label: "Accounts Receivable", href: "/accounting/receivables", section: "Accounting" },
              { label: "Accounts Payable", href: "/accounting/payables", section: "Accounting" },
              { label: "Ledger P&L", href: "/accounting/pnl", section: "Accounting" },
              { label: "Balance Sheet", href: "/accounting/balance-sheet", section: "Accounting" },
              { label: "Cash Flow Statement", href: "/accounting/cash-flow", section: "Accounting" },
              { label: "Net Worth", href: "/accounting/net-worth", section: "Accounting" },
              { label: "Forecast / Working Capital", href: "/accounting/forecast", section: "Accounting" },
              { label: "Trial Balance", href: "/accounting/trial-balance", section: "Accounting" },
              { label: "General Ledger", href: "/accounting/ledger", section: "Accounting" },
              { label: "Journal Entries", href: "/accounting/journal-entries", section: "Accounting" },
              { label: "Reconciliation", href: "/accounting/reconciliation", section: "Accounting" },
            ]
          : []),
      ]}
    />
  )}

  {canManageUsers && (
    <NavDropdown
      label="Admin"
      items={[
        { label: "Owner Daily Digest", href: "/owner/digest", section: "Insights" },
        { label: "Owner KPIs", href: "/owner/kpis", section: "Insights" },
        { label: "Notifications Centre", href: "/notifications", section: "Insights" },
        { label: "Monthly Finance Close", href: "/reports/monthly-finance-close", section: "Insights" },
        ...(canViewAuditLog
          ? [{ label: "Audit Log", href: "/audit-log", section: "Insights" }]
          : []),
        { label: "Users", href: "/settings/users", section: "Settings" },
        { label: "Message Templates", href: "/settings/message-templates", section: "Settings" },
        { label: "Application Form Settings", href: "/settings/application-form", section: "Settings" },
        { label: "Data Health", href: "/data-health", section: "Settings" },
        { label: "Feature Flags", href: "/settings/feature-flags", section: "Settings" },
        { label: "Import / Export", href: "/settings/data-tools", section: "Settings" },
        ...(isFeatureEnabled("enable_accounting")
          ? [
              { label: "Chart of Accounts", href: "/settings/accounting", section: "Settings" },
              { label: "Opening Balances", href: "/settings/accounting/opening-balances", section: "Settings" },
            ]
          : []),
        ...(canManageRates
          ? [
              { label: "Rates", href: "/settings/rates", section: "Settings" },
              { label: "Discount Analytics", href: "/reports/discounts", section: "Settings" },
            ]
          : []),
      ]}
    />
  )}

  <UserMenu role={actualRole} />

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
            ...(isFeatureEnabled("enable_waitlist")
              ? [{ label: "Add to Waitlist", href: "/waitlist/new" }]
              : []),
            { label: "New Complaint", href: "/complaints/new" },
          ]
        : []),
      ...(canManageExpenses && isFeatureEnabled("enable_expenses")
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
            (!canManageMaintenance || alerts.maintenance_count === 0) &&
            (!canManageOperationalRecords ||
              (today?.enquiries_followup_count ?? 0) === 0) &&
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

                {canManageMaintenance && alerts.maintenance_count > 0 && (
                  <AlertCard
                    count={alerts.maintenance_count}
                    label="Beds under maintenance"
                    href="/maintenance"
                    tone="slate"
                  />
                )}

                {canManageOperationalRecords &&
                  (today?.enquiries_followup_count ?? 0) > 0 && (
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
