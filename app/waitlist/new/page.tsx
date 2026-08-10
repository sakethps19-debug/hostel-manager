import NewWaitlistForm from "./NewWaitlistForm";
import { requirePermission } from "@/lib/auth";

export default async function NewWaitlistPage() {
  await requirePermission("manageOperationalRecords");

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <a
          href="/waitlist"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Waitlist
        </a>

        <div className="mt-7">
          <h1 className="text-4xl font-bold">Add to Waitlist</h1>
          <p className="mt-2 text-slate-500">
            We&apos;ll surface a match here as soon as a bed fitting these
            preferences becomes available — nothing books automatically.
          </p>
        </div>

        <NewWaitlistForm />
      </div>
    </main>
  );
}
