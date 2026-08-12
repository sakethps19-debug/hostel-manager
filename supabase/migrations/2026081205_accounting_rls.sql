-- ============================================================================
-- Accounting module — role checks, RLS, and privileges
-- ============================================================================
--
-- IMPORTANT: this app's Supabase RPCs run as the single shared `authenticated`
-- Postgres role for every logged-in user (see lib/supabase/client.ts /
-- server.ts) — the business role (owner / operations_manager / finance_manager)
-- lives in profiles.role, not in a distinct Postgres role, and get_my_role()
-- reads it that way. That means:
--   * table-level GRANT/REVOKE cannot distinguish operations_manager from
--     finance_manager — both are just "authenticated" to Postgres
--   * SECURITY DEFINER functions (all the posting functions in this module)
--     bypass RLS on the tables they write to, by design
-- So the actual role enforcement for "only Owner/Finance Manager may do X"
-- has to live INSIDE the function body (checked against profiles.role for
-- auth.uid()), which is what accounting_require_role() below is for, and
-- RLS policies on this module's tables use the same lookup for SELECT
-- (read) access. This mirrors how requirePermission()/hasPermission() in
-- lib/auth.ts and lib/permissions.ts already gate the rest of the app.
-- ============================================================================

begin;

create or replace function accounting_current_role() returns text as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function accounting_require_role(p_allowed_roles text[]) returns void as $$
declare
  v_role text;
begin
  v_role := accounting_current_role();
  if v_role is null or not (v_role = any(p_allowed_roles)) then
    raise exception 'Not authorized: this action requires one of % (current role: %)', p_allowed_roles, coalesce(v_role, 'none');
  end if;
end;
$$ language plpgsql stable security definer;

-- ----------------------------------------------------------------------------
-- Retrofit role checks onto the functions that must be restricted per
-- section 38 of the spec. Every other function in 2026081202/03/04 stays
-- open to any authenticated call (Owner/Finance Manager are the only roles
-- whose pages will ever call the read-heavy report functions per the app's
-- own page-level requirePermission gating — see the frontend PR for the
-- actual UI gates. Defense-in-depth for the SELECT side is handled by RLS
-- below, not by per-function role checks, since these are read functions.)
-- ----------------------------------------------------------------------------

create or replace function post_manual_journal_entry(
  p_entry_date date, p_hostel_name text, p_narration text, p_lines jsonb, p_created_by uuid default null
) returns bigint as $$
begin
  perform accounting_require_role(array['owner', 'finance_manager']);
  return accounting_post_entry(p_entry_date, p_hostel_name, 'manual', null, p_narration, p_lines, coalesce(p_created_by, auth.uid()));
end;
$$ language plpgsql security definer;

create or replace function post_owner_transaction(
  p_transaction_type text, p_amount numeric, p_transaction_date date,
  p_cash_account_code text default '1120', p_hostel_name text default null, p_notes text default null,
  p_created_by uuid default null
) returns bigint as $$
declare
  v_owner_transaction_id bigint;
  v_journal_entry_id bigint;
  v_lines jsonb;
begin
  perform accounting_require_role(array['owner']);

  if p_transaction_type not in ('capital_introduced', 'drawing') then
    raise exception 'post_owner_transaction: invalid transaction_type %', p_transaction_type;
  end if;

  if p_transaction_type = 'capital_introduced' then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', p_cash_account_code, 'debit', p_amount, 'credit', 0),
      jsonb_build_object('account_code', '3100', 'debit', 0, 'credit', p_amount)
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', '3110', 'debit', p_amount, 'credit', 0),
      jsonb_build_object('account_code', p_cash_account_code, 'debit', 0, 'credit', p_amount)
    );
  end if;

  v_journal_entry_id := accounting_post_entry(
    p_transaction_date, p_hostel_name,
    case when p_transaction_type = 'capital_introduced' then 'owner_capital' else 'owner_drawing' end,
    null,
    case when p_transaction_type = 'capital_introduced' then 'Owner capital introduced' else 'Owner drawing' end
      || coalesce(' — ' || p_notes, ''),
    v_lines, coalesce(p_created_by, auth.uid())
  );

  insert into accounting_owner_transactions
    (transaction_type, amount, transaction_date, cash_account_code, hostel_name, notes, journal_entry_id, created_by)
  values
    (p_transaction_type, p_amount, p_transaction_date, p_cash_account_code, p_hostel_name, p_notes, v_journal_entry_id, coalesce(p_created_by, auth.uid()))
  returning owner_transaction_id into v_owner_transaction_id;

  return v_journal_entry_id;
end;
$$ language plpgsql security definer;

