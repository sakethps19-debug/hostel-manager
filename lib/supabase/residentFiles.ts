import { createClient } from "./client";

export const RESIDENT_DOCUMENTS_BUCKET = "resident-documents";

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
  return `${residentId}/${folder}/${id}${ext ? `.${ext}` : ""}`;
}

export async function uploadResidentFile(path: string, file: File) {
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
