"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ACCOUNTS = [
  { label: "Owner", email: "anilreddykasireddy@gmail.com" },
  { label: "Operations Manager", email: "anilreddykasireddy+ops@gmail.com" },
  { label: "Finance Manager", email: "anilreddykasireddy+finance@gmail.com" },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMessage(error.message);
      setSaving(false);
      return;
    }

    const next = searchParams.get("next") || "/";
    router.push(next);
    router.refresh();
  }

  async function handleForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSuccessMessage(
      "If that email has an account, a password reset link has been sent."
    );
  }

  if (mode === "forgot") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-900">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            VNR Boys Hostel
          </p>
          <h1 className="mt-2 text-3xl font-bold">Reset Password</h1>
          <p className="mt-2 text-sm text-slate-500">
            Enter your email and we&apos;ll send you a reset link.
          </p>

          <form onSubmit={handleForgotPassword} className="mt-8 space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Account
              </span>
              <select
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                required
              >
                <option value="" disabled>
                  Select account
                </option>
                {ACCOUNTS.map((account) => (
                  <option key={account.email} value={account.email}>
                    {account.label}
                  </option>
                ))}
              </select>
            </label>

            {errorMessage && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {errorMessage}
              </div>
            )}

            {successMessage && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                {successMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Sending..." : "Send Reset Link"}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setErrorMessage("");
                setSuccessMessage("");
              }}
              className="block w-full text-center text-sm font-semibold text-slate-500 hover:text-slate-700"
            >
              Back to Sign In
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-900">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
          VNR Boys Hostel
        </p>
        <h1 className="mt-2 text-3xl font-bold">Sign In</h1>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              Account
            </span>
            <select
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              required
            >
              <option value="" disabled>
                Select account
              </option>
              {ACCOUNTS.map((account) => (
                <option key={account.email} value={account.email}>
                  {account.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              required
            />
          </label>

          {errorMessage && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Signing in..." : "Sign In"}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode("forgot");
              setErrorMessage("");
            }}
            className="block w-full text-center text-sm font-semibold text-indigo-600 hover:text-indigo-700"
          >
            Forgot Password?
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Accounts are created by the hostel owner/admin. Contact them if you
          need access.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
