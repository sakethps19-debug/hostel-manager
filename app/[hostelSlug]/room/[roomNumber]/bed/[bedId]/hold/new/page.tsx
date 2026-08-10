import { notFound } from "next/navigation";
import { resolveHostelName } from "@/lib/hostel";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import HoldForm from "./HoldForm";

type BedRow = {
  bed_id: number;
  bed_code: string | null;
  bed_number: string;
  bed_status: string;
};

type PageProps = {
  params: Promise<{
    hostelSlug: string;
    roomNumber: string;
    bedId: string;
  }>;
};

export default async function NewBedHoldPage({ params }: PageProps) {
  await requirePermission("manageOperationalRecords");

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

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-xl">
        <a
          href={`/${hostelSlug}/room/${roomNumber}`}
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Room {roomNumber}
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            {hostelName} · Room {roomNumber} · {bed.bed_code || bed.bed_number}
          </p>

          <h1 className="mt-2 text-4xl font-bold">Hold This Bed</h1>

          <p className="mt-2 text-slate-500">
            Temporarily takes this bed off Find-a-Bed for a prospect. It is
            automatically released once the hold expires if not converted to
            a booking.
          </p>
        </div>

        <HoldForm
          hostelSlug={hostelSlug}
          roomNumber={roomNumber}
          bedId={bed.bed_id}
        />
      </div>
    </main>
  );
}