create or replace function lock_accounting_period(p_month int, p_year int, p_user uuid default null)
returns void as $$
begin
  perform accounting_require_role(array['owner']);
  insert into accounting_period_locks (period_month, period_year, is_locked, locked_by, locked_at)
  values (p_month, p_year, true, coalesce(p_user, auth.uid()), now())
  on conflict (period_year, period_month)
  do update set is_locked = true, locked_by = coalesce(p_user, auth.uid()), locked_at = now(),
                unlocked_by = null, unlocked_at = null;
end;
$$ language plpgsql security definer;

create or replace function unlock_accounting_period(p_month int, p_year int, p_user uuid default null)
returns void as $$
begin
  perform accounting_require_role(array['owner']);
  insert into accounting_period_locks (period_month, period_year, is_locked, unlocked_by, unlocked_at)
  values (p_month, p_year, false, coalesce(p_user, auth.uid()), now())
  on conflict (period_year, period_month)
  do update set is_locked = false, unlocked_by = coalesce(p_user, auth.uid()), unlocked_at = now();
end;
$$ language plpgsql security definer;

create or replace function accounting_reverse_entry(
  p_journal_entry_id bigint, p_reversal_date date default current_date, p_reason text default null, p_created_by uuid default null
) returns bigint as $$
declare
  v_original accounting_journal_entries%rowtype;
  v_reversal_id bigint;
  v_lines jsonb;
begin
  perform accounting_require_role(array['owner', 'finance_manager']);

  select * into v_original from accounting_journal_entries where journal_entry_id = p_journal_entry_id;
  if not found then
    raise exception 'accounting_reverse_entry: journal entry % not found', p_journal_entry_id;
  end if;
  if v_original.status = 'reversed' then
    raise exception 'accounting_reverse_entry: journal entry % is already reversed', p_journal_entry_id;
  end if;

  select jsonb_agg(jsonb_build_object(
    'account_code', a.code, 'debit', l.credit, 'credit', l.debit,
    'hostel_name', l.hostel_name, 'resident_id', l.resident_id, 'booking_id', l.booking_id,
    'vendor_id', l.vendor_id, 'asset_id', l.asset_id, 'memo', l.memo
  ))
  into v_lines
  from accounting_journal_entry_lines l
  join accounting_accounts a on a.account_id = l.account_id
  where l.journal_entry_id = p_journal_entry_id;

  v_reversal_id := accounting_post_entry(
    p_reversal_date, v_original.hostel_name, 'reversal', p_journal_entry_id,
    coalesce('Reversal of #' || p_journal_entry_id || ': ' || v_original.narration ||
             case when p_reason is not null then ' — ' || p_reason else '' end,
             'Reversal of #' || p_journal_entry_id),
    v_lines, coalesce(p_created_by, auth.uid())
  );

  update accounting_journal_entries set status = 'reversed', reversed_by_journal_entry_id = v_reversal_id
   where journal_entry_id = p_journal_entry_id;
  update accounting_journal_entries set reverses_journal_entry_id = p_journal_entry_id
   where journal_entry_id = v_reversal_id;

  return v_reversal_id;
