import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SecuritySettings from "./SecuritySettings";

export default async function SecurityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-lg">
        <a
          href="/"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Dashboard
        </a>

        <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Account Security
          </p>
          <h1 className="mt-2 text-3xl font-bold">Two-Factor Authentication</h1>
          <p className="mt-2 text-sm text-slate-500">
            Add an authenticator app (Google Authenticator, Authy, 1Password,
            etc.) as a second sign-in step for this account. Once enabled,
            you&apos;ll be asked for a 6-digit code every time you sign in
            here.
          </p>

          <SecuritySettings />

          <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            If you lose access to your authenticator app, another Owner can
            remove your two-factor setup from the Supabase dashboard
            (Authentication → Users → select your account → Multi-Factor),
            or via the SQL editor. There is no self-service recovery from
            this page if you&apos;re locked out.
          </p>
        </div>
      </div>
    </main>
  );
}
