import PnlView from "./PnlView";

type PnlRow = {
  hostel_name: string;
  rent_revenue: number;
  other_revenue: number;
  operating_expenses: number;
  net_surplus: number;
};

type MetricsRow = {
  hostel_name: string;
  total_beds: number;
  occupied_beds: number;
  occupancy_pct: number;
  outstanding_rent_total: number;
  deposits_held_total: number;
};

type PageProps = {
  searchParams: Promise<{ month?: string; year?: string }>;
};

async function callRpc<T>(name: string, body: object): Promise<T> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`${name} failed: ${await response.text()}`);
  }

  return response.json();
}

export default async function PnlPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const now = new Date();
  const month = Number(params.month) || now.getMonth() + 1;
  const year = Number(params.year) || now.getFullYear();

  const [pnl, metrics] = await Promise.all([
    callRpc<PnlRow[]>("get_hostel_pnl", { p_month: month, p_year: year }),
    callRpc<MetricsRow[]>("get_hostel_metrics_snapshot", {}),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
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
          <h1 className="mt-2 text-4xl font-bold">Hostel P&amp;L</h1>
          <p className="mt-2 text-slate-500">
            Occupancy, outstanding rent, and deposits held below are
            current-moment figures, not historical for the selected month.
          </p>
        </div>

        <PnlView pnl={pnl} metrics={metrics} month={month} year={year} />
      </div>
    </main>
  );
}