end;
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- Chart of Accounts / asset-category configuration CRUD (Owner only —
-- "Do not allow ordinary Operations users to change accounting
-- configuration", section 46)
-- ----------------------------------------------------------------------------

create or replace function create_accounting_account(
  p_code text, p_name text, p_account_type text, p_normal_balance text,
  p_account_subtype text default null, p_parent_account_id bigint default null, p_description text default null
) returns bigint as $$
declare
  v_account_id bigint;
begin
  perform accounting_require_role(array['owner']);
  insert into accounting_accounts (code, name, account_type, account_subtype, normal_balance, parent_account_id, description, is_system)
  values (p_code, p_name, p_account_type, p_account_subtype, p_normal_balance, p_parent_account_id, p_description, false)
  returning account_id into v_account_id;
  return v_account_id;
end;
$$ language plpgsql security definer;

create or replace function set_accounting_account_active(p_account_id bigint, p_is_active boolean) returns void as $$
begin
  perform accounting_require_role(array['owner']);
  if (select is_system from accounting_accounts where account_id = p_account_id) and not p_is_active then
    raise exception 'set_accounting_account_active: cannot deactivate a system account (id %)', p_account_id;
  end if;
  update accounting_accounts set is_active = p_is_active where account_id = p_account_id;
end;
$$ language plpgsql security definer;

create or replace function set_accounting_setting(p_key text, p_value text) returns void as $$
begin
  perform accounting_require_role(array['owner']);
  insert into accounting_settings (setting_key, setting_value, updated_by, updated_at)
  values (p_key, p_value, auth.uid(), now())
  on conflict (setting_key) do update set setting_value = excluded.setting_value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end;
$$ language plpgsql security definer;

-- Asset finance-field updates (cost/depreciation/GL mapping/disposal) —
-- Owner + Finance Manager only. Operational fields (condition, status,
-- location, service dates) stay reachable via the existing
-- set_asset_condition RPC and the operational asset-transfer function below,
-- which Operations Manager keeps using exactly as today.
create or replace function update_asset_finance_fields(
  p_asset_id bigint, p_purchase_cost numeric default null, p_vendor_id bigint default null,
  p_invoice_number text default null, p_payment_mode text default null, p_serial_number text default null,
  p_model text default null, p_brand text default null, p_warranty_start_date date default null,
  p_warranty_expiry date default null, p_useful_life_months int default null, p_depreciation_method text default null,
  p_residual_value numeric default null, p_depreciation_start_date date default null, p_gl_account_id bigint default null
) returns void as $$
begin
  perform accounting_require_role(array['owner', 'finance_manager']);
  update assets set
    purchase_cost = coalesce(p_purchase_cost, purchase_cost),
    vendor_id = coalesce(p_vendor_id, vendor_id),
    invoice_number = coalesce(p_invoice_number, invoice_number),
    payment_mode = coalesce(p_payment_mode, payment_mode),
    serial_number = coalesce(p_serial_number, serial_number),
    model = coalesce(p_model, model),
    brand = coalesce(p_brand, brand),
    warranty_start_date = coalesce(p_warranty_start_date, warranty_start_date),
    warranty_expiry = coalesce(p_warranty_expiry, warranty_expiry),
    useful_life_months = coalesce(p_useful_life_months, useful_life_months),
    depreciation_method = coalesce(p_depreciation_method, depreciation_method),
    residual_value = coalesce(p_residual_value, residual_value),
    depreciation_start_date = coalesce(p_depreciation_start_date, depreciation_start_date),
    gl_account_id = coalesce(p_gl_account_id, gl_account_id)
   where asset_id = p_asset_id;
end;
$$ language plpgsql security definer;

create or replace function post_asset_disposal_journal(
  p_asset_id bigint, p_disposal_date date, p_sale_proceeds numeric, p_buyer text, p_reason text,
  p_created_by uuid default null
) returns bigint as $$
declare
  v_asset assets%rowtype;
  v_gl_code text;
  v_book_value numeric;
  v_gain_loss numeric;
  v_journal_entry_id bigint;
  v_lines jsonb;
  v_cash_code text := '1120';
begin
  perform accounting_require_role(array['owner', 'finance_manager']);

  select * into v_asset from assets where asset_id = p_asset_id;
  if not found then
    raise exception 'post_asset_disposal_journal: asset % not found', p_asset_id;
  end if;
  if exists (select 1 from asset_disposals where asset_id = p_asset_id) then
    raise exception 'post_asset_disposal_journal: asset % already disposed', p_asset_id;
  end if;

  if v_asset.gl_account_id is not null then
    select code into v_gl_code from accounting_accounts where account_id = v_asset.gl_account_id;
  else
    select a.code into v_gl_code
      from asset_categories c join accounting_accounts a on a.account_id = c.default_gl_account_id
     where c.name = v_asset.category;
  end if;
  if v_gl_code is null then
    v_gl_code := '1229';
  end if;

  v_book_value := coalesce(v_asset.purchase_cost, 0) - coalesce(v_asset.accumulated_depreciation, 0);
  v_gain_loss := coalesce(p_sale_proceeds, 0) - v_book_value;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', v_cash_code, 'debit', greatest(p_sale_proceeds, 0), 'credit', 0, 'asset_id', p_asset_id),
    jsonb_build_object('account_code', '1290', 'debit', coalesce(v_asset.accumulated_depreciation, 0), 'credit', 0, 'asset_id', p_asset_id),
    jsonb_build_object('account_code', v_gl_code, 'debit', 0, 'credit', coalesce(v_asset.purchase_cost, 0), 'asset_id', p_asset_id)
  );

  if v_gain_loss > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code', '4195', 'debit', 0, 'credit', v_gain_loss, 'asset_id', p_asset_id));
  elsif v_gain_loss < 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code', '5295', 'debit', -v_gain_loss, 'credit', 0, 'asset_id', p_asset_id));
  end if;

  v_journal_entry_id := accounting_post_entry(
    p_disposal_date, v_asset.hostel_name, 'asset_disposal', p_asset_id,
    'Disposal — ' || v_asset.name || coalesce(' to ' || p_buyer, ''),
    v_lines, coalesce(p_created_by, auth.uid())
  );

  insert into asset_disposals
    (asset_id, disposal_date, sale_proceeds, buyer, reason, book_value_at_disposal, gain_loss, journal_entry_id, created_by)
  values
    (p_asset_id, p_disposal_date, coalesce(p_sale_proceeds, 0), p_buyer, p_reason, v_book_value, v_gain_loss, v_journal_entry_id, coalesce(p_created_by, auth.uid()));

  update assets set status = case when p_sale_proceeds > 0 then 'sold' else 'written_off' end
   where asset_id = p_asset_id;

  return v_journal_entry_id;
