export type AssetRow = {
  asset_id: number;
  name: string;
  category: string;
  hostel_name: string | null;
  room_number: string | null;
  bed_code: string | null;
  bed_id: number | null;
  purchase_date: string | null;
  purchase_cost: number | null;
  condition: string;
  warranty_expiry: string | null;
  notes: string | null;
  created_at: string;
  // Extended fields (Accounting / Asset Register module)
  asset_code: string | null;
  description: string | null;
  floor_number: number | null;
  location_notes: string | null;
  vendor_id: number | null;
  invoice_number: string | null;
  payment_mode: string | null;
  serial_number: string | null;
  model: string | null;
  brand: string | null;
  warranty_start_date: string | null;
  useful_life_months: number | null;
  depreciation_method: "straight_line" | "none" | null;
  residual_value: number;
  depreciation_start_date: string | null;
  accumulated_depreciation: number;
  status: AssetStatus;
  last_service_date: string | null;
  next_service_date: string | null;
  capitalized: boolean;
  gl_account_id: number | null;
};

export type AssetStatus =
  | "in_use"
  | "available"
  | "under_maintenance"
  | "damaged"
  | "retired"
  | "sold"
  | "lost"
  | "written_off";

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  in_use: "In Use",
  available: "Available",
  under_maintenance: "Under Maintenance",
  damaged: "Damaged",
  retired: "Retired",
  sold: "Sold / Disposed",
  lost: "Lost",
  written_off: "Written Off",
};

export type AssetTransferRow = {
  transfer_id: number;
  asset_id: number;
  from_hostel_name: string | null;
  from_room_number: string | null;
  from_bed_code: string | null;
  to_hostel_name: string | null;
  to_room_number: string | null;
  to_bed_code: string | null;
  transfer_date: string;
  transferred_by: string | null;
  reason: string | null;
  notes: string | null;
  created_at: string;
};

export type AssetDocumentRow = {
  document_id: number;
  asset_id: number;
  document_type: "purchase_invoice" | "warranty" | "service_invoice" | "photograph" | "disposal_document" | "other";
  storage_path: string;
  notes: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
};

export type AssetDisposalRow = {
  disposal_id: number;
  asset_id: number;
  disposal_date: string;
  sale_proceeds: number;
  buyer: string | null;
  reason: string | null;
  book_value_at_disposal: number;
  gain_loss: number;
  journal_entry_id: number | null;
};

export type AssetDepreciationEntryRow = {
  depreciation_entry_id: number;
  asset_id: number;
  period_month: number;
  period_year: number;
  depreciation_amount: number;
  accumulated_depreciation_after: number;
  net_book_value_after: number;
};
