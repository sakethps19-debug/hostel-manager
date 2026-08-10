import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import EmergencyDirectoryView from "./EmergencyDirectoryView";

type DirectoryRow = {
  resident_id: number;
  full_name: string;
  hostel_name: string;
  floor_number: number;
  floor_name: string | null;
  room_number: string;
  bed_code: string | null;
  bed_number: string;
  mobile_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_mobile: string | null;
};

async function getEmergencyDirectory(): Promise<DirectoryRow[]> {
  return callRpcServer<DirectoryRow[]>("get_emergency_directory");
}

export default async function EmergencyDirectoryPage() {
  await requirePermission("manageResidents");

  const residents = await getEmergencyDirectory();

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <a
          href="/"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 print:hidden"
        >
          ← Back to Dashboard
        </a>

        <div className="mt-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Hostel Management
          </p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
            Emergency Resident Directory
          </h1>
          <p className="mt-2 text-slate-500">
            {residents.length} current resident
            {residents.length === 1 ? "" : "s"} · mobile numbers and
            emergency contacts, for on-site use during an emergency.
          </p>
        </div>

        <EmergencyDirectoryView residents={residents} />
      </div>
    </main>
  );
}
