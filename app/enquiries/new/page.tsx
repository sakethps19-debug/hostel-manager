import NewEnquiryForm from "./NewEnquiryForm";
import { requirePermission } from "@/lib/auth";

export default async function NewEnquiryPage() {
  await requirePermission("manageOperationalRecords");

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <a
          href="/enquiries"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Enquiries
        </a>

        <div className="mt-7">
          <h1 className="text-4xl font-bold">New Enquiry</h1>
          <p className="mt-2 text-slate-500">
            Record a prospective resident who hasn&apos;t booked yet.
          </p>
        </div>

        <NewEnquiryForm />
      </div>
    </main>
  );
}
