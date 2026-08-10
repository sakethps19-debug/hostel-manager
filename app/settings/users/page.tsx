import UsersTable from "./UsersTable";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";

type UserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  last_sign_in_at: string | null;
};

async function getUsers(): Promise<UserRow[]> {
  return callRpcServer<UserRow[]>("admin_list_users");
}

export default async function UsersSettingsPage() {
  await requirePermission("manageUsers");

  const users = await getUsers();

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
          <h1 className="mt-2 text-4xl font-bold">Users</h1>
          <p className="mt-2 text-slate-500">
            {users.length} account{users.length === 1 ? "" : "s"}. Create new
            accounts from your Supabase dashboard (Authentication → Users →
            Add User) — they default to Operations Manager here; assign the
            correct role below.
          </p>
        </div>

        <UsersTable users={users} />
      </div>
    </main>
  );
}
