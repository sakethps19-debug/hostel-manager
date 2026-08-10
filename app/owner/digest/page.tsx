import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import { formatMoney, formatDate, todayIsoDateIST } from "@/lib/format";
import AlertCard from "@/components/AlertCard";
import PrintButton from "./PrintButton";

type HostelDashboardRow = {
  hostel_id: number;
  hostel_name: string;
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

type ExpiringDocRow = {
  document_type: string;
  expiry_date: string;
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

async function getExpiringDocuments(): Promise<ExpiringDocRow[]> {
  return callRpcServer<ExpiringDocRow[]>("get_expiring_documents");
}

export default async function OwnerDigestPage() {
  await requirePermission("manageUsers");

  const [hostels, rentSummary, alerts, today, pendingPoliceVerification, expiringDocs] =
    await Promise.all([
      getHostelDashboard(),
      getRentSummary(),
      getOperationalAlerts(),
      getTodaySnapshot(),
      getPendingPoliceVerificationCount(),
      getExpiringDocuments(),
    ]);

  const totalBeds = hostels.reduce((sum, h) => sum + Number(h.total_beds), 0);
  const occupiedBeds = hostels.reduce((sum, h) => sum + Number(h.occupied_beds), 0);
  const occupancyPct =
    totalBeds === 0 ? 0 : Math.round((occupiedBeds / totalBeds) * 1000) / 10;

  const docsExpired = expiringDocs.filter(
    (d) => new Date(`${d.expiry_date}T00:00:00`) < new Date(`${todayIsoDateIST()}T00:00:00`)
  ).length;
  const docsExpiringSoon = expiringDocs.length - docsExpired;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900 print:bg-white">
      <div className="mx-auto max-w-4xl">
        <a
          href="/"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 print:hidden"
        >
          ← Back to Dashboard
        </a>

        <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              Owner Daily Digest
            </p>
            <h1 className="mt-2 text-4xl font-bold">
              {formatDate(todayIsoDateIST())}
            </h1>
          </div>

          <PrintButton />
        </div>

        <p className="mt-2 text-sm text-slate-500">
          A snapshot of today's activity across all hostels. There is no
          background job in this app to email this automatically — check
          back here each morning, or print/save it as a PDF.
        </p>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Today</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Check-ins
              </p>
              <p className="mt-1 text-2xl font-bold">
                {today?.checkins_today_count ?? 0}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Check-outs
              </p>
              <p className="mt-1 text-2xl font-bold">
                {today?.checkouts_today_count ?? 0}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Enquiries Needing Follow-up
              </p>
              <p className="mt-1 text-2xl font-bold">
                {today?.enquiries_followup_count ?? 0}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Occupancy</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Overall Occupancy
              </p>
              <p className="mt-1 text-2xl font-bold">
                {occupiedBeds}/{totalBeds} ({occupancyPct}%)
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Vacant Beds
              </p>
              <p className="mt-1 text-2xl font-bold">
                {hostels.reduce((sum, h) => sum + Number(h.vacant_beds), 0)}
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Hostel</th>
                  <th className="px-4 py-2 text-right">Occupied</th>
                  <th className="px-4 py-2 text-right">Vacant</th>
                  <th className="px-4 py-2 text-right">Reserved</th>
                  <th className="px-4 py-2 text-right">Maintenance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hostels.map((h) => (
                  <tr key={h.hostel_id}>
                    <td className="px-4 py-2 font-semibold">{h.hostel_name}</td>
                    <td className="px-4 py-2 text-right">
                      {h.occupied_beds}/{h.total_beds}
                    </td>
                    <td className="px-4 py-2 text-right">{h.vacant_beds}</td>
                    <td className="px-4 py-2 text-right">{h.reserved_beds}</td>
                    <td className="px-4 py-2 text-right">{h.maintenance_beds}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Finance This Month</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Rent Collected
              </p>
              <p className="mt-1 text-2xl font-bold text-emerald-600">
                {formatMoney(rentSummary?.rent_collected_this_month ?? 0)}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                of {formatMoney(rentSummary?.rent_due_this_month ?? 0)} due
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Outstanding
              </p>
              <p className="mt-1 text-2xl font-bold text-red-600">
                {formatMoney(rentSummary?.outstanding_total ?? 0)}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                across {rentSummary?.overdue_residents_count ?? 0} resident
                {rentSummary?.overdue_residents_count === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Needs Attention</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <AlertCard
              count={alerts?.overdue_rent_count ?? 0}
              label="Overdue Rent"
              href="/rent/overdue"
              tone="red"
            />
            <AlertCard
              count={alerts?.maintenance_count ?? 0}
              label="Open Maintenance"
              href="/maintenance"
              tone="amber"
            />
            <AlertCard
              count={alerts?.deposit_pending_count ?? 0}
              label="Deposit Pending"
              href="/residents"
              tone="amber"
            />
            <AlertCard
              count={alerts?.missing_id_proof_count ?? 0}
              label="Missing ID Proof"
              href="/residents"
              tone="amber"
            />
            <AlertCard
              count={pendingPoliceVerification}
              label="Police Verification Pending"
              href="/residents"
              tone="amber"
            />
            <AlertCard
              count={docsExpired}
              label="Documents Already Expired"
              href="/documents/expiring"
              tone="red"
            />
            <AlertCard
              count={docsExpiringSoon}
              label="Documents Expiring Soon"
              href="/documents/expiring"
              tone="amber"
            />
            <AlertCard
              count={alerts?.vacating_7_days_count ?? 0}
              label="Vacating in 7 Days"
              href="/vacancies"
              tone="blue"
            />
          </div>
        </section>

        <div className="mt-6 flex flex-wrap gap-3 text-sm print:hidden">
          <a href="/reports/hostel-comparison" className="font-semibold text-indigo-600 hover:text-indigo-700">
            Hostel Comparison →
          </a>
          <a href="/data-health" className="font-semibold text-indigo-600 hover:text-indigo-700">
            Data Health →
          </a>
          <a href="/reports/revenue-potential" className="font-semibold text-indigo-600 hover:text-indigo-700">
            Revenue Potential vs Actual →
          </a>
        </div>
      </div>
    </main>
  );
}
