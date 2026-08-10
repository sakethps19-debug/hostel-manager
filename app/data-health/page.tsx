import { slugifyHostelName } from "@/lib/hostel";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";

type ResidentRow = {
  resident_id: number;
  booking_id: number;
  full_name: string;
  mobile_number: string | null;
  id_proof_number: string | null;
  hostel_name: string;
  room_number: string;
  bed_id: number;
  bed_code: string | null;
  monthly_rent: number;
  booking_status: string;
  photo_storage_path: string | null;
};

type EmergencyRow = {
  resident_id: number;
  full_name: string;
  hostel_name: string;
  room_number: string;
  bed_code: string | null;
  bed_number: string;
  emergency_contact_name: string | null;
  emergency_contact_mobile: string | null;
};

type FlaggedResident = {
  residentId: number;
  fullName: string;
  hostelName: string;
  roomNumber: string;
  bedId: number;
  bedCode: string | null;
  detail?: string;
};

function Category({
  title,
  items,
}: {
  title: string;
  items: FlaggedResident[];
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-700">{title}</h2>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            items.length > 0
              ? "bg-red-50 text-red-700"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {items.length}
        </span>
      </div>

      {items.length > 0 && (
        <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm">
          {items.map((item) => (
            <li key={item.residentId}>
              <a
                href={`/${slugifyHostelName(item.hostelName)}/room/${item.roomNumber}/resident/${item.bedId}`}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
              >
                <span className="text-indigo-600 hover:text-indigo-700">
                  {item.fullName}
                </span>
                <span className="text-xs text-slate-400">
                  {item.hostelName} · {item.bedCode || item.roomNumber}
                  {item.detail ? ` · ${item.detail}` : ""}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function DataHealthPage() {
  await requirePermission("manageUsers");

  const [residents, emergencyRows] = await Promise.all([
    callRpcServer<ResidentRow[]>("get_resident_master_list"),
    callRpcServer<EmergencyRow[]>("get_emergency_directory"),
  ]);

  const active = residents.filter(
    (r) => r.booking_status === "confirmed" || r.booking_status === "checked_in"
  );

  const toFlagged = (r: ResidentRow, detail?: string): FlaggedResident => ({
    residentId: r.resident_id,
    fullName: r.full_name,
    hostelName: r.hostel_name,
    roomNumber: r.room_number,
    bedId: r.bed_id,
    bedCode: r.bed_code,
    detail,
  });

  const missingPhoto = active
    .filter((r) => !r.photo_storage_path)
    .map((r) => toFlagged(r));

  const missingIdProof = active
    .filter((r) => !r.id_proof_number)
    .map((r) => toFlagged(r));

  const invalidMobile = active
    .filter((r) => !r.mobile_number || !/^\d{10}$/.test(r.mobile_number))
    .map((r) => toFlagged(r, r.mobile_number || "no mobile"));

  const missingRent = active
    .filter((r) => !r.monthly_rent || Number(r.monthly_rent) <= 0)
    .map((r) => toFlagged(r));

  const mobileCounts = new Map<string, number>();
  for (const r of active) {
    if (r.mobile_number) {
      mobileCounts.set(r.mobile_number, (mobileCounts.get(r.mobile_number) || 0) + 1);
    }
  }
  const duplicateMobile = active
    .filter((r) => r.mobile_number && (mobileCounts.get(r.mobile_number) || 0) > 1)
    .map((r) => toFlagged(r, r.mobile_number || undefined));

  const missingEmergencyContact = emergencyRows
    .filter((r) => !r.emergency_contact_name && !r.emergency_contact_mobile)
    .map((r) => ({
      residentId: r.resident_id,
      fullName: r.full_name,
      hostelName: r.hostel_name,
      roomNumber: r.room_number,
      bedId:
        active.find((a) => a.resident_id === r.resident_id)?.bed_id ?? 0,
      bedCode: r.bed_code,
    }))
    .filter((r) => r.bedId !== 0);

  const categories: [string, FlaggedResident[]][] = [
    ["Missing Resident Photo", missingPhoto],
    ["Missing ID Proof", missingIdProof],
    ["Invalid or Missing Mobile Number", invalidMobile],
    ["Missing Emergency Contact", missingEmergencyContact],
    ["Booking Without Agreed Rent", missingRent],
    ["Resident With Duplicate Mobile Number", duplicateMobile],
  ];

  const totalIssues = categories.reduce((sum, [, items]) => sum + items.length, 0);

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
            Owner / Admin
          </p>
          <h1 className="mt-2 text-4xl font-bold">Data Health</h1>
          <p className="mt-2 text-slate-500">
            {totalIssues} data-quality issue{totalIssues === 1 ? "" : "s"}{" "}
            across current residents. Each item links to the affected
            record.
          </p>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {categories.map(([title, items]) => (
            <Category key={title} title={title} items={items} />
          ))}
        </div>

        <p className="mt-6 text-xs text-slate-400">
          Not yet covered here (would need new schema/RPCs not built yet):
          missing home address, deposit status missing, payments without a
          reference number, unexpected booking statuses, and
          orphaned/invalid records. These are flagged as a known gap rather
          than guessed at.
        </p>
      </div>
    </main>
  );
}
