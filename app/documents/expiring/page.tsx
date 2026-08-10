import { slugifyHostelName } from "@/lib/hostel";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";

type ExpiringDocRow = {
  resident_id: number;
  full_name: string;
  hostel_name: string;
  room_number: string;
  bed_id: number;
  bed_code: string | null;
  bed_number: string;
  document_type: string;
  expiry_date: string;
};

async function getExpiringDocuments(): Promise<ExpiringDocRow[]> {
  return callRpcServer<ExpiringDocRow[]>("get_expiring_documents");
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(dateStr: string) {
  const diff =
    new Date(`${dateStr}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.round(diff / 86400000);
}

export default async function ExpiringDocumentsPage() {
  await requirePermission("manageDocuments");

  const rows = await getExpiringDocuments();

  const expired = rows.filter((r) => daysUntil(r.expiry_date) < 0);
  const within7 = rows.filter((r) => {
    const d = daysUntil(r.expiry_date);
    return d >= 0 && d <= 7;
  });
  const within30 = rows.filter((r) => {
    const d = daysUntil(r.expiry_date);
    return d > 7 && d <= 30;
  });

  const groups: [string, string, ExpiringDocRow[]][] = [
    ["Expired", "text-red-700", expired],
    ["Expiring in 7 Days", "text-red-700", within7],
    ["Expiring in 30 Days", "text-amber-700", within30],
  ];

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">
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
          <h1 className="mt-2 text-4xl font-bold">Document Expiry Alerts</h1>
          <p className="mt-2 text-slate-500">
            Agreement, police verification, and other tracked document
            expiries — independent of booking end dates.
          </p>
        </div>

        <div className="mt-8 space-y-8">
          {groups.map(([title, colorClass, list]) => (
            <section key={title}>
              <h2 className={`text-sm font-semibold uppercase tracking-wide ${colorClass}`}>
                {title} ({list.length})
              </h2>

              {list.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">None.</p>
              ) : (
                <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <ul className="divide-y divide-slate-100">
                    {list.map((row) => (
                      <li key={`${row.resident_id}-${row.document_type}`}>
                        <a
                          href={`/${slugifyHostelName(row.hostel_name)}/room/${row.room_number}/resident/${row.bed_id}`}
                          className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50"
                        >
                          <div>
                            <p className="font-semibold text-slate-900">
                              {row.full_name}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {row.hostel_name} · Room {row.room_number} ·{" "}
                              {row.bed_code || row.bed_number}
                            </p>
                          </div>

                          <p className="text-sm text-slate-500">
                            {row.document_type} · {formatDate(row.expiry_date)}
                          </p>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
