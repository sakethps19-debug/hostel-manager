type ResidentRow = {
  resident_id: number;
  booking_id: number;
  full_name: string;
  mobile_number: string | null;
  hostel_name: string;
  room_number: string;
  bed_id: number;
  bed_code: string | null;
  booking_status: string;
};

import ComplaintForm from "./ComplaintForm";
import { callRpcServer } from "@/lib/supabase/callRpcServer";

async function getActiveResidents(): Promise<ResidentRow[]> {
  const all = await callRpcServer<ResidentRow[]>("get_resident_master_list");
  return all.filter((r) => r.booking_status === "checked_in");
}

export default async function NewComplaintPage() {
  const residents = await getActiveResidents();

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <a
          href="/complaints"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Complaints
        </a>

        <div className="mt-7">
          <h1 className="text-4xl font-bold">Log Complaint</h1>
          <p className="mt-2 text-slate-500">
            Link to a resident if this concerns their room/bed, or leave
            blank for a general hostel issue.
          </p>
        </div>

        <ComplaintForm residents={residents} />
      </div>
    </main>
  );
}
