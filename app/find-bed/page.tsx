import BedSearchList from "./BedSearchList";
import { callRpcServer } from "@/lib/supabase/callRpcServer";

type AvailableBedRow = {
  bed_id: number;
  bed_number: string;
  bed_code: string | null;
  hostel_name: string;
  floor_number: number;
  floor_name: string | null;
  room_number: string;
  sharing_type: number;
  monthly_rent: number;
};

async function getAvailableBeds(): Promise<AvailableBedRow[]> {
  return callRpcServer<AvailableBedRow[]>("get_available_beds");
}

export default async function FindBedPage() {
  const beds = await getAvailableBeds();

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

          <h1 className="mt-2 text-4xl font-bold">Find an Available Bed</h1>

          <p className="mt-2 text-slate-500">
            {beds.length} bed{beds.length === 1 ? "" : "s"} currently vacant
            across all hostels.
          </p>
        </div>

        <BedSearchList beds={beds} />
      </div>
    </main>
  );
}
