"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function MfaChallengeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    createClient()
      .auth.mfa.listFactors()
      .then(({ data, error }) => {
        if (cancelled) return;

        if (error || !data) {
          setError(error?.message || "Unable to load your authenticator setup.");
          setLoading(false);
          return;
        }

        const verified = data.totp.find((f) => f.status === "verified");

        if (!verified) {
          // Nothing to challenge against - shouldn't normally happen since
          // the proxy only sends users here when a verified factor exists,
          // but fail safe rather than trap the user on a dead-end page.
          router.push("/");
          return;
        }

        setFactorId(verified.id);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId) return;

    setError("");
    setSubmitting(true);

    const supabase = createClient();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });

    if (challengeError || !challenge) {
      setSubmitting(false);
      setError(challengeError?.message || "Unable to verify code.");
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });

    setSubmitting(false);

    if (verifyError) {
      setError(verifyError.message);
      return;
    }

    const next = searchParams.get("next") || "/";
    router.push(next);
    router.refresh();
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (loading) {
    return <p className="mt-6 text-sm text-slate-500">Loading…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <input
        type="text"
        inputMode="numeric"
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        maxLength={6}
        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-lg tracking-widest outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        placeholder="123456"
        required
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || code.length !== 6}
        className="w-full rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
      >
        {submitting ? "Verifying..." : "Verify"}
      </button>

      <button
        type="button"
        onClick={handleLogout}
        className="block w-full text-center text-sm font-semibold text-slate-500 hover:text-slate-700"
      >
        Log Out
      </button>
    </form>
  );
}
