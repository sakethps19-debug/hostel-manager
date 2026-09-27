import { createClient } from "./client";

export const ASSET_DOCUMENTS_BUCKET = "asset-documents";

// Invoices/warranty documents/photos for an asset - same accepted-type
// reasoning as resident ID documents (lib/supabase/residentFiles.ts).
export const ASSET_DOCUMENT_ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
export const MAX_ASSET_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

export function buildAssetFilePath(assetId: number, fileName: string) {
  const ext = fileName.includes(".") ? fileName.split(".").pop() : "";
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${assetId}/${id}${ext ? `.${ext}` : ""}`;
}

export async function uploadAssetFile(path: string, file: File) {
  if (!ASSET_DOCUMENT_ACCEPTED_TYPES.includes(file.type)) {
    throw new Error(`"${file.type || "unknown"}" is not an accepted file type for this upload.`);
  }
  if (file.size > MAX_ASSET_DOCUMENT_SIZE_BYTES) {
    throw new Error(
      `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB, max ${(MAX_ASSET_DOCUMENT_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB).`
    );
  }

  const supabase = createClient();
  const { error } = await supabase.storage.from(ASSET_DOCUMENTS_BUCKET).upload(path, file);

  if (error) {
    throw new Error(error.message);
  }
}

export async function getAssetFileSignedUrl(path: string, expiresInSeconds = 3600) {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(ASSET_DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data) {
    throw new Error(error?.message || "Unable to generate a link.");
  }

  return data.signedUrl;
}
