import ExpensesTable from "./ExpensesTable";

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

async function getExpenses(): Promise<ExpenseRow[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_expenses`, {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load expenses: ${await response.text()}`);
  }

  return response.json();
}

export default async function ExpensesPage() {
  const expenses = await getExpenses();
  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <a
          href="/"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Dashboard
        </a>

        <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              Hostel Management
            </p>
            <h1 className="mt-2 text-4xl font-bold">Expenses</h1>
            <p className="mt-2 text-slate-500">
              {expenses.length} recorded · Rs.{" "}
              {total.toLocaleString("en-IN")} total
            </p>
          </div>

          <a
            href="/expenses/new"
            className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            + Record Expense
          </a>
        </div>

        <ExpensesTable expenses={expenses} />
      </div>
    </main>
  );
}
