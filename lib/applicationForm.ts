import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { getResidentFileSignedUrlServer } from "@/lib/supabase/residentFilesServer";
import {
  type ApplicationFormBooking,
  type ApplicationFormProfileExtra,
} from "@/components/ApplicationFormDocument";

type RoomRow = {
  room_number: string;
  monthly_rent: number;
};

type DocumentRow = {
  document_type: string;
  is_primary: boolean;
  storage_path: string;
};

export async function getBookingDetails(
  bookingId: number
): Promise<ApplicationFormBooking | null> {
  const data = await callRpcServer<ApplicationFormBooking[]>(
    "get_booking_details",
    { p_booking_id: bookingId }
  );
  return data.length > 0 ? data[0] : null;
}

export async function getProfileExtra(
  residentId: number
): Promise<ApplicationFormProfileExtra> {
  const data = await callRpcServer<NonNullable<ApplicationFormProfileExtra>[]>(
    "get_resident_profile_extra",
    { p_resident_id: residentId }
  );
  return data.length > 0 ? data[0] : null;
}

export async function getStandardRate(
  hostelName: string,
  roomNumber: string
): Promise<number | null> {
  const rooms = await callRpcServer<RoomRow[]>("get_hostel_rooms", {
    p_hostel_name: hostelName,
  });
  const room = rooms.find((r) => r.room_number === roomNumber);
  return room ? room.monthly_rent : null;
}

export async function getPrimaryPhotoUrl(
  residentId: number
): Promise<string | null> {
  const documents = await callRpcServer<DocumentRow[]>("get_resident_documents", {
    p_resident_id: residentId,
  });
  const photo = documents.find(
    (d) => d.document_type === "Resident Photo" && d.is_primary
  );
  if (!photo) return null;
  return getResidentFileSignedUrlServer(photo.storage_path, 3600);
}

export async function getDeclarationText(): Promise<string | null> {
  try {
    return await callRpcServer<string | null>("get_text_setting", {
      p_key: "admission_form_declaration",
    });
  } catch {
    return null;
  }
}
