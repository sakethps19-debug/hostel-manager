-- ============================================================================
-- Security hardening, round 2
-- ============================================================================
--
-- Two independent gaps found during the production-readiness security audit:
--
-- 1. 2026081209_accounting_rls_hardening.sql retrofitted accounting_require_role()
--    onto SECURITY DEFINER functions missed by the original RLS pass, but
--    itself missed a further batch introduced by
--    2026081206_accounting_functions_crud.sql and
--    2026081207_accounting_functions_addenda.sql. Two of these
--    (set_asset_status, set_asset_code) are WRITE operations whose own code
--    comments claim a role restriction ("open to manageMaintenance-permitted
--    roles... not finance-restricted") that the function body never actually
--    enforced - the comment described intent the code didn't implement.
--    Every function below is re-declared with the SAME body as before,
--    adding only the missing role check.
--
-- 2. No migration in this repo has ever set Storage bucket privacy or
--    storage.objects RLS for the two buckets this app uses
--    (resident-documents, asset-documents) - resident photos and ID proofs
--    had no database-level access control at all beyond whatever might (or
--    might not) have been configured manually in the Supabase dashboard.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Part 1: missing role checks on accounting/asset SECURITY DEFINER functions
-- ----------------------------------------------------------------------------

-- Asset detail sub-resources - read access matches the asset detail page's
-- own gate (viewAssetRegister: owner, operations_manager, finance_manager).
create or replace function get_asset_transfers(p_asset_id bigint) returns setof asset_transfers as $$
begin
  perform accounting_require_role(array['owner', 'operations_manager', 'finance_manager']);
  return query select * from asset_transfers where asset_id = p_asset_id order by transfer_date desc;
end;
$$ language plpgsql stable security definer;

create or replace function get_asset_documents(p_asset_id bigint) returns setof asset_documents as $$
begin
  perform accounting_require_role(array['owner', 'operations_manager', 'finance_manager']);
  return query select * from asset_documents where asset_id = p_asset_id order by uploaded_at desc;
end;
$$ language plpgsql stable security definer;

create or replace function get_asset_disposal(p_asset_id bigint) returns setof asset_disposals as $$
begin
  perform accounting_require_role(array['owner', 'operations_manager', 'finance_manager']);
  return query select * from asset_disposals where asset_id = p_asset_id;
end;
$$ language plpgsql stable security definer;

create or replace function get_asset_depreciation_entries(p_asset_id bigint) returns setof asset_depreciation_entries as $$
begin
  perform accounting_require_role(array['owner', 'operations_manager', 'finance_manager']);
  return query
    select * from asset_depreciation_entries
     where asset_id = p_asset_id
     order by period_year desc, period_month desc;
end;
$$ language plpgsql stable security definer;

create or replace function get_asset_by_id(p_asset_id bigint) returns setof assets as $$
begin
  perform accounting_require_role(array['owner', 'operations_manager', 'finance_manager']);
  return query select * from assets where asset_id = p_asset_id;
end;
$$ language plpgsql stable security definer;

create or replace function get_asset_maintenance_history(p_asset_id bigint)
returns table(
  maintenance_id bigint, bed_id bigint, reason text, start_date date,
  expected_completion_date date, actual_completion_date date, notes text, cost numeric, status text
) as $$
begin
  perform accounting_require_role(array['owner', 'operations_manager', 'finance_manager']);
  return query
    select id, bed_id, reason, start_date, expected_completion_date, actual_completion_date, notes, cost, status
      from bed_maintenance
     where asset_id = p_asset_id
     order by start_date desc;
end;
$$ language plpgsql stable security definer;

-- Accounting configuration read - matches accounting_settings' own
-- finance_read RLS policy (owner, finance_manager) from 2026081205.
create or replace function get_accounting_settings() returns setof accounting_settings as $$
begin
  perform accounting_require_role(array['owner', 'finance_manager']);
  return query select * from accounting_settings order by setting_key;
end;
$$ language plpgsql stable security definer;

-- Operational lifecycle status (In Use/Under Maintenance/Retired/...) -
-- matches manageMaintenance (owner, operations_manager) in lib/permissions.ts,
-- per this function's own pre-existing comment describing (but not
-- previously enforcing) that intent.
create or replace function set_asset_status(p_asset_id bigint, p_status text) returns void as $$
begin
  perform accounting_require_role(array['owner', 'operations_manager']);
  update assets set status = p_status where asset_id = p_asset_id;
