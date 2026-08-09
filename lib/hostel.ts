export type HostelSummary = {
  hostel_id: number;
  hostel_name: string;
  floors: number;
  rooms: number;
  total_beds: number;
  occupied_beds: number;
  vacant_beds: number;
};

export function slugifyHostelName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "-");
}

export async function getHostelList(): Promise<HostelSummary[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/get_hostel_dashboard`,
    {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to load hostel list: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
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
