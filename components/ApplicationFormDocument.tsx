import { formatDate, formatDateTime, formatMoney } from "@/lib/format";

export type ApplicationFormBooking = {
  booking_id: number;
  resident_id: number;
  full_name: string;
  mobile_number: string | null;
  email: string | null;
  emergency_contact: string | null;
  id_proof_type: string | null;
  id_proof_number: string | null;
  home_address: string | null;
  work_college_address: string | null;
  notes: string | null;
  hostel_name: string;
  floor_number: number;
  room_number: string;
  bed_number: string;
  bed_code: string | null;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  security_deposit: number | null;
  booking_status: string;
  created_at: string;
};

export type ApplicationFormProfileExtra = {
  date_of_birth: string | null;
  gender: string | null;
  employer_or_college: string | null;
  occupation_or_course: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_mobile: string | null;
} | null;

const DEFAULT_DECLARATION =
  "I confirm that the information provided in this form is accurate to the best of my knowledge. I agree to follow the hostel's rules and house policies as communicated to me by hostel management.";

function maskIdNumber(value: string) {
  const visibleCount = 4;
  if (value.length <= visibleCount) return value;
  return (
    value.slice(0, -visibleCount).replace(/\S/g, "•") +
    value.slice(-visibleCount)
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-300 pb-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-6 border-b-2 border-slate-800 pb-1 text-xs font-bold uppercase tracking-widest text-slate-800 print:break-after-avoid">
      {children}
    </h2>
  );
}

export default function ApplicationFormDocument({
  booking,
  profileExtra,
  standardRate,
  photoUrl,
  declarationText,
  generatedAt,
}: {
  booking: ApplicationFormBooking;
  profileExtra: ApplicationFormProfileExtra;
  standardRate: number | null;
  photoUrl: string | null;
  declarationText: string | null;
  generatedAt: string;
}) {
  const emergencyName =
    profileExtra?.emergency_contact_name || booking.emergency_contact || "Not provided";
  const emergencyRelationship = profileExtra?.emergency_contact_relationship || "-";
  const emergencyMobile = profileExtra?.emergency_contact_mobile || "-";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">VNR Boys Hostel</h1>
          <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-slate-600">
            Resident Application / Admission Form
          </p>
        </div>
        <div className="text-right text-sm text-slate-500">
          <p>Application / Booking No.</p>
          <p className="text-lg font-bold text-slate-900">
            #{booking.booking_id}
          </p>
          <p className="mt-1">{formatDate(booking.created_at)}</p>
        </div>
      </div>

      <SectionTitle>Booking Information</SectionTitle>
      <div className="mt-3 grid grid-cols-4 gap-4">
        <Field label="Hostel" value={booking.hostel_name} />
        <Field label="Floor" value={`Floor ${booking.floor_number}`} />
        <Field label="Room" value={booking.room_number} />
        <Field label="Bed ID" value={booking.bed_code || booking.bed_number} />
      </div>

      <SectionTitle>Resident Details</SectionTitle>
      <div className="mt-3 flex gap-5">
        <div className="flex h-28 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-300 bg-slate-50 print:border-slate-400">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={booking.full_name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-[10px] text-slate-400">No Photo</span>
          )}
        </div>

        <div className="grid flex-1 grid-cols-2 gap-4">
          <Field label="Full Name" value={booking.full_name} />
          <Field label="Mobile Number" value={booking.mobile_number || "Not provided"} />
          <Field label="Email" value={booking.email || "Not provided"} />
          <Field
            label="Date of Birth"
            value={
              profileExtra?.date_of_birth
                ? formatDate(profileExtra.date_of_birth)
                : "Not provided"
            }
          />
          <Field label="Gender" value={profileExtra?.gender || "Not provided"} />
        </div>
      </div>

      <SectionTitle>Permanent / Home Address</SectionTitle>
      <p className="mt-3 min-h-[2.5rem] whitespace-pre-wrap text-sm text-slate-800">
        {booking.home_address || "Not provided"}
      </p>

      <SectionTitle>Work / Education Details</SectionTitle>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <Field
          label="Employer / College"
          value={profileExtra?.employer_or_college || "Not provided"}
        />
        <Field
          label="Occupation / Course"
          value={profileExtra?.occupation_or_course || "Not provided"}
        />
      </div>
      <div className="mt-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Work / College Address
        </p>
        <p className="mt-0.5 min-h-[2rem] whitespace-pre-wrap text-sm text-slate-800">
          {booking.work_college_address || "Not provided"}
        </p>
      </div>

      <SectionTitle>Emergency Contact</SectionTitle>
      <div className="mt-3 grid grid-cols-3 gap-4">
        <Field label="Name" value={emergencyName} />
        <Field label="Relationship" value={emergencyRelationship} />
        <Field label="Mobile" value={emergencyMobile} />
      </div>

      <SectionTitle>Identity Details</SectionTitle>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <Field label="ID Proof Type" value={booking.id_proof_type || "Not provided"} />
        <Field
          label="ID Proof Number"
          value={
            booking.id_proof_number ? maskIdNumber(booking.id_proof_number) : "Not provided"
          }
        />
      </div>

      <SectionTitle>Booking Details</SectionTitle>
      <div className="mt-3 grid grid-cols-4 gap-4">
        <Field label="Check-in / Start Date" value={formatDate(booking.start_date)} />
        <Field label="Expected End Date" value={formatDate(booking.end_date)} />
        <Field
          label="Standard Room Rate"
          value={standardRate != null ? formatMoney(standardRate) : "-"}
        />
        <Field label="Agreed Monthly Rent" value={formatMoney(booking.monthly_rent)} />
        <Field
          label="Security Deposit Agreed"
          value={formatMoney(booking.security_deposit || 0)}
        />
      </div>

      {booking.notes && (
        <>
          <SectionTitle>Other Details / Notes</SectionTitle>
          <p className="mt-3 whitespace-pre-wrap text-sm text-slate-800">{booking.notes}</p>
        </>
      )}

      <div className="mt-6 rounded-lg border border-slate-300 bg-slate-50 p-4 text-xs leading-5 text-slate-700 print:break-inside-avoid print:bg-white">
        <p className="font-semibold uppercase tracking-wide text-slate-500">
          Declaration
        </p>
        <p className="mt-1">{declarationText || DEFAULT_DECLARATION}</p>
      </div>

      <div className="mt-10 grid grid-cols-3 gap-8 print:break-inside-avoid">
        <SignatureBlock label="Resident Signature" />
        <SignatureBlock label="Guardian / Emergency Contact Signature" />
        <SignatureBlock label="Hostel Representative Signature" />
      </div>

      <p className="mt-8 border-t border-slate-200 pt-3 text-right text-[10px] text-slate-400 print:fixed print:bottom-0 print:left-0 print:right-0">
        Generated on {formatDateTime(generatedAt)}
      </p>
    </div>
  );
}

function SignatureBlock({ label }: { label: string }) {
  return (
    <div>
      <div className="h-16 border-b border-slate-400" />
      <p className="mt-1 text-xs text-slate-500">{label}</p>
      <p className="mt-4 text-xs text-slate-400">Date: ______________</p>
    </div>
  );
}
