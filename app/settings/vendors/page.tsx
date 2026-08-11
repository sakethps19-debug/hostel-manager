import VendorsTable from "./VendorsTable";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";

type VendorRow = {
  vendor_id: number;
  name: string;
  category: string;
  contact_person: string | null;
  contact_number: string | null;
  email: string | null;
  address: string | null;
  gst_number: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

type ExpenseRow = {
  expense_id: number;
  hostel_name: string | null;
  expense_date: string;
  category: string;
  amount: number;
  vendor: string | null;
  payment_mode: string;
  reference_number: string | null;
  notes: string | null;
};

async function getVendors(): Promise<VendorRow[]> {
  return callRpcServer<VendorRow[]>("get_vendors");
}

async function getExpenses(): Promise<ExpenseRow[]> {
  return callRpcServer<ExpenseRow[]>("get_expenses");
}

export default async function VendorsPage() {
  await requirePermission("manageExpenses");

  const [vendors, expenses] = await Promise.all([
    getVendors(),
    getExpenses(),
  ]);

  const spendByVendorName = new Map<
    string,
    { totalSpend: number; expenseCount: number }
  >();

  for (const expense of expenses) {
    if (!expense.vendor) continue;
    const key = expense.vendor.trim().toLowerCase();
    const existing = spendByVendorName.get(key) || {
      totalSpend: 0,
      expenseCount: 0,
    };
    existing.totalSpend += Number(expense.amount);
    existing.expenseCount += 1;
    spendByVendorName.set(key, existing);
  }

  const vendorsWithSpend = vendors.map((v) => {
    const spend = spendByVendorName.get(v.name.trim().toLowerCase());
    return {
      ...v,
      totalSpend: spend?.totalSpend ?? 0,
      expenseCount: spend?.expenseCount ?? 0,
    };
  });

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
            Administration
          </p>
          <h1 className="mt-2 text-4xl font-bold">Vendors</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Maintain your vendor directory. Spend totals are matched against{" "}
            <a
              href="/expenses"
              className="font-semibold text-indigo-600 hover:text-indigo-700"
            >
              recorded expenses →
            </a>{" "}
            by vendor name — use the same name here as on the expense form.
          </p>
        </div>

        <VendorsTable vendors={vendorsWithSpend} />
      </div>
    </main>
  );
}
