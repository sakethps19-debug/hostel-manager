-- ============================================================================
-- Same fix as record_payment/record_expense, applied to asset purchases.
-- AssetsTable.tsx called add_asset, then (optionally) set_asset_code, then
-- (optionally) update_asset_finance_fields, then post_asset_purchase_journal
-- wrapped in an empty catch block - four separate round-trips, with the
-- asset row committed by the first call regardless of whether the later
-- steps (including the accounting entry) succeeded.
--
-- add_asset now accepts the two fields this form actually sets outside the
-- base insert (asset_code, payment_mode) directly, and posts the purchase
-- journal itself, all in one transaction. update_asset_finance_fields and
-- set_asset_code are left in place unchanged (still used by
-- AssetDetailView.tsx for editing an existing asset's fuller
-- finance/depreciation fields), just no longer needed for the initial
-- add-asset flow.
--
-- Verified live via a rolled-back transaction: posts a balanced journal
-- entry (Dr fixed-asset or expense account / Cr cash-bank account,
-- depending on the capitalization threshold) in the same call as the
-- asset insert.
-- ============================================================================
begin;

drop function if exists add_asset(text,text,text,text,text,date,numeric,text,date,text);

create or replace function add_asset(
  p_name text,
  p_category text,
  p_hostel_name text default null,
  p_room_number text default null,
  p_bed_code text default null,
  p_purchase_date date default null,
  p_purchase_cost numeric default null,
  p_condition text default 'Good',
  p_warranty_expiry date default null,
  p_notes text default null,
  p_asset_code text default null,
  p_payment_mode text default null
)
returns bigint
language plpgsql security definer set search_path to 'public' as $$
declare
  v_asset_id bigint;
begin
  perform require_role(array['owner','operations_manager','finance_manager']);

  insert into assets (
    name, category, hostel_name, room_number, bed_code, purchase_date,
    purchase_cost, condition, warranty_expiry, notes, asset_code, payment_mode
  )
  values (
    p_name, p_category, p_hostel_name, p_room_number, p_bed_code, p_purchase_date,
    p_purchase_cost, coalesce(p_condition, 'Good'), p_warranty_expiry, p_notes,
    nullif(trim(p_asset_code), ''), p_payment_mode
  )
  returning asset_id into v_asset_id;

  if p_purchase_cost is not null and p_purchase_cost > 0 then
    perform post_asset_purchase_journal(v_asset_id, auth.uid());
  end if;

  return v_asset_id;
end;
$$;

commit;
