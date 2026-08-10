"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { logAuditEvent } from "@/lib/audit";

const SOURCES = ["Walk-in", "Referral", "Phone Call", "Online", "Other"];

export default function NewEnquiryPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [preferredHostel, setPreferredHostel] = useState("");
  const [preferredSharing, setPreferredSharing] = useState("");
  const [budget, setBudget] = useState("");
  const [expectedJoiningDate, setExpectedJoiningDate] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!fullName.trim()) {
      setErrorMessage("Please enter the enquirer's name.");
      return;
    }

    if (!/^\d{10}$/.test(mobileNumber)) {
      setErrorMessage("Mobile number must contain exactly 10 digits.");
      return;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      setErrorMessage("Supabase environment variables are missing.");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        `${supabaseUrl}/rest/v1/rpc/create_enquiry`,
        {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_full_name: fullName,
            p_mobile_number: mobileNumber,
            p_preferred_hostel: preferredHostel || null,
            p_preferred_sharing: preferredSharing
              ? Number(preferredSharing)
              : null,
            p_budget: budget ? Number(budget) : null,
            p_expected_joining_date: expectedJoiningDate || null,
            p_source: source || null,
            p_notes: notes || null,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const created = await response.json();
      await logAuditEvent("enquiry_created", "enquiry", created?.id ?? null, {
        full_name: fullName,
        mobile_number: mobileNumber,
      });

      router.push("/enquiries");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to create enquiry."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <a
          href="/enquiries"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Enquiries
        </a>

        <div className="mt-7">
          <h1 className="text-4xl font-bold">New Enquiry</h1>
          <p className="mt-2 text-slate-500">
            Record a prospective resident who hasn&apos;t booked yet.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Full Name *
              </span>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="input-style"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Mobile Number *
              </span>
              <input
                type="tel"
                value={mobileNumber}
                onChange={(e) =>
                  setMobileNumber(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                className="input-style"
                inputMode="numeric"
                maxLength={10}
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Preferred Hostel
              </span>
              <select
                value={preferredHostel}
                onChange={(e) => setPreferredHostel(e.target.value)}
                className="input-style"
              >
                <option value="">No preference</option>
                <option value="Hostel A">Hostel A</option>
                <option value="Hostel B">Hostel B</option>
                <option value="Hostel C">Hostel C</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Preferred Sharing
              </span>
              <select
                value={preferredSharing}
                onChange={(e) => setPreferredSharing(e.target.value)}
                className="input-style"
              >
                <option value="">No preference</option>
                <option value="1">1 Sharing</option>
                <option value="2">2 Sharing</option>
                <option value="3">3 Sharing</option>
                <option value="4">4 Sharing</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Budget (per month)
              </span>
              <input
                type="number"
                min="0"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="input-style"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Expected Joining Date
              </span>
              <input
                type="date"
                value={expectedJoiningDate}
                onChange={(e) => setExpectedJoiningDate(e.target.value)}
                className="input-style"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                Source
              </span>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="input-style"
              >
                <option value="">Not specified</option>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              Notes
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="input-style"
            />
          </label>

          {errorMessage && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {errorMessage}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <a
              href="/enquiries"
              className="rounded-xl border border-slate-200 px-6 py-3 font-semibold hover:bg-slate-50"
            >
              Cancel
            </a>

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-indigo-600 px-7 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Enquiry"}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .input-style {
          width: 100%;
          border: 1px solid rgb(226 232 240);
          border-radius: 0.75rem;
          padding: 0.75rem 1rem;
          outline: none;
        }

        .input-style:focus {
          border-color: rgb(99 102 241);
          box-shadow: 0 0 0 2px rgb(224 231 255);
        }
      `}</style>
    </main>
  );
}
