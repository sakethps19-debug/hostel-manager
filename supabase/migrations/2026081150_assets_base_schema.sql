-- ============================================================================
-- Asset Register — BASE schema (bootstrap)
-- ============================================================================
--
-- WHY THIS FILE EXISTS: app/settings/assets/ (AssetsTable.tsx, page.tsx,
-- the asset detail page) already calls get_assets / add_asset /
-- set_asset_condition as if the `assets` table and these RPCs already
-- existed live. Running 2026081200_accounting_schema.sql against the real
-- database failed with "relation \"assets\" does not exist" — confirmed via
-- `select table_name from information_schema.tables where table_schema =
-- 'public'`, which lists residents/bookings/payments/expenses/vendors/
-- profiles/bed_maintenance/etc. but no assets table at all. So the Asset
-- Register feature's backing table and RPCs were never actually created in
-- this database; the frontend calling them has been non-functional.
--
-- This is NOT "recreating inventory" (there is no existing assets data to
-- conflict with) — it's finishing the one part of the existing feature that
-- was apparently never deployed, using the exact shape
-- app/settings/assets/types.ts's base AssetRow fields and the exact RPC
-- parameter names AssetsTable.tsx already sends, so the pre-existing
-- frontend code starts working unmodified. Run this BEFORE
-- 2026081200_accounting_schema.sql (hence the earlier timestamp), which
-- then additively extends this same table with the new finance columns.
-- ============================================================================

begin;

create table if not exists assets (
  asset_id         bigint generated always as identity primary key,
  name             text not null,
  category         text not null,
  hostel_name      text,
  room_number      text,
  bed_code         text,
  bed_id           bigint,
  purchase_date    date,
  purchase_cost    numeric(12,2),
  condition        text not null default 'Good' check (condition in ('Good','Fair','Needs Repair','Disposed')),
  warranty_expiry  date,
  notes            text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_assets_hostel on assets(hostel_name);
create index if not exists idx_assets_bed_id on assets(bed_id) where bed_id is not null;

create or replace function get_assets() returns setof assets as $$
  select * from assets order by created_at desc;
$$ language sql stable security definer;

create or replace function add_asset(
  p_name text, p_category text, p_hostel_name text default null, p_room_number text default null,
  p_bed_code text default null, p_purchase_date date default null, p_purchase_cost numeric default null,
  p_condition text default 'Good', p_warranty_expiry date default null, p_notes text default null
) returns bigint as $$
declare
  v_asset_id bigint;
begin
  insert into assets (name, category, hostel_name, room_number, bed_code, purchase_date, purchase_cost, condition, warranty_expiry, notes)
  values (p_name, p_category, p_hostel_name, p_room_number, p_bed_code, p_purchase_date, p_purchase_cost, coalesce(p_condition, 'Good'), p_warranty_expiry, p_notes)
  returning asset_id into v_asset_id;
  return v_asset_id;
end;
$$ language plpgsql security definer;

create or replace function set_asset_condition(p_asset_id bigint, p_condition text) returns void as $$
begin
  update assets set condition = p_condition where asset_id = p_asset_id;
end;
$$ language plpgsql security definer;

commit;
