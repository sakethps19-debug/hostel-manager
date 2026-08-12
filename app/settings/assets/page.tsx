import AssetsTable from "./AssetsTable";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission, getMyRole } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getHostelList } from "@/lib/hostel";
import type { AssetRow } from "./types";

async function getAssets(): Promise<AssetRow[]> {
  return callRpcServer<AssetRow[]>("get_assets");
}

export default async function AssetsPage() {
  await requirePermission("manageMaintenance");
  const role = await getMyRole();
  const canManageFinance = hasPermission(role, "manageAssetFinance");

  const [rawAssets, hostels] = await Promise.all([
    getAssets(),
    getHostelList(),
  ]);

  // Strip finance figures from the payload itself for roles that shouldn't
  // see them - the client component's conditional rendering alone isn't
  // enough, since Next.js still ships every prop to the browser in the RSC
  // payload regardless of what's rendered.
  const assets = canManageFinance
    ? rawAssets
    : rawAssets.map((a) => ({
        ...a,
        purchase_cost: null,
        accumulated_depreciation: 0,
        residual_value: 0,
        invoice_number: null,
        payment_mode: null,
        vendor_id: null,
        gl_account_id: null,
      }));

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
          canManageFinance={canManageFinance}
        />
      </div>
    </main>
  );
}
