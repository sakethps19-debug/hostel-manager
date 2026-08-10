import { slugifyHostelName } from "@/lib/hostelSlug";
import { deriveBedStatus } from "@/lib/bedStatus";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";

type HostelRow = {
  hostel_name: string;
};

type BedGridRow = {
  bed_id: number;
  bed_code: string | null;
  bed_number: string;
  room_number: string;
  floor_number: number;
  floor_name: string | null;
  bed_status: string;
  occupant_name: string | null;
  notice_given_at: string | null;
  is_future_booking: boolean;
};

type MaintenanceBed = BedGridRow & { hostelName: string };

async function getHostels(): Promise<HostelRow[]> {
  return callRpcServer<HostelRow[]>("get_hostel_dashboard");
}

async function getHostelBedGrid(hostelName: string): Promise<BedGridRow[]> {
  return callRpcServer<BedGridRow[]>("get_hostel_bed_grid", {
    p_hostel_name: hostelName,
  });
}

export default async function MaintenancePage() {
  await requirePermission("manageMaintenance");

  const hostels = await getHostels();

  const bedsByHostel = await Promise.all(
    hostels.map(async (hostel) => {
      const beds = await getHostelBedGrid(hostel.hostel_name);
      return beds
        .filter((bed) => deriveBedStatus(bed) === "maintenance")
        .map((bed) => ({ ...bed, hostelName: hostel.hostel_name }));
    })
  );

  const maintenanceBeds: MaintenanceBed[] = bedsByHostel.flat();

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
            Hostel Management
          </p>
          <h1 className="mt-2 text-4xl font-bold">Beds Under Maintenance</h1>
          <p className="mt-2 text-slate-500">
            {maintenanceBeds.length} bed
            {maintenanceBeds.length === 1 ? "" : "s"} currently unavailable
            for booking, across all hostels.
          </p>
        </div>

        {maintenanceBeds.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-slate-500 shadow-sm">
            No beds are under maintenance right now.
          </div>
        ) : (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {maintenanceBeds.map((bed) => (
              <a
                key={bed.bed_id}
                href={`/${slugifyHostelName(bed.hostelName)}/room/${bed.room_number}/bed/${bed.bed_id}/maintenance`}
                className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                  {bed.hostelName} · {bed.floor_name || `Floor ${bed.floor_number}`}
                </p>
                <h2 className="mt-1 text-xl font-bold">
                  Room {bed.room_number} · {bed.bed_code || bed.bed_number}
                </h2>
                <p className="mt-2 text-sm font-semibold text-slate-500">
                  View maintenance details →
                </p>
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
