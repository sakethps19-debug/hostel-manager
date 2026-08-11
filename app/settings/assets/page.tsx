import AssetsTable from "./AssetsTable";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import { getHostelList } from "@/lib/hostel";

type AssetRow = {
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

async function getAssets(): Promise<AssetRow[]> {
  return callRpcServer<AssetRow[]>("get_assets");
}

export default async function AssetsPage() {
  await requirePermission("manageMaintenance");

  const [assets, hostels] = await Promise.all([
    getAssets(),
    getHostelList(),
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
          <h1 className="mt-2 text-4xl font-bold">Asset Register</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Furniture, appliances, and equipment tracked across hostels —
            purchase cost, condition, and warranty.
          </p>
        </div>

        <AssetsTable
          assets={assets}
          hostelNames={hostels.map((h) => h.hostel_name)}
        />
      </div>
    </main>
  );
}
