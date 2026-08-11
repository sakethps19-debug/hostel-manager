import ComplaintsTable from "./ComplaintsTable";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";

type ComplaintRow = {
  complaint_id: number;
  resident_id: number | null;
  full_name: string | null;
  hostel_name: string | null;
  room_number: string | null;
  bed_code: string | null;
  category: string;
  description: string;
  priority: string;
  status: string;
  resolution: string | null;
  created_at: string;
  closed_at: string | null;
};

type EscalationRow = {
  escalation_id: number;
  complaint_id: number;
  escalated_to: string;
  reason: string;
  escalated_by_name: string | null;
  escalated_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
};

async function getComplaints(): Promise<ComplaintRow[]> {
  return callRpcServer<ComplaintRow[]>("get_complaints");
}

async function getComplaintEscalations(): Promise<EscalationRow[]> {
  return callRpcServer<EscalationRow[]>("get_complaint_escalations");
}

export default async function ComplaintsPage() {
  await requirePermission("manageOperationalRecords");

  const [complaints, escalations] = await Promise.all([
    getComplaints(),
    getComplaintEscalations(),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <a
          href="/"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Dashboard
        </a>

        <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              Hostel Management
            </p>
            <h1 className="mt-2 text-4xl font-bold">Complaints</h1>
            <p className="mt-2 text-slate-500">
              {complaints.length} complaint{complaints.length === 1 ? "" : "s"}{" "}
              on record.
            </p>
          </div>

          <a
            href="/complaints/new"
            className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            + Log Complaint
          </a>
        </div>

        <ComplaintsTable complaints={complaints} escalations={escalations} />
      </div>
    </main>
  );
}
