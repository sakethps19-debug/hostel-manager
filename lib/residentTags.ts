import { callRpcServer } from "@/lib/supabase/callRpcServer";

export type ResidentTagRow = { resident_id: number; tag_label: string };

export async function getAllResidentTagRows(): Promise<ResidentTagRow[]> {
  return callRpcServer<ResidentTagRow[]>("get_all_resident_tags");
}

export function dedupeSortedTagLabels(rows: { tag_label: string }[]): string[] {
  return Array.from(new Set(rows.map((r) => r.tag_label))).sort();
}
