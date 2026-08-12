import { createClient } from "./client";

export const ASSET_DOCUMENTS_BUCKET = "asset-documents";

export function buildAssetFilePath(assetId: number, fileName: string) {
  const ext = fileName.includes(".") ? fileName.split(".").pop() : "";
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${assetId}/${id}${ext ? `.${ext}` : ""}`;
}

export async function uploadAssetFile(path: string, file: File) {
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
