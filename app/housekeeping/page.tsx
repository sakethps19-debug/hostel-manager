import HousekeepingView from "./HousekeepingView";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import { getHostelList } from "@/lib/hostel";

type HousekeepingTaskRow = {
  task_id: number;
  hostel_name: string | null;
  room_number: string | null;
  bed_code: string | null;
  bed_id: number | null;
  task_type: string;
  description: string;
  status: string;
  assigned_to: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
};

async function getHousekeepingTasks(): Promise<HousekeepingTaskRow[]> {
  return callRpcServer<HousekeepingTaskRow[]>("get_housekeeping_tasks");
}

export default async function HousekeepingPage() {
  await requirePermission("manageMaintenance");

  const [tasks, hostels] = await Promise.all([
    getHousekeepingTasks(),
    getHostelList(),
  ]);

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
          <h1 className="mt-2 text-4xl font-bold">Housekeeping</h1>
          <p className="mt-2 text-slate-500">
            Cleaning, restocking, and other housekeeping tasks — separate
            from the bed-level Vacant/Cleaning status shown on the room
            boards.
          </p>
        </div>

        <HousekeepingView
          tasks={tasks}
          hostelNames={hostels.map((h) => h.hostel_name)}
        />
      </div>
    </main>
  );
}
