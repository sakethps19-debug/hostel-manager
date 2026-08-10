export type ChecklistType = "move_in" | "move_out";

export type ChecklistItemDef = {
  key: string;
  label: string;
};

export const MOVE_IN_CHECKLIST_ITEMS: ChecklistItemDef[] = [
  { key: "id_proof_verified", label: "ID Proof Verified" },
  { key: "photo_captured", label: "Resident Photo Captured" },
  { key: "deposit_collected", label: "Security Deposit Collected" },
  { key: "agreement_signed", label: "Agreement Signed" },
  { key: "key_handover", label: "Room/Bed Key Handed Over" },
  { key: "room_condition_checked", label: "Room Condition Checked" },
  { key: "emergency_contact_confirmed", label: "Emergency Contact Confirmed" },
];

export const MOVE_OUT_CHECKLIST_ITEMS: ChecklistItemDef[] = [
  { key: "notice_period_confirmed", label: "Notice Period Confirmed" },
  { key: "final_rent_settled", label: "Final Rent Settled" },
  { key: "deposit_refund_processed", label: "Security Deposit Refund Processed" },
  { key: "key_returned", label: "Room/Bed Key Returned" },
  { key: "room_condition_inspected", label: "Room Condition Inspected" },
  { key: "damage_charges_assessed", label: "Damage Charges Assessed (if any)" },
  { key: "belongings_removed", label: "Belongings Removed" },
  { key: "documents_returned", label: "Documents Returned" },
];

export function getChecklistItems(type: ChecklistType): ChecklistItemDef[] {
  return type === "move_in" ? MOVE_IN_CHECKLIST_ITEMS : MOVE_OUT_CHECKLIST_ITEMS;
}
