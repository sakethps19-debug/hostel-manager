import { requirePermission } from "@/lib/auth";
import EditResidentForm from "./EditResidentForm";

type PageProps = {
  params: Promise<{
    hostelSlug: string;
    roomNumber: string;
    bedId: string;
  }>;
};

export default async function EditResidentPage({ params }: PageProps) {
  await requirePermission("manageBookings");

  const { hostelSlug, roomNumber, bedId } = await params;

  return (
    <EditResidentForm
      hostelSlug={hostelSlug}
      roomNumber={roomNumber}
      bedId={Number(bedId)}
    />
  );
}
