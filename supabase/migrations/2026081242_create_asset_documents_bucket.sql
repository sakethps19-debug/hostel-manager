-- ============================================================================
-- asset-documents storage bucket.
--
-- A prior migration (2026081213_security_hardening_round2.sql) already
-- created correct, role-scoped RLS policies for this bucket (SELECT/
-- INSERT/UPDATE/DELETE restricted to owner/operations_manager/
-- finance_manager, INSERT/UPDATE further restricted to the same
-- MIME types and 10MB size cap enforced client-side in
-- lib/supabase/assetFiles.ts), and set public = false for it - but the
-- bucket itself was never actually created, so those policies were dead
-- (never matched any row) and every asset-document upload/view in
-- AssetDetailView.tsx (a real, live feature - not dormant code) has been
-- failing.
--
-- Verified before creating: the upload feature is real and wired up
-- (buildAssetFilePath/uploadAssetFile/getAssetFileSignedUrl are called
-- from AssetDetailView.tsx, not just defined and unused), and creating a
-- Storage bucket does not create a new billed service or change the
-- project's plan - it uses the same storage quota as the existing
-- resident-documents bucket already does.
--
-- Verified live: bucket now exists with public=false, a 10MB size limit,
-- and the same 4 accepted MIME types; the 4 pre-existing storage.objects
-- policies (asset_documents_storage_select/insert/update/delete) now
-- correctly apply to it. resident-documents is untouched.
-- ============================================================================
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'asset-documents', 'asset-documents', false,
  10 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10 * 1024 * 1024,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

commit;
