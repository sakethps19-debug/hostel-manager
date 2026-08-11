import { createClient } from "./server";
import { RESIDENT_DOCUMENTS_BUCKET } from "./residentFiles";

// Server Component equivalent of getResidentFileSignedUrl - resolves a photo
// path to a viewable URL during server-side rendering (e.g. the printable
// application form), without requiring a client-side round trip. Returns
// null on failure so callers can render "no photo" instead of throwing.
// Kept in its own module (rather than residentFiles.ts) because it imports
// next/headers, which breaks bundling for the client components that also
// import from residentFiles.ts.
export async function getResidentFileSignedUrlServer(
  path: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(RESIDENT_DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data) return null;
  return data.signedUrl;
}
