import CurrentOccupancyView from "./CurrentOccupancyView";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import { getHostelList } from "@/lib/hostel";
import { deriveBedStatus, type BedStatus } from "@/lib/bedStatus";

type BedGridRow = {
  bed_id: number;
  bed_code: string | null;
  bed_number: string;
  room_number: string;
  floor_number: number;
  floor_name: string | null;
  sharing_type: number;
  monthly_rent: number;
  bed_status: string;
  occupant_name: string | null;
  notice_given_at: string | null;
  is_future_booking: boolean;
};

export type OccupancyRow = {
  bedId: number;
  hostelName: string;
  floorNumber: number;
  roomNumber: string;
  bedCode: string;
  status: BedStatus;
  occupantName: string | null;
};

async function getHostelBedGrid(hostelName: string): Promise<BedGridRow[]> {
  return callRpcServer<BedGridRow[]>("get_hostel_bed_grid", {
    p_hostel_name: hostelName,
  });
}

export default async function CurrentOccupancyReportPage() {
  await requirePermission("manageOperationalRecords");

  const hostels = await getHostelList();

  const rows: OccupancyRow[] = (
    await Promise.all(
      hostels.map(async (h) => {
        const beds = await getHostelBedGrid(h.hostel_name);
        return beds.map((bed) => ({
          bedId: bed.bed_id,
          hostelName: h.hostel_name,
          floorNumber: bed.floor_number,
          roomNumber: bed.room_number,
          bedCode: bed.bed_code || bed.bed_number,
          status: deriveBedStatus(bed),
          occupantName: bed.occupant_name,
        }));
      })
    )
  ).flat();

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
            Reports
          </p>
          <h1 className="mt-2 text-4xl font-bold">Current Occupancy Report</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Every bed across all hostels, with its current status and
            occupant.
          </p>
        </div>

        <CurrentOccupancyView rows={rows} hostelNames={hostels.map((h) => h.hostel_name)} />
      </div>
    </main>
  );
}
