import { callRpcServer } from "./supabase/callRpcServer";
import { slugifyHostelName } from "./hostelSlug";

export { slugifyHostelName };

export type HostelSummary = {
  hostel_id: number;
  hostel_name: string;
  floors: number;
  rooms: number;
  total_beds: number;
  occupied_beds: number;
  vacant_beds: number;
};

export async function getHostelList(): Promise<HostelSummary[]> {
  return callRpcServer<HostelSummary[]>("get_hostel_dashboard");
}

export async function resolveHostelName(
  hostelSlug: string
): Promise<string | null> {
  const hostels = await getHostelList();

  const match = hostels.find(
    (hostel) => slugifyHostelName(hostel.hostel_name) === hostelSlug
  );

  return match ? match.hostel_name : null;
}
