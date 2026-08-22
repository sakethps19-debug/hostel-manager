import { createClient } from "./client";

export const RESIDENT_DOCUMENTS_BUCKET = "resident-documents";

// Validation lives here (not only in each calling form) so every caller of
// uploadResidentFile() is protected, not just the ones that remembered to
// check first - a client-side check alone can always be bypassed by a
// direct API call, but centralizing it here at least means there is one
// place to enforce it consistently, and it's the last line of defense
// before Supabase Storage bucket-level policies (configured separately).
export const PHOTO_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;

export const ID_DOC_ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
export const MAX_ID_DOC_SIZE_BYTES = 10 * 1024 * 1024;

export function buildResidentFilePath(
  residentId: number,
  folder: "profile" | "documents",
  fileName: string
) {
  const ext = fileName.includes(".") ? fileName.split(".").pop() : "";
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  // Deliberately just a random id + extension - never derived from the
  // resident's name, mobile number, or ID proof number, which would leak
  // sensitive data into the storage path/URL itself.
  return `${residentId}/${folder}/${id}${ext ? `.${ext}` : ""}`;
}

function validateResidentFile(file: File, kind: "photo" | "document") {
  const acceptedTypes = kind === "photo" ? PHOTO_ACCEPTED_TYPES : ID_DOC_ACCEPTED_TYPES;
  const maxSize = kind === "photo" ? MAX_PHOTO_SIZE_BYTES : MAX_ID_DOC_SIZE_BYTES;

  if (!acceptedTypes.includes(file.type)) {
    throw new Error(
      `"${file.type || "unknown"}" is not an accepted file type for this upload.`
    );
  }
  if (file.size > maxSize) {
    throw new Error(
      `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB, max ${(maxSize / (1024 * 1024)).toFixed(0)}MB).`
    );
  }
}

export async function uploadResidentFile(
  path: string,
  file: File,
  kind: "photo" | "document" = "document"
) {
  validateResidentFile(file, kind);

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(RESIDENT_DOCUMENTS_BUCKET)
    .upload(path, file);

  if (error) {
    throw new Error(error.message);
  }
}

export async function getResidentFileSignedUrl(
  path: string,
  expiresInSeconds = 3600
) {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(RESIDENT_DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data) {
    throw new Error(error?.message || "Unable to generate a link.");
  }

  return data.signedUrl;
}

export async function removeResidentFile(path: string) {
  const supabase = createClient();
  await supabase.storage.from(RESIDENT_DOCUMENTS_BUCKET).remove([path]);
}
