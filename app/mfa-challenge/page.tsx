import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MfaChallengeForm from "./MfaChallengeForm";

export default async function MfaChallengePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-900">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
          VNR Boys Hostel
        </p>
        <h1 className="mt-2 text-3xl font-bold">Verify It&apos;s You</h1>
        <p className="mt-2 text-sm text-slate-500">
          Enter the 6-digit code from your authenticator app.
        </p>

        <Suspense>
          <MfaChallengeForm />
        </Suspense>
      </div>
    </main>
  );
}
