"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Factor = {
  id: string;
  factor_type: string;
  status: string;
  created_at: string;
};

export default function SecuritySettings() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadFactors() {
    const supabase = createClient();
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (!error && data) {
      setFactors(data.totp.filter((f) => f.status === "verified"));
    }
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    createClient()
      .auth.mfa.listFactors()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) {
          setFactors(data.totp.filter((f) => f.status === "verified"));
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function startEnroll() {
    setError("");
    setSuccess("");
    setBusy(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });

    setBusy(false);

    if (error || !data) {
      setError(error?.message || "Unable to start setup.");
      return;
    }

    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setEnrolling(true);
  }

  async function verifyEnroll() {
    if (!factorId) return;
    setError("");
    setBusy(true);

    const supabase = createClient();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });

    if (challengeError || !challenge) {
      setBusy(false);
      setError(challengeError?.message || "Unable to verify code.");
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });

    setBusy(false);

    if (verifyError) {
      setError(verifyError.message);
      return;
    }

    setEnrolling(false);
    setFactorId(null);
    setQrCode(null);
    setSecret(null);
    setCode("");
    setSuccess("Two-factor authentication is now enabled on this account.");
    loadFactors();
  }

  async function cancelEnroll() {
    if (factorId) {
      const supabase = createClient();
      // Removes the half-finished, never-verified factor so it doesn't
      // linger - it has no effect on login either way, but leaving it
      // around only invites confusion on a later enroll attempt.
      await supabase.auth.mfa.unenroll({ factorId });
    }
    setEnrolling(false);
    setFactorId(null);
    setQrCode(null);
    setSecret(null);
    setCode("");
  }

  async function removeFactor(id: string) {
    if (!window.confirm("Remove two-factor authentication from this account?")) {
      return;
    }
    setBusy(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });

    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess("Two-factor authentication removed.");
    loadFactors();
  }

  if (loading) {
    return <p className="mt-6 text-sm text-slate-500">Loading…</p>;
  }

  return (
    <div className="mt-6 space-y-5">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {success}
        </div>
      )}

      {factors.length > 0 && !enrolling && (
        <div className="space-y-3">
          {factors.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3"
            >
              <div>
                <p className="text-sm font-semibold text-slate-800">Authenticator app</p>
                <p className="text-xs text-slate-500">
                  Enabled {new Date(f.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => removeFactor(f.id)}
                disabled={busy}
                className="text-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {!enrolling && factors.length === 0 && (
        <button
          onClick={startEnroll}
          disabled={busy}
          className="w-full rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Starting…" : "Set Up Authenticator App"}
        </button>
      )}

      {enrolling && (
        <div className="space-y-4 rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-700">
            1. Scan this QR code with your authenticator app
          </p>
          {qrCode && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrCode} alt="Authenticator QR code" className="mx-auto h-40 w-40" />
          )}
          {secret && (
            <p className="break-all rounded-lg bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
              Can&apos;t scan? Enter this code manually: <br />
              <span className="font-mono font-semibold text-slate-700">{secret}</span>
            </p>
          )}

          <p className="text-sm font-semibold text-slate-700">
            2. Enter the 6-digit code from the app
          </p>
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            maxLength={6}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-lg tracking-widest outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            placeholder="123456"
          />

          <div className="flex gap-3">
            <button
              onClick={verifyEnroll}
              disabled={busy || code.length !== 6}
              className="flex-1 rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Verify & Enable"}
            </button>
            <button
              onClick={cancelEnroll}
              disabled={busy}
              className="rounded-xl border border-slate-200 px-6 py-3 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
