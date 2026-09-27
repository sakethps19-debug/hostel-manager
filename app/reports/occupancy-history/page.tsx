import { redirect } from "next/navigation";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { getMyRole } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

type SnapshotRow = {
  snapshot_date: string;
  hostel_name: string;
  total_beds: number;
  occupied_beds: number;
  vacant_beds: number;
  reserved_beds: number;
  maintenance_beds: number;
  occupancy_percent: number;
};

async function getOccupancySnapshots(): Promise<SnapshotRow[]> {
  return callRpcServer<SnapshotRow[]>("get_occupancy_snapshots", {
    p_hostel_name: null,
    p_days: 90,
  });
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function OccupancyHistoryPage() {
  const role = await getMyRole();
  const canView =
    hasPermission(role, "viewFinancialReports") ||
    hasPermission(role, "manageOperationalRecords");

  if (!canView) {
    redirect("/");
  }

  const snapshots = await getOccupancySnapshots();

  const byDate = new Map<string, SnapshotRow[]>();
  for (const row of snapshots) {
    const list = byDate.get(row.snapshot_date) || [];
    list.push(row);
    byDate.set(row.snapshot_date, list);
  }

  const dates = Array.from(byDate.keys()).sort((a, b) => (a < b ? 1 : -1));

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
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
          <h1 className="mt-2 text-4xl font-bold">Occupancy History</h1>
          <p className="mt-2 text-slate-500">
            Daily occupancy snapshots per hostel, captured the first time the
            dashboard is visited each day. Historical snapshots are never
            overwritten, but a day with no dashboard visits at all has no
            snapshot.
          </p>
        </div>

        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {dates.length === 0 ? (
            <div className="px-6 py-16 text-center text-slate-500">
              No snapshots captured yet — check back after the dashboard has
              been visited at least once today.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Hostel</th>
                    <th className="px-6 py-4 text-right">Total Beds</th>
                    <th className="px-6 py-4 text-right">Occupied</th>
                    <th className="px-6 py-4 text-right">Vacant</th>
                    <th className="px-6 py-4 text-right">Reserved</th>
                    <th className="px-6 py-4 text-right">Maintenance</th>
                    <th className="px-6 py-4 text-right">Occupancy %</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {dates.map((date) =>
                    (byDate.get(date) || []).map((row, i) => (
                      <tr key={`${date}-${row.hostel_name}`} className="hover:bg-slate-50">
                        <td className="px-6 py-3 whitespace-nowrap">
                          {i === 0 ? formatDate(date) : ""}
                        </td>
                        <td className="px-6 py-3">{row.hostel_name}</td>
                        <td className="px-6 py-3 text-right">{row.total_beds}</td>
                        <td className="px-6 py-3 text-right">{row.occupied_beds}</td>
                        <td className="px-6 py-3 text-right">{row.vacant_beds}</td>
                        <td className="px-6 py-3 text-right">{row.reserved_beds}</td>
                        <td className="px-6 py-3 text-right">{row.maintenance_beds}</td>
                        <td className="px-6 py-3 text-right font-semibold">
                          {row.occupancy_percent}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
