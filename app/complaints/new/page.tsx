type ResidentRow = {
  resident_id: number;
  booking_id: number;
  full_name: string;
  mobile_number: string | null;
  hostel_name: string;
  room_number: string;
  bed_id: number;
  bed_code: string | null;
  booking_status: string;
};

import ComplaintForm from "./ComplaintForm";

async function getActiveResidents(): Promise<ResidentRow[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/get_resident_master_list`,
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
    throw new Error(`Failed to load residents: ${await response.text()}`);
  }

  const all: ResidentRow[] = await response.json();
  return all.filter((r) => r.booking_status === "checked_in");
}

export default async function NewComplaintPage() {
  const residents = await getActiveResidents();

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <a
          href="/complaints"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Complaints
        </a>

        <div className="mt-7">
          <h1 className="text-4xl font-bold">Log Complaint</h1>
          <p className="mt-2 text-slate-500">
            Link to a resident if this concerns their room/bed, or leave
            blank for a general hostel issue.
          </p>
        </div>

        <ComplaintForm residents={residents} />
      </div>
    </main>
  );
}
