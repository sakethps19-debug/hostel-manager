 "use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { logAuditEvent } from "@/lib/audit";

type ResidentDetails = {
  resident_id: number;
  booking_id: number;
  full_name: string;
  mobile_number: string | null;
  email: string | null;
  emergency_contact: string | null;
 id_proof_type: string | null;
id_proof_number: string | null;
  home_address: string | null;
  work_college_address: string | null;
  notes: string | null;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  security_deposit: number | null;
  hostel_name: string;
};

type ProfileExtra = {
  date_of_birth: string | null;
  gender: string | null;
  photo_url: string | null;
  employer_or_college: string | null;
  occupation_or_course: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_mobile: string | null;
};

export default function EditResidentPage() {
  const params = useParams();
  const router = useRouter();

  const hostelSlug = String(params.hostelSlug);
  const roomNumber = String(params.roomNumber);
  const bedId = Number(params.bedId);

  const [details, setDetails] = useState<ResidentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [fullName, setFullName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [email, setEmail] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
 const [idProofType, setIdProofType] = useState("");
const [idProofNumber, setIdProofNumber] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [workCollegeAddress, setWorkCollegeAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [securityDeposit, setSecurityDeposit] = useState("");

  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [employerOrCollege, setEmployerOrCollege] = useState("");
  const [occupationOrCourse, setOccupationOrCourse] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactRelationship, setEmergencyContactRelationship] =
    useState("");
  const [emergencyContactMobile, setEmergencyContactMobile] = useState("");

  useEffect(() => {
    async function loadDetails() {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey =
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

      if (!supabaseUrl || !supabaseKey) {
        setErrorMessage("Supabase environment variables are missing.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `${supabaseUrl}/rest/v1/rpc/get_resident_details`,
          {
            method: "POST",
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              p_bed_id: bedId,
            }),
          }
        );

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const data: ResidentDetails[] = await response.json();

        if (!data.length) {
          throw new Error("Active booking not found.");
        }

        const resident = data[0];

        setDetails(resident);
        setFullName(resident.full_name);
        setMobileNumber(resident.mobile_number || "");
        setEmail(resident.email || "");
        setEmergencyContact(resident.emergency_contact || "");
       setIdProofType(resident.id_proof_type || "");
setIdProofNumber(resident.id_proof_number || "");
        setHomeAddress(resident.home_address || "");
        setWorkCollegeAddress(resident.work_college_address || "");
        setNotes(resident.notes || "");
        setStartDate(resident.start_date);
        setEndDate(resident.end_date);
        setMonthlyRent(String(resident.monthly_rent));
        setSecurityDeposit(String(resident.security_deposit || 0));

        const extraResponse = await fetch(
          `${supabaseUrl}/rest/v1/rpc/get_resident_profile_extra`,
          {
            method: "POST",
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              p_resident_id: resident.resident_id,
            }),
          }
        );

        if (extraResponse.ok) {
          const extraData: ProfileExtra[] = await extraResponse.json();
          const extra = extraData.length > 0 ? extraData[0] : null;

          if (extra) {
            setDateOfBirth(extra.date_of_birth || "");
            setGender(extra.gender || "");
            setEmployerOrCollege(extra.employer_or_college || "");
            setOccupationOrCourse(extra.occupation_or_course || "");
            setEmergencyContactName(extra.emergency_contact_name || "");
            setEmergencyContactRelationship(
              extra.emergency_contact_relationship || ""
            );
            setEmergencyContactMobile(extra.emergency_contact_mobile || "");
          }
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load resident details."
        );
      } finally {
        setLoading(false);
      }
    }

    loadDetails();
  }, [bedId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!details) return;

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
    const rent = Number(monthlyRent);
    const deposit = Number(securityDeposit || 0);

    if (!fullName.trim()) {
      setErrorMessage("Resident name is required.");
      return;
    }

    if (!startDate || !endDate) {
      setErrorMessage("Start date and end date are required.");
      return;
    }

    if (new Date(endDate) < new Date(startDate)) {
      setErrorMessage("End date cannot be before start date.");
      return;
    }

    if (!Number.isFinite(rent) || rent < 0) {
      setErrorMessage("Please enter a valid monthly rent.");
      return;
    }

    if (!Number.isFinite(deposit) || deposit < 0) {
      setErrorMessage("Please enter a valid security deposit.");
      return;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      setErrorMessage("Supabase environment variables are missing.");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        `${supabaseUrl}/rest/v1/rpc/update_booking_details`,
        {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_booking_id: details.booking_id,
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
            p_monthly_rent: rent,
            p_security_deposit: deposit,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();

        if (error.includes("already booked")) {
          throw new Error(
            "This bed is already booked for part of the selected period."
          );
        }

        throw new Error(error);
      }

      const extraResponse = await fetch(
        `${supabaseUrl}/rest/v1/rpc/update_resident_profile_extra`,
        {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_resident_id: details.resident_id,
            p_date_of_birth: dateOfBirth || null,
            p_gender: gender || null,
            p_employer_or_college: employerOrCollege || null,
            p_occupation_or_course: occupationOrCourse || null,
            p_emergency_contact_name: emergencyContactName || null,
            p_emergency_contact_relationship:
              emergencyContactRelationship || null,
            p_emergency_contact_mobile: emergencyContactMobile || null,
          }),
        }
      );

      if (!extraResponse.ok) {
        throw new Error(
          `Core details saved, but additional details failed to save: ${await extraResponse.text()}`
        );
      }

      await logAuditEvent("booking_edited", "booking", details.booking_id, {
        full_name: fullName,
        monthly_rent: rent,
      });

      router.push(
        `/${hostelSlug}/room/${roomNumber}/resident/${bedId}`
      );
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update booking details."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <p className="text-slate-500">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">

        <a
          href={`/${hostelSlug}/room/${roomNumber}/resident/${bedId}`}
          className="text-sm font-semibold text-indigo-600"
        >
          ← Back to Resident Details
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            {details?.hostel_name} · Room {roomNumber}
          </p>

          <h1 className="mt-2 text-4xl font-bold">
            Edit Resident Details
          </h1>
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
                />
              </Field>

              <Field label="Emergency Contact">
                <input
                  value={emergencyContact}
                  onChange={(e) =>
                    setEmergencyContact(e.target.value)
                  }
                  className="input-style"
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
              Additional Details
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Optional — helps complete the resident profile.
            </p>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <Field label="Date of Birth">
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="input-style"
                />
              </Field>

              <Field label="Gender">
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="input-style"
                >
                  <option value="">Not specified</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </Field>

              <Field label="Employer / College">
                <input
                  value={employerOrCollege}
                  onChange={(e) => setEmployerOrCollege(e.target.value)}
                  className="input-style"
                />
              </Field>

              <Field label="Occupation / Course">
                <input
                  value={occupationOrCourse}
                  onChange={(e) => setOccupationOrCourse(e.target.value)}
                  className="input-style"
                />
              </Field>

              <Field label="Emergency Contact Name">
                <input
                  value={emergencyContactName}
                  onChange={(e) => setEmergencyContactName(e.target.value)}
                  className="input-style"
                />
              </Field>

              <Field label="Emergency Contact Relationship">
                <input
                  value={emergencyContactRelationship}
                  onChange={(e) =>
                    setEmergencyContactRelationship(e.target.value)
                  }
                  className="input-style"
                  placeholder="e.g. Father, Mother, Sibling"
                />
              </Field>

              <Field label="Emergency Contact Mobile">
                <input
                  type="tel"
                  value={emergencyContactMobile}
                  onChange={(e) =>
                    setEmergencyContactMobile(
                      e.target.value.replace(/\D/g, "").slice(0, 10)
                    )
                  }
                  className="input-style"
                  inputMode="numeric"
                  maxLength={10}
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
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input-style"
                  required
                />
              </Field>

              <Field label="End Date *">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="input-style"
                  required
                />
              </Field>

              <Field label="Agreed Monthly Rent *">
                <input
                  type="number"
                  min="0"
                  value={monthlyRent}
                  onChange={(e) => setMonthlyRent(e.target.value)}
                  className="input-style"
                  required
                />
              </Field>

              <Field label="Security Deposit">
                <input
                  type="number"
                  min="0"
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
              className="mt-5 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </section>

          {errorMessage && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {errorMessage}
            </div>
          )}

          <div className="flex justify-end gap-3">

            <a
              href={`/${hostelSlug}/room/${roomNumber}/resident/${bedId}`}
              className="rounded-xl border border-slate-200 px-6 py-3 font-semibold"
            >
              Cancel
            </a>

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-indigo-600 px-7 py-3 font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
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
