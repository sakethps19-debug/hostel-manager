"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { logAuditEvent } from "@/lib/audit";
import { callRpcClient } from "@/lib/supabase/callRpcClient";

export default function BookingForm({
  hostelSlug,
  hostelName,
  roomNumber,
  bedId,
  bedCode,
  standardFee,
}: {
  hostelSlug: string;
  hostelName: string;
  roomNumber: string;
  bedId: number;
  bedCode: string | null;
  standardFee: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const enquiryId = searchParams.get("enquiryId");

  const [fullName, setFullName] = useState(searchParams.get("name") || "");
  const [mobileNumber, setMobileNumber] = useState(
    searchParams.get("mobile") || ""
  );
  const [email, setEmail] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [idProofType, setIdProofType] = useState("");
  const [idProofNumber, setIdProofNumber] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [workCollegeAddress, setWorkCollegeAddress] = useState("");
  const [notes, setNotes] = useState("");

  const [startDate, setStartDate] = useState(
    searchParams.get("startDate") || ""
  );
  const [endDate, setEndDate] = useState("");

  const [monthlyRent, setMonthlyRent] = useState(
    standardFee > 0 ? String(standardFee) : ""
  );

  const [securityDeposit, setSecurityDeposit] = useState("0");

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    if (!/^\d{10}$/.test(mobileNumber)) {
      setErrorMessage(
        "Mobile number must contain exactly 10 digits."
      );
      return;
    }

    if (!idProofType) {
      setErrorMessage("Please select an ID proof type.");
      return;
    }

    if (!idProofNumber.trim()) {
      setErrorMessage("Please enter the ID proof number/value.");
      return;
    }

    if (!fullName.trim()) {
      setErrorMessage("Please enter the resident's full name.");
      return;
    }

    if (!startDate || !endDate) {
      setErrorMessage("Please select the booking dates.");
      return;
    }

    if (new Date(endDate) < new Date(startDate)) {
      setErrorMessage("End date cannot be before start date.");
      return;
    }

    const agreedRent = Number(monthlyRent);
    const deposit = Number(securityDeposit || 0);

    if (!Number.isFinite(agreedRent) || agreedRent < 0) {
      setErrorMessage("Please enter a valid monthly rent.");
      return;
    }

    if (!Number.isFinite(deposit) || deposit < 0) {
      setErrorMessage("Please enter a valid security deposit.");
      return;
    }

    try {
      setSaving(true);

      try {
        await callRpcClient("create_booking", {
          p_bed_id: bedId,
          p_full_name: fullName,
          p_mobile_number: mobileNumber,
          p_email: email,
          p_emergency_contact: emergencyContact,
          p_id_proof_type: idProofType,
          p_id_proof_number: idProofNumber,
          p_home_address: homeAddress,
          p_work_college_address: workCollegeAddress,
          p_notes: notes,
          p_start_date: startDate,
          p_end_date: endDate,
          p_monthly_rent: agreedRent,
          p_security_deposit: deposit,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        if (message.includes("already booked")) {
          throw new Error(
            "This bed is already booked for the selected dates."
          );
        }

        throw err;
      }

      await logAuditEvent("booking_created", "booking", null, {
        bed_id: bedId,
        full_name: fullName,
        start_date: startDate,
        end_date: endDate,
        monthly_rent: agreedRent,
      });

      if (enquiryId) {
        try {
          await callRpcClient("update_enquiry_status", {
            p_enquiry_id: Number(enquiryId),
            p_status: "Converted",
          });
        } catch {
          // Booking already succeeded - don't block on this best-effort update.
        }
      }

      router.push(`/${hostelSlug}/room/${roomNumber}`);
      router.refresh();

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to create booking."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">

        <a
          href={`/${hostelSlug}/room/${roomNumber}`}
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Room {roomNumber}
        </a>

        <div className="mt-7">

          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            {hostelName} · Room {roomNumber}
          </p>

          <h1 className="mt-2 text-4xl font-bold">
            New Booking
          </h1>

          <p className="mt-2 text-slate-500">
            Bed ID {bedCode || bedId}
          </p>

        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-10 space-y-8"
        >

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <h2 className="text-xl font-bold">
              Resident Details
            </h2>

            <div className="mt-6 grid gap-5 md:grid-cols-2">

              <Field label="Full Name *">
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="input-style"
                  placeholder="Resident's full name"
                  required
                />
              </Field>

              <Field label="Mobile Number *">
  <input
    type="tel"
    value={mobileNumber}
    onChange={(e) => {
      const digits = e.target.value
        .replace(/\D/g, "")
        .slice(0, 10);

      setMobileNumber(digits);
    }}
    className="input-style"
    placeholder="10-digit mobile number"
    inputMode="numeric"
    pattern="[0-9]{10}"
    maxLength={10}
    required
  />
</Field>

              <Field label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-style"
                  placeholder="Email address"
                />
              </Field>

              <Field label="Emergency Contact">
                <input
                  value={emergencyContact}
                  onChange={(e) =>
                    setEmergencyContact(e.target.value)
                  }
                  className="input-style"
                  placeholder="Emergency contact number"
                  inputMode="tel"
                />
              </Field>

   <Field label="ID Proof Type *">
  <select
    value={idProofType}
    onChange={(e) => setIdProofType(e.target.value)}
    className="input-style"
    required
  >
    <option value="">Select ID proof</option>
    <option value="Aadhaar Card">Aadhaar Card</option>
    <option value="PAN Card">PAN Card</option>
    <option value="Voter ID">Voter ID</option>
    <option value="Driving License">Driving License</option>
    <option value="Other">Other</option>
  </select>
</Field>
            <Field label="ID Proof Number / Value *">
  <input
    value={idProofNumber}
    onChange={(e) => setIdProofNumber(e.target.value)}
    className="input-style"
    placeholder="Enter ID proof number"
    required
  />
</Field>

              <Field label="Home Address">
                <textarea
                  value={homeAddress}
                  onChange={(e) => setHomeAddress(e.target.value)}
                  className="input-style"
                  rows={2}
                  placeholder="Permanent / home address"
                />
              </Field>

              <Field label="Work / College Address">
                <textarea
                  value={workCollegeAddress}
                  onChange={(e) => setWorkCollegeAddress(e.target.value)}
                  className="input-style"
                  rows={2}
                  placeholder="Workplace or college address"
                />
              </Field>
            </div>

          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <h2 className="text-xl font-bold">
              Booking Details
            </h2>

            <div className="mt-6 grid gap-5 md:grid-cols-2">

              <Field label="Start Date *">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) =>
                    setStartDate(e.target.value)
                  }
                  className="input-style"
                  required
                />
              </Field>

              <Field label="End Date *">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) =>
                    setEndDate(e.target.value)
                  }
                  className="input-style"
                  required
                />
              </Field>

              <Field label="Agreed Monthly Rent *">

                <input
                  type="number"
                  min="0"
                  step="1"
                  value={monthlyRent}
                  onChange={(e) =>
                    setMonthlyRent(e.target.value)
                  }
                  className="input-style"
                  required
                />

                <p className="mt-2 text-xs text-slate-400">
                  {standardFee > 0
                    ? `Standard rate: Rs. ${standardFee.toLocaleString("en-IN")}`
                    : "No standard rate set for this room — enter manually."}
                </p>

              </Field>

              <Field label="Security Deposit">

                <input
                  type="number"
                  min="0"
                  step="1"
                  value={securityDeposit}
                  onChange={(e) =>
                    setSecurityDeposit(e.target.value)
                  }
                  className="input-style"
                />

              </Field>

            </div>

          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <h2 className="text-xl font-bold">
              Notes
            </h2>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="mt-5 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              placeholder="Any remarks, discount reason, payment arrangement, or other information..."
            />

          </section>

          {errorMessage && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {errorMessage}
            </div>
          )}

          <div className="flex justify-end gap-3">

            <a
              href={`/${hostelSlug}/room/${roomNumber}`}
              className="rounded-xl border border-slate-200 px-6 py-3 font-semibold hover:bg-white"
            >
              Cancel
            </a>

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-indigo-600 px-7 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Confirm Booking"}
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">

      <span className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
      </span>

      {children}

    </label>
  );
}
