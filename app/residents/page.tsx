import ResidentSearchTable from "./ResidentSearchTable";
import { callRpcServer } from "@/lib/supabase/callRpcServer";

type ResidentRow = {
  resident_id: number;
  booking_id: number;
  full_name: string;
  mobile_number: string | null;
  id_proof_number: string | null;
  hostel_name: string;
  room_number: string;
  bed_id: number;
  bed_code: string | null;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  outstanding_rent: number;
  booking_status: string;
  photo_storage_path: string | null;
};

type TagRow = { resident_id: number; tag_label: string };

async function getResidentMasterList(): Promise<ResidentRow[]> {
  return callRpcServer<ResidentRow[]>("get_resident_master_list");
}

async function getAllResidentTags(): Promise<TagRow[]> {
  return callRpcServer<TagRow[]>("get_all_resident_tags");
}

export default async function ResidentsPage() {
  const [residents, tagRows] = await Promise.all([
    getResidentMasterList(),
    getAllResidentTags(),
  ]);

  const tagsByResidentId: Record<number, string[]> = {};
  for (const row of tagRows) {
    (tagsByResidentId[row.resident_id] ||= []).push(row.tag_label);
  }

  const allTags = Array.from(new Set(tagRows.map((r) => r.tag_label))).sort();

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl">
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

          <h1 className="mt-2 text-4xl font-bold">Residents</h1>

          <p className="mt-2 text-slate-500">
            Search and manage all residents across every hostel.
          </p>
        </div>

        <ResidentSearchTable
          residents={residents}
          tagsByResidentId={tagsByResidentId}
          allTags={allTags}
        />
      </div>
    </main>
  );
}
