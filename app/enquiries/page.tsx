import EnquiriesTable from "./EnquiriesTable";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";

type EnquiryRow = {
  enquiry_id: number;
  full_name: string;
  mobile_number: string;
  preferred_hostel: string | null;
  preferred_sharing: number | null;
  budget: number | null;
  expected_joining_date: string | null;
  source: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

async function getEnquiries(): Promise<EnquiryRow[]> {
  return callRpcServer<EnquiryRow[]>("get_enquiries");
}

export default async function EnquiriesPage() {
  await requirePermission("manageOperationalRecords");

  const enquiries = await getEnquiries();

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
            <h1 className="mt-2 text-4xl font-bold">Enquiries</h1>
            <p className="mt-2 text-slate-500">
              {enquiries.length} enquir{enquiries.length === 1 ? "y" : "ies"}{" "}
              on record.
            </p>
          </div>

          <a
            href="/enquiries/new"
            className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            + New Enquiry
          </a>
        </div>

        <EnquiriesTable enquiries={enquiries} />
      </div>
    </main>
  );
}
