import PurchaseRequestsView from "./PurchaseRequestsView";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import { getHostelList } from "@/lib/hostel";

type RequestRow = {
  request_id: number;
  hostel_name: string | null;
  item_description: string;
  quantity: number;
  estimated_cost: number | null;
  vendor_id: number | null;
  vendor_name: string | null;
  urgency: string;
  justification: string | null;
  status: string;
  requested_by_name: string | null;
  requested_at: string;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
};

type VendorRow = {
  vendor_id: number;
  name: string;
  is_active: boolean;
};

async function getRequests(): Promise<RequestRow[]> {
  return callRpcServer<RequestRow[]>("get_purchase_requests");
}

async function getVendors(): Promise<VendorRow[]> {
  return callRpcServer<VendorRow[]>("get_vendors");
}

export default async function PurchaseRequestsPage() {
  await requirePermission("manageMaintenance");

  const [requests, vendors, hostels] = await Promise.all([
    getRequests(),
    getVendors(),
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
          <h1 className="mt-2 text-4xl font-bold">Purchase Requests</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Request items or repairs before buying — track status from
            request through approval, ordering, and receipt.
          </p>
        </div>

        <PurchaseRequestsView
          requests={requests}
          vendors={vendors.filter((v) => v.is_active)}
          hostelNames={hostels.map((h) => h.hostel_name)}
        />
      </div>
    </main>
  );
}