end;
$$ language plpgsql security definer;

-- Human-readable asset code - available to the same roles that can view/
-- manage the Asset Register at all (viewAssetRegister), since it's a
-- labeling convenience, not a financial or operational-safety field (those
-- are already separately gated: purchase_cost/depreciation via
-- update_asset_finance_fields, requiring owner+finance_manager).
create or replace function set_asset_code(p_asset_id bigint, p_asset_code text) returns void as $$
begin
  perform accounting_require_role(array['owner', 'operations_manager', 'finance_manager']);
  update assets set asset_code = p_asset_code where asset_id = p_asset_id;
end;
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- Part 2: Storage — private buckets + object-level RLS
-- ----------------------------------------------------------------------------
--
-- resident-documents holds resident photos and ID proofs (Aadhaar/PAN/etc.)
-- - the most sensitive data this app stores. Per explicit product decision,
-- Finance Manager does not get broader resident-document access merely
-- because Communications/other finance features exist, so read/write here
-- is Owner + Operations Manager only, matching manageDocuments in
-- lib/permissions.ts. The app already exclusively uses createSignedUrl()
-- (never a public URL) per lib/supabase/residentFiles.ts, so setting the
-- bucket private does not change any existing working code path.
update storage.buckets set public = false where id = 'resident-documents';

drop policy if exists resident_documents_select on storage.objects;
create policy resident_documents_select on storage.objects for select
  using (
    bucket_id = 'resident-documents'
    and (select role from profiles where id = auth.uid()) in ('owner', 'operations_manager')
  );

drop policy if exists resident_documents_insert on storage.objects;
create policy resident_documents_insert on storage.objects for insert
  with check (
    bucket_id = 'resident-documents'
    and (select role from profiles where id = auth.uid()) in ('owner', 'operations_manager')
  );

drop policy if exists resident_documents_update on storage.objects;
create policy resident_documents_update on storage.objects for update
  using (
    bucket_id = 'resident-documents'
    and (select role from profiles where id = auth.uid()) in ('owner', 'operations_manager')
  );

drop policy if exists resident_documents_delete on storage.objects;
create policy resident_documents_delete on storage.objects for delete
  using (
    bucket_id = 'resident-documents'
    and (select role from profiles where id = auth.uid()) in ('owner', 'operations_manager')
  );

-- asset-documents holds vendor invoices/warranty documents for the Asset
-- Register - not resident PII, so it follows viewAssetRegister's broader
-- role set instead.
update storage.buckets set public = false where id = 'asset-documents';

drop policy if exists asset_documents_storage_select on storage.objects;
create policy asset_documents_storage_select on storage.objects for select
  using (
    bucket_id = 'asset-documents'
    and (select role from profiles where id = auth.uid()) in ('owner', 'operations_manager', 'finance_manager')
  );

drop policy if exists asset_documents_storage_insert on storage.objects;
create policy asset_documents_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'asset-documents'
    and (select role from profiles where id = auth.uid()) in ('owner', 'operations_manager', 'finance_manager')
  );

drop policy if exists asset_documents_storage_update on storage.objects;
create policy asset_documents_storage_update on storage.objects for update
  using (
    bucket_id = 'asset-documents'
    and (select role from profiles where id = auth.uid()) in ('owner', 'operations_manager', 'finance_manager')
  );

drop policy if exists asset_documents_storage_delete on storage.objects;
create policy asset_documents_storage_delete on storage.objects for delete
  using (
    bucket_id = 'asset-documents'
    and (select role from profiles where id = auth.uid()) in ('owner', 'operations_manager', 'finance_manager')
  );

commit;
