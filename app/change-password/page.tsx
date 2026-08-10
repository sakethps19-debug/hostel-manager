import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function ChangePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", user.id)
    .single();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-900">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
          VNR Boys Hostel
        </p>
        <h1 className="mt-2 text-3xl font-bold">Change Password</h1>

        {profile?.must_change_password ? (
          <p className="mt-3 text-sm text-amber-700">
            You&apos;re using a temporary password. Set a new password to
            continue.
          </p>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            Update your account password.
          </p>
        )}

        <ChangePasswordForm
          email={user.email}
          forced={Boolean(profile?.must_change_password)}
        />
      </div>
    </main>
  );
}
