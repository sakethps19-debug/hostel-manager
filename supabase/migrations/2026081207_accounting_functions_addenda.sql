-- ============================================================================
-- Accounting module — late addenda (asset detail page support)
-- ============================================================================

begin;

create or replace function get_asset_by_id(p_asset_id bigint) returns setof assets as $$
  select * from assets where asset_id = p_asset_id;
$$ language sql stable security definer;

-- Sibling to the existing set_asset_condition RPC — operates on the new
-- lifecycle `status` column (In Use/Available/Under Maintenance/.../
-- Retired/Sold/Lost/Written Off) added in 2026081200, distinct from the
-- pre-existing `condition` column which set_asset_condition still owns.
-- Open to manageMaintenance-permitted roles (same gate as the rest of the
-- Asset Register operational page), not finance-restricted.
create or replace function set_asset_status(p_asset_id bigint, p_status text) returns void as $$
begin
  update assets set status = p_status where asset_id = p_asset_id;
end;
$$ language plpgsql security definer;

-- Human-readable asset code (section 6 of the spec) — set once at creation,
-- kept editable since the app can't guarantee uniqueness client-side beyond
-- what's currently loaded on screen; the idx_assets_asset_code unique index
-- in 2026081200 is the actual guarantee.
create or replace function set_asset_code(p_asset_id bigint, p_asset_code text) returns void as $$
begin
  update assets set asset_code = p_asset_code where asset_id = p_asset_id;
end;
$$ language plpgsql security definer;

-- bed_maintenance already exists (Phase 6 maintenance flow); this exposes
-- its rows filtered by the new asset_id FK added in 2026081200, for the
-- Asset Register detail page's Maintenance History section. Assumed column
-- names match get_bed_maintenance_history's existing return shape.
create or replace function get_asset_maintenance_history(p_asset_id bigint)
returns table(
  maintenance_id bigint, bed_id bigint, reason text, start_date date,
  expected_completion_date date, actual_completion_date date, notes text, cost numeric, status text
) as $$
  select maintenance_id, bed_id, reason, start_date, expected_completion_date, actual_completion_date, notes, cost, status
    from bed_maintenance
   where asset_id = p_asset_id
   order by start_date desc;
$$ language sql stable security definer;

commit;
