import WaitlistTable from "./WaitlistTable";
import { callRpcServer } from "@/lib/supabase/callRpcServer";

type WaitlistRow = {
  waitlist_id: number;
  full_name: string;
  mobile_number: string;
  preferred_hostel: string | null;
  preferred_sharing: number | null;
  preferred_floor: number | null;
  budget: number | null;
  expected_joining_date: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

type MatchRow = {
  waitlist_id: number;
  full_name: string;
  mobile_number: string;
  bed_id: number;
  bed_code: string | null;
  bed_number: string;
  hostel_name: string;
  room_number: string;
  sharing_type: number;
  monthly_rent: number;
};

export default async function WaitlistPage() {
  const [entries, matches] = await Promise.all([
    callRpcServer<WaitlistRow[]>("get_waitlist"),
    callRpcServer<MatchRow[]>("get_waitlist_matches"),
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
            <h1 className="mt-2 text-4xl font-bold">Waitlist</h1>
            <p className="mt-2 text-slate-500">
              {entries.length} {entries.length === 1 ? "entry" : "entries"} on
              record.
            </p>
          </div>

          <a
            href="/waitlist/new"
            className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            + Add to Waitlist
          </a>
        </div>

        {matches.length > 0 && (
          <section className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="font-semibold text-emerald-800">
              {matches.length} matching bed{matches.length === 1 ? "" : "s"}{" "}
              available for people waiting
            </p>
            <p className="mt-1 text-sm text-emerald-700">
              Nothing books automatically — review each match and confirm.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {matches.map((m) => (
                <div
                  key={`${m.waitlist_id}-${m.bed_id}`}
                  className="rounded-xl border border-emerald-200 bg-white p-4"
                >
                  <p className="font-semibold">{m.full_name}</p>
                  <p className="text-sm text-slate-500">{m.mobile_number}</p>
                  <p className="mt-2 text-sm text-slate-600">
                    {m.hostel_name} · Room {m.room_number} ·{" "}
                    {m.bed_code || m.bed_number} · {m.sharing_type} Sharing
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    {Number(m.monthly_rent) > 0
                      ? `Rs. ${Number(m.monthly_rent).toLocaleString("en-IN")}/month`
                      : "Rate not set"}
                  </p>

                  <a
                    href={`/find-bed?name=${encodeURIComponent(m.full_name)}&mobile=${m.mobile_number}&hostel=${encodeURIComponent(m.hostel_name)}&sharing=${m.sharing_type}`}
                    className="mt-3 block w-full rounded-xl bg-emerald-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Review & Book →
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}

        <WaitlistTable entries={entries} />
      </div>
    </main>
  );
}
