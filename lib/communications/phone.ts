// Normalizes an Indian mobile number for outbound provider APIs (Meta
// WhatsApp Cloud API and Indian SMS providers both expect E.164:
// +91XXXXXXXXXX). This NEVER writes back to resident data - it's a
// read-time transform applied only at the point of calling a provider, so
// the resident's stored mobile_number is never touched or reformatted.
export function toE164India(mobileNumber: string): string | null {
  const digits = mobileNumber.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }
  if (digits.length === 13 && digits.startsWith("091")) {
    return `+91${digits.slice(3)}`;
  }

  return null; // not a recognizable Indian mobile number - let the caller decide how to handle this
}
