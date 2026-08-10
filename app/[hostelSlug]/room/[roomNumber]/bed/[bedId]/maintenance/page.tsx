import { notFound } from "next/navigation";
import { resolveHostelName } from "@/lib/hostel";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import MaintenanceForm from "./MaintenanceForm";
import CompleteMaintenanceButton from "./CompleteMaintenanceButton";

type BedRow = {
  bed_id: number;
  bed_code: string | null;
  bed_number: string;
  bed_status: string;
};

type MaintenanceRecord = {
  maintenance_id: number;
  reason: string;
  start_date: string;
  expected_completion_date: string | null;
  actual_completion_date: string | null;
  notes: string | null;
  cost: number | null;
  status: string;
};

type PageProps = {
  params: Promise<{
    hostelSlug: string;
    roomNumber: string;
    bedId: string;
  }>;
};

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function BedMaintenancePage({ params }: PageProps) {
  const { hostelSlug, roomNumber, bedId } = await params;

  const hostelName = await resolveHostelName(hostelSlug);

  if (!hostelName) {
    notFound();
  }

  const beds = await callRpcServer<BedRow[]>("get_room_beds", {
    p_hostel_name: hostelName,
    p_room_number: roomNumber,
  });

  const bed = beds.find((b) => b.bed_id === Number(bedId));

  if (!bed) {
    notFound();
  }

  const history = await callRpcServer<MaintenanceRecord[]>(
    "get_bed_maintenance_history",
    { p_bed_id: Number(bedId) }
  );

  const openRecord = history.find((h) => h.status === "open") || null;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <a
          href={`/${hostelSlug}/room/${roomNumber}`}
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Room {roomNumber}
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            {hostelName} · Room {roomNumber}
          </p>

          <h1 className="mt-2 text-4xl font-bold">
            {bed.bed_code || bed.bed_number}
          </h1>

          <p className="mt-2 text-slate-500">
            {openRecord ? "Under Maintenance" : "Maintenance"}
          </p>
        </div>

        {openRecord ? (
          <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">Maintenance In Progress</h2>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-400">Reason</p>
                <p className="mt-1 font-semibold">{openRecord.reason}</p>
              </div>

              <div>
                <p className="text-xs text-slate-400">Start Date</p>
                <p className="mt-1 font-semibold">
                  {formatDate(openRecord.start_date)}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-400">
                  Expected Completion
                </p>
                <p className="mt-1 font-semibold">
                  {openRecord.expected_completion_date
                    ? formatDate(openRecord.expected_completion_date)
                    : "Not set"}
                </p>
              </div>

              {openRecord.cost !== null && (
                <div>
                  <p className="text-xs text-slate-400">Cost</p>
                  <p className="mt-1 font-semibold">
                    Rs. {Number(openRecord.cost).toLocaleString("en-IN")}
                  </p>
                </div>
              )}
            </div>

            {openRecord.notes && (
              <p className="mt-4 text-sm text-slate-600">
                {openRecord.notes}
              </p>
            )}

            <div className="mt-6">
              <CompleteMaintenanceButton
                maintenanceId={openRecord.maintenance_id}
                hostelSlug={hostelSlug}
                roomNumber={roomNumber}
              />
            </div>
          </div>
        ) : (
          <MaintenanceForm
            bedId={Number(bedId)}
            hostelSlug={hostelSlug}
            roomNumber={roomNumber}
          />
        )}

        {history.filter((h) => h.status === "closed").length > 0 && (
          <div className="mt-8">
            <h3 className="text-sm font-semibold text-slate-700">
              Maintenance History
            </h3>

            <div className="mt-3 space-y-2">
              {history
                .filter((h) => h.status === "closed")
                .map((h) => (
                  <div
                    key={h.maintenance_id}
                    className="rounded-xl border border-slate-200 bg-white p-4 text-sm"
                  >
                    <p className="font-semibold">{h.reason}</p>
                    <p className="mt-1 text-slate-500">
                      {formatDate(h.start_date)} →{" "}
                      {h.actual_completion_date
                        ? formatDate(h.actual_completion_date)
                        : "-"}
                      {h.cost !== null
                        ? ` · Rs. ${Number(h.cost).toLocaleString("en-IN")}`
                        : ""}
                    </p>
                    {h.notes && (
                      <p className="mt-1 text-slate-500">{h.notes}</p>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
