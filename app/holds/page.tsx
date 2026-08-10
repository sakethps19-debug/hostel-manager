import { slugifyHostelName } from "@/lib/hostel";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import ReleaseHoldButton from "@/components/ReleaseHoldButton";

type BedHoldRow = {
  hold_id: number;
  bed_id: number;
  bed_code: string | null;
  bed_number: string;
  hostel_name: string;
  room_number: string;
  prospect_name: string;
  prospect_mobile: string | null;
  hold_start_at: string;
  hold_expiry_at: string;
  notes: string | null;
};

async function getActiveHolds(): Promise<BedHoldRow[]> {
  return callRpcServer<BedHoldRow[]>("get_active_bed_holds");
}

function formatTime(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function remainingLabel(expiryIso: string) {
  const diffMs = new Date(expiryIso).getTime() - Date.now();

  if (diffMs <= 0) {
    return { label: "Expired — awaiting release", overdue: true };
  }

  const minutes = Math.round(diffMs / 60000);

  if (minutes < 60) {
    return { label: `${minutes} min remaining`, overdue: false };
  }

  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;

  return {
    label: `${hours}h ${remMinutes}m remaining`,
    overdue: false,
  };
}

export default async function HoldsPage() {
  await requirePermission("manageOperationalRecords");

  await callRpcServer("release_expired_holds").catch(() => {});

  const holds = await getActiveHolds();

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
          <h1 className="mt-2 text-4xl font-bold">Bed Holds</h1>
          <p className="mt-2 text-slate-500">
            Beds temporarily held for a prospective resident. Nothing books
            automatically — release a hold to make the bed available again,
            or book it directly for the prospect.
          </p>
        </div>

        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {holds.length === 0 ? (
            <div className="px-6 py-16 text-center text-slate-500">
              No beds are currently on hold.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Prospect</th>
                    <th className="px-6 py-4">Bed</th>
                    <th className="px-6 py-4">Held Since</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {holds.map((hold) => {
                    const remaining = remainingLabel(hold.hold_expiry_at);

                    return (
                      <tr key={hold.hold_id} className="hover:bg-slate-50">
                        <td className="px-6 py-5">
                          <p className="font-semibold text-slate-900">
                            {hold.prospect_name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {hold.prospect_mobile || "No mobile number"}
                          </p>
                          {hold.notes && (
                            <p className="mt-1 text-xs text-slate-400">
                              {hold.notes}
                            </p>
                          )}
                        </td>

                        <td className="px-6 py-5">
                          <p className="font-medium">{hold.hostel_name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Room {hold.room_number} ·{" "}
                            {hold.bed_code || hold.bed_number}
                          </p>
                        </td>

                        <td className="px-6 py-5 whitespace-nowrap">
                          {formatTime(hold.hold_start_at)}
                        </td>

                        <td className="px-6 py-5">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              remaining.overdue
                                ? "bg-red-50 text-red-700"
                                : "bg-violet-50 text-violet-700"
                            }`}
                          >
                            {remaining.label}
                          </span>
                          <p className="mt-1 text-xs text-slate-400">
                            Expires {formatTime(hold.hold_expiry_at)}
                          </p>
                        </td>

                        <td className="px-6 py-5 text-right">
                          <div className="flex flex-wrap justify-end gap-3">
                            <a
                              href={`/${slugifyHostelName(hold.hostel_name)}/room/${hold.room_number}/book/${hold.bed_id}?name=${encodeURIComponent(hold.prospect_name)}&mobile=${hold.prospect_mobile || ""}`}
                              className="font-semibold text-indigo-600 hover:text-indigo-700"
                            >
                              Book →
                            </a>

                            <ReleaseHoldButton
                              bedId={hold.bed_id}
                              className="font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
