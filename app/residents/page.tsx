import ResidentSearchTable from "./ResidentSearchTable";

type ResidentRow = {
  resident_id: number;
  booking_id: number;
  full_name: string;
  mobile_number: string | null;
  id_proof_number: string | null;
  hostel_name: string;
  room_number: string;
  bed_id: number;
  bed_code: string | null;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  outstanding_rent: number;
  booking_status: string;
};

async function getResidentMasterList(): Promise<ResidentRow[]> {
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
    throw new Error(
      `Failed to load resident master list: ${await response.text()}`
    );
  }

  return response.json();
}

export default async function ResidentsPage() {
  const residents = await getResidentMasterList();

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <a
          href="/"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Dashboard
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Hostel Management
          </p>

          <h1 className="mt-2 text-4xl font-bold">Residents</h1>

          <p className="mt-2 text-slate-500">
            Search and manage all residents across every hostel.
          </p>
        </div>

        <ResidentSearchTable residents={residents} />
      </div>
    </main>
  );
}
