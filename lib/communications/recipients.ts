import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { getHostelList } from "@/lib/hostel";

export type RecipientCandidate = {
  residentId: number;
  bookingId: number;
  fullName: string;
  mobileNumber: string | null;
  hostelName: string;
  roomNumber: string;
  bedCode: string | null;
  floorNumber: number | null;
  monthlyRent: number;
  outstanding: number;
  isActive: boolean;
  isOverdue: boolean;
  isVacatingSoon: boolean;
  isCheckinToday: boolean;
  isDepositPending: boolean;
  isDocumentPending: boolean;
};

const ACTIVE_STATUSES = ["confirmed", "checked_in"];

type ResidentMasterRow = {
  resident_id: number;
  booking_id: number;
  full_name: string;
  mobile_number: string | null;
  hostel_name: string;
  room_number: string;
  bed_code: string | null;
  monthly_rent: number;
  outstanding_rent: number;
  booking_status: string;
  id_proof_number: string | null;
  photo_storage_path: string | null;
};

type BedGridRow = {
  room_number: string;
  floor_number: number;
};

type RentLedgerRow = {
  resident_id: number;
  balance_outstanding: number;
};

type UpcomingVacancyRow = {
  resident_id: number;
};

type TodayCheckinRow = {
  resident_id: number;
};

type DepositRow = {
  resident_id: number;
  deposit_agreed: number;
  deposit_received: number;
};

async function getRoomFloorMap(): Promise<Map<string, number>> {
  const hostels = await getHostelList();
  const map = new Map<string, number>();

  await Promise.all(
    hostels.map(async (h) => {
      const beds = await callRpcServer<BedGridRow[]>("get_hostel_bed_grid", {
        p_hostel_name: h.hostel_name,
      });
      for (const bed of beds) {
        map.set(`${h.hostel_name}|${bed.room_number}`, bed.floor_number);
      }
    })
  );

  return map;
}

// Builds the full active-resident roster with the flags needed for the
// broadcast recipient filters, composing only already-working RPCs (each
// used elsewhere in the app for its own report page) rather than querying
// any table directly.
export async function getRecipientCandidates(): Promise<RecipientCandidate[]> {
  const [residents, roomFloorMap, ledger, vacancies, checkins, deposits] =
    await Promise.all([
      callRpcServer<ResidentMasterRow[]>("get_resident_master_list"),
      getRoomFloorMap(),
      callRpcServer<RentLedgerRow[]>("get_rent_ledger_all"),
      callRpcServer<UpcomingVacancyRow[]>("get_upcoming_vacancies", { p_days: 30 }),
      callRpcServer<TodayCheckinRow[]>("get_todays_checkins"),
      callRpcServer<DepositRow[]>("get_deposit_reconciliation"),
    ]);

  const overdueIds = new Set(
    ledger.filter((r) => r.balance_outstanding > 0).map((r) => r.resident_id)
  );
  const vacatingSoonIds = new Set(vacancies.map((r) => r.resident_id));
  const checkinTodayIds = new Set(checkins.map((r) => r.resident_id));
  const depositPendingIds = new Set(
    deposits.filter((r) => r.deposit_agreed > r.deposit_received).map((r) => r.resident_id)
  );
  const documentPendingIds = new Set(
    residents
      .filter((r) => !r.id_proof_number || !r.photo_storage_path)
      .map((r) => r.resident_id)
  );

  return residents.map((r) => ({
    residentId: r.resident_id,
    bookingId: r.booking_id,
    fullName: r.full_name,
    mobileNumber: r.mobile_number,
    hostelName: r.hostel_name,
    roomNumber: r.room_number,
    bedCode: r.bed_code,
    floorNumber: roomFloorMap.get(`${r.hostel_name}|${r.room_number}`) ?? null,
    monthlyRent: r.monthly_rent,
    outstanding: r.outstanding_rent,
    isActive: ACTIVE_STATUSES.includes(r.booking_status),
    isOverdue: overdueIds.has(r.resident_id),
    isVacatingSoon: vacatingSoonIds.has(r.resident_id),
    isCheckinToday: checkinTodayIds.has(r.resident_id),
    isDepositPending: depositPendingIds.has(r.resident_id),
    isDocumentPending: documentPendingIds.has(r.resident_id),
  }));
}
