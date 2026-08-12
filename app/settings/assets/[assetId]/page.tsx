import { notFound } from "next/navigation";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission, getMyRole } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getHostelList } from "@/lib/hostel";
import { getAssetCategories } from "@/lib/accounting/queries";
import AssetDetailView from "./AssetDetailView";
import type {
  AssetRow,
  AssetTransferRow,
  AssetDocumentRow,
  AssetDisposalRow,
  AssetDepreciationEntryRow,
} from "../types";

type VendorRow = {
  vendor_id: number;
  name: string;
  is_active: boolean;
};

type MaintenanceRow = {
  maintenance_id: number;
  bed_id: number;
  reason: string;
  start_date: string;
  expected_completion_date: string | null;
  actual_completion_date: string | null;
  notes: string | null;
  cost: number | null;
  status: string;
};

type PageProps = {
  params: Promise<{ assetId: string }>;
};

export default async function AssetDetailPage({ params }: PageProps) {
  await requirePermission("viewAssetRegister");
  const role = await getMyRole();
  const canManageFinance = hasPermission(role, "manageAssetFinance");

  const { assetId } = await params;
  const assetIdNum = Number(assetId);

  const assetRows = await callRpcServer<AssetRow[]>("get_asset_by_id", { p_asset_id: assetIdNum });
  const rawAsset = assetRows.length > 0 ? assetRows[0] : null;
  if (!rawAsset) notFound();

  // Strip finance figures from the payload for roles that shouldn't see
  // them - AssetDetailView only renders these inside its canManageFinance
  // block, but the RSC payload ships every prop to the browser regardless.
  const asset: AssetRow = canManageFinance
    ? rawAsset
    : {
        ...rawAsset,
        purchase_cost: null,
        accumulated_depreciation: 0,
        residual_value: 0,
        invoice_number: null,
        payment_mode: null,
        vendor_id: null,
        gl_account_id: null,
      };

  const [hostels, categories, vendors, transfers, documents, maintenanceHistory, disposalRows, depreciationEntries] =
    await Promise.all([
      getHostelList(),
      getAssetCategories(),
      callRpcServer<VendorRow[]>("get_vendors"),
      callRpcServer<AssetTransferRow[]>("get_asset_transfers", { p_asset_id: assetIdNum }),
      callRpcServer<AssetDocumentRow[]>("get_asset_documents", { p_asset_id: assetIdNum }),
      callRpcServer<MaintenanceRow[]>("get_asset_maintenance_history", { p_asset_id: assetIdNum }),
      callRpcServer<AssetDisposalRow[]>("get_asset_disposal", { p_asset_id: assetIdNum }),
      callRpcServer<AssetDepreciationEntryRow[]>("get_asset_depreciation_entries", { p_asset_id: assetIdNum }),
    ]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <a href="/settings/assets" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
          ← Back to Asset Register
        </a>

        <AssetDetailView
          asset={asset}
          hostelNames={hostels.map((h) => h.hostel_name)}
          categories={categories}
          vendors={vendors.filter((v) => v.is_active)}
          initialTransfers={transfers}
          initialDocuments={documents}
          maintenanceHistory={maintenanceHistory}
          disposal={canManageFinance && disposalRows.length > 0 ? disposalRows[0] : null}
          depreciationEntries={canManageFinance ? depreciationEntries : []}
          canManageFinance={canManageFinance}
        />
      </div>
    </main>
  );
}
