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
};