end;
$$ language plpgsql security definer;

-- Operational asset transfer — Operations Manager may use this (location
-- movement only, no cost/finance fields touched).
create or replace function transfer_asset(
  p_asset_id bigint, p_to_hostel_name text, p_to_room_number text, p_to_bed_code text,
  p_reason text default null, p_notes text default null
) returns bigint as $$
declare
  v_asset assets%rowtype;
  v_transfer_id bigint;
begin
  perform accounting_require_role(array['owner', 'operations_manager', 'finance_manager']);

  select * into v_asset from assets where asset_id = p_asset_id;
  if not found then
    raise exception 'transfer_asset: asset % not found', p_asset_id;
  end if;

  insert into asset_transfers
    (asset_id, from_hostel_name, from_room_number, from_bed_code, to_hostel_name, to_room_number, to_bed_code, transferred_by, reason, notes)
  values
    (p_asset_id, v_asset.hostel_name, v_asset.room_number, v_asset.bed_code, p_to_hostel_name, p_to_room_number, p_to_bed_code, auth.uid(), p_reason, p_notes)
  returning transfer_id into v_transfer_id;

  update assets set hostel_name = p_to_hostel_name, room_number = p_to_room_number, bed_code = p_to_bed_code
   where asset_id = p_asset_id;

  return v_transfer_id;
end;
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
-- Read policy for owner + finance_manager on every finance/accounting table;
-- Operations Manager gets read access only to the operational asset-location
-- slice, enforced at the application/RPC layer (get_assets already returns
-- the finance fields today for manageMaintenance-gated pages, so the
-- frontend PR introduces a SEPARATE operational asset RPC/view that omits
-- purchase_cost/depreciation for Operations Manager — RLS on the base
-- `assets` table cannot do column-level filtering by role on its own, so
-- this is enforced by which RPC/columns the frontend requests, matching
-- how the rest of the app already handles role-scoped visibility).

alter table accounting_accounts enable row level security;
alter table accounting_journal_entries enable row level security;
alter table accounting_journal_entry_lines enable row level security;
alter table accounting_period_locks enable row level security;
alter table asset_categories enable row level security;
alter table asset_transfers enable row level security;
alter table asset_disposals enable row level security;
alter table asset_documents enable row level security;
alter table asset_depreciation_entries enable row level security;
alter table accounting_payables enable row level security;
alter table accounting_payable_payments enable row level security;
alter table accounting_rent_accruals enable row level security;
alter table accounting_opening_balance_batches enable row level security;
alter table accounting_opening_balance_lines enable row level security;
alter table accounting_balance_snapshots enable row level security;
alter table accounting_reconciliation_flags enable row level security;
alter table accounting_settings enable row level security;
alter table accounting_owner_transactions enable row level security;

do $$
declare
  v_table text;
  v_finance_tables text[] := array[
    'accounting_accounts', 'accounting_journal_entries', 'accounting_journal_entry_lines',
    'accounting_period_locks', 'asset_categories', 'asset_transfers', 'asset_disposals',
    'asset_documents', 'asset_depreciation_entries', 'accounting_payables', 'accounting_payable_payments',
    'accounting_rent_accruals', 'accounting_opening_balance_batches', 'accounting_opening_balance_lines',
    'accounting_balance_snapshots', 'accounting_reconciliation_flags', 'accounting_settings',
    'accounting_owner_transactions'
  ];
begin
  foreach v_table in array v_finance_tables loop
    execute format(
      'drop policy if exists finance_read on %I; create policy finance_read on %I for select using (accounting_current_role() in (''owner'',''finance_manager''));',
      v_table, v_table
    );
  end loop;
end;
$$;

-- asset_transfers additionally readable/insertable by Operations Manager
-- (operational movement, not a finance figure).
drop policy if exists ops_read_transfers on asset_transfers;
create policy ops_read_transfers on asset_transfers for select
  using (accounting_current_role() in ('owner', 'finance_manager', 'operations_manager'));

-- No direct INSERT/UPDATE/DELETE policies are created for
-- accounting_journal_entries/_lines — every write goes through the
-- SECURITY DEFINER functions in 2026081202/03, which run with the
-- function owner's privileges and are the only supported write path.
-- (RLS with no matching policy for a command denies it by default.)

commit;
