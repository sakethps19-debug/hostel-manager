import GlobalSearchForm from "@/components/GlobalSearchForm";
import { slugifyHostelName } from "@/lib/hostel";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { getMyRole } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

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

type BookingHistoryRow = {
  booking_id: number;
  resident_id: number;
  full_name: string;
  mobile_number: string | null;
  hostel_name: string;
  room_number: string;
  bed_code: string | null;
  booking_status: string;
};

type EnquiryRow = {
  enquiry_id: number;
  full_name: string;
  mobile_number: string;
  preferred_hostel: string | null;
  status: string;
};

type WaitlistRow = {
  waitlist_id: number;
  full_name: string;
  mobile_number: string;
  preferred_hostel: string | null;
  status: string;
};

type PageProps = {
  searchParams: Promise<{ q?: string }>;
};

function matches(query: string, ...fields: (string | null | undefined)[]) {
  return fields.some((field) =>
    (field || "").toLowerCase().includes(query)
  );
}

export default async function SearchPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const query = (q || "").trim();
  const normalized = query.toLowerCase();

  const role = await getMyRole();
  const canManageOperationalRecords = hasPermission(
    role,
    "manageOperationalRecords"
  );

  let residentMatches: ResidentRow[] = [];
  let historyMatches: BookingHistoryRow[] = [];
  let enquiryMatches: EnquiryRow[] = [];
  let waitlistMatches: WaitlistRow[] = [];

  if (normalized.length >= 2) {
    const [residents, history, enquiries, waitlist] = await Promise.all([
      callRpcServer<ResidentRow[]>("get_resident_master_list"),
      callRpcServer<BookingHistoryRow[]>("get_booking_history"),
      canManageOperationalRecords
        ? callRpcServer<EnquiryRow[]>("get_enquiries")
        : Promise.resolve([]),
      canManageOperationalRecords
        ? callRpcServer<WaitlistRow[]>("get_waitlist")
        : Promise.resolve([]),
    ]);

    residentMatches = residents.filter((r) =>
      matches(
        normalized,
        r.full_name,
        r.mobile_number,
        r.room_number,
        r.bed_code,
        r.hostel_name
      )
    );

    const activeResidentIds = new Set(residentMatches.map((r) => r.booking_id));

    historyMatches = history.filter(
      (h) =>
        h.booking_status !== "confirmed" &&
        h.booking_status !== "checked_in" &&
        !activeResidentIds.has(h.booking_id) &&
        matches(
          normalized,
          h.full_name,
          h.mobile_number,
          h.room_number,
          h.bed_code,
          h.hostel_name
        )
    );

    enquiryMatches = enquiries.filter((e) =>
      matches(normalized, e.full_name, e.mobile_number, e.preferred_hostel)
    );

    waitlistMatches = waitlist.filter((w) =>
      matches(normalized, w.full_name, w.mobile_number, w.preferred_hostel)
    );
  }

  const totalMatches =
    residentMatches.length +
    historyMatches.length +
    enquiryMatches.length +
    waitlistMatches.length;

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

          <h1 className="mt-2 text-4xl font-bold">Search</h1>

          <p className="mt-2 text-slate-500">
            Find a resident, booking, enquiry, or waitlist entry by name,
            mobile number, room, or bed.
          </p>
        </div>

        <div className="mt-6">
          <GlobalSearchForm defaultValue={query} />
        </div>

        {normalized.length > 0 && normalized.length < 2 && (
          <p className="mt-8 text-sm text-slate-500">
            Type at least 2 characters to search.
          </p>
        )}

        {normalized.length >= 2 && totalMatches === 0 && (
          <p className="mt-8 text-sm text-slate-500">
            No results for &ldquo;{query}&rdquo;.
          </p>
        )}

        {residentMatches.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Residents ({residentMatches.length})
            </h2>

            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <ul className="divide-y divide-slate-100">
                {residentMatches.map((r) => (
                  <li key={r.booking_id}>
                    <a
                      href={`/${slugifyHostelName(r.hostel_name)}/room/${r.room_number}/resident/${r.bed_id}`}
                      className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50"
                    >
                      <div>
                        <p className="font-semibold">{r.full_name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {r.mobile_number || "No mobile number"}
                        </p>
                      </div>

                      <p className="text-sm text-slate-500">
                        {r.hostel_name} · Room {r.room_number} ·{" "}
                        {r.bed_code || "-"}
                      </p>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {historyMatches.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Past Bookings ({historyMatches.length})
            </h2>

            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <ul className="divide-y divide-slate-100">
                {historyMatches.map((h) => (
                  <li key={h.booking_id}>
                    <a
                      href="/history"
                      className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50"
                    >
                      <div>
                        <p className="font-semibold">{h.full_name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {h.mobile_number || "No mobile number"}
                        </p>
                      </div>

                      <p className="text-sm text-slate-500">
                        {h.hostel_name} · Room {h.room_number} ·{" "}
                        {h.bed_code || "-"} ·{" "}
                        <span className="capitalize">
                          {h.booking_status.replace("_", " ")}
                        </span>
                      </p>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {enquiryMatches.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Enquiries ({enquiryMatches.length})
            </h2>

            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <ul className="divide-y divide-slate-100">
                {enquiryMatches.map((e) => (
                  <li key={e.enquiry_id}>
                    <a
                      href="/enquiries"
                      className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50"
                    >
                      <div>
                        <p className="font-semibold">{e.full_name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {e.mobile_number}
                        </p>
                      </div>

                      <p className="text-sm text-slate-500">
                        {e.preferred_hostel || "No preference"} · {e.status}
                      </p>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {waitlistMatches.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Waitlist ({waitlistMatches.length})
            </h2>

            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <ul className="divide-y divide-slate-100">
                {waitlistMatches.map((w) => (
                  <li key={w.waitlist_id}>
                    <a
                      href="/waitlist"
                      className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50"
                    >
                      <div>
                        <p className="font-semibold">{w.full_name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {w.mobile_number}
                        </p>
                      </div>

                      <p className="text-sm text-slate-500">
                        {w.preferred_hostel || "No preference"} · {w.status}
                      </p>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
