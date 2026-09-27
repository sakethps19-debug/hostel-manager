-- ============================================================================
-- Accounting module — close the SECURITY DEFINER role-check gap
-- ============================================================================
--
-- WHY THIS FILE EXISTS: 2026081205_accounting_rls.sql documents that every
-- SECURITY DEFINER function bypasses RLS by design, so "only Owner/Finance
-- Manager may do X" has to be enforced INSIDE the function body via
-- accounting_require_role() — it then retrofits that check onto a specific
-- list of functions. 2026081206_accounting_functions_crud.sql and
-- 2026081207_accounting_functions_addenda.sql were added afterwards and
-- introduced several more SECURITY DEFINER functions that never went
-- through that retrofit pass. Since this app's RPCs all run as the single
-- shared `authenticated` Postgres role (the business role lives in
-- profiles.role, not a distinct Postgres role — see 2026081205's own header
-- comment), any authenticated user can currently call these functions
-- directly (e.g. via supabase.rpc(...) from a browser console) and read
-- full journal entries, payables, owner capital/drawing history, etc.,
-- bypassing both the frontend's requirePermission("viewFinancialReports")
-- gate and the RLS finance_read policies that were supposed to be the
-- actual backstop for this data.
--
-- This file re-declares each affected function with the SAME body as
-- before, adding only the missing accounting_require_role() call at the
-- top — every other line is unchanged from where the function was last
-- defined.
-- ============================================================================

begin;

-- Chart of accounts / asset categories — read access matches finance_read
-- RLS elsewhere (owner, finance_manager), EXCEPT asset_categories, which
-- must also stay reachable by operations_manager: the Asset Register page
-- (gated by viewAssetRegister = owner+operations_manager+finance_manager)
-- calls get_asset_categories() to populate its category dropdown for all
-- three roles.
create or replace function get_chart_of_accounts() returns setof accounting_accounts as $$
begin
  perform accounting_require_role(array['owner', 'finance_manager']);
  return query select * from accounting_accounts order by code;
end;
$$ language plpgsql stable security definer;

create or replace function get_asset_categories() returns setof asset_categories as $$
begin
  perform accounting_require_role(array['owner', 'operations_manager', 'finance_manager']);
  return query select * from asset_categories where is_active order by name;
end;
$$ language plpgsql stable security definer;

-- Journal entries browser
create or replace function get_journal_entries(
  p_start_date date, p_end_date date, p_hostel_name text default null, p_source_type text default null
) returns table(
  journal_entry_id bigint, entry_date date, hostel_name text, source_type text, source_id bigint,
  narration text, status text, total_amount numeric, created_at timestamptz
) as $$
begin
  perform accounting_require_role(array['owner', 'finance_manager']);
  return query
  select je.journal_entry_id, je.entry_date, je.hostel_name, je.source_type, je.source_id,
         je.narration, je.status, coalesce(sum(l.debit), 0), je.created_at
    from accounting_journal_entries je
    join accounting_journal_entry_lines l on l.journal_entry_id = je.journal_entry_id
   where je.entry_date between p_start_date and p_end_date
     and (p_hostel_name is null or je.hostel_name = p_hostel_name)
     and (p_source_type is null or je.source_type = p_source_type)
   group by je.journal_entry_id
   order by je.entry_date desc, je.journal_entry_id desc;
end;
$$ language plpgsql stable security definer;

create or replace function get_journal_entry_lines(p_journal_entry_id bigint)
returns table(
  journal_entry_line_id bigint, account_code text, account_name text, debit numeric, credit numeric,
  hostel_name text, resident_id bigint, booking_id bigint, vendor_id bigint, asset_id bigint, memo text
) as $$
begin
  perform accounting_require_role(array['owner', 'finance_manager']);
  return query
  select l.journal_entry_line_id, a.code, a.name, l.debit, l.credit,
         l.hostel_name, l.resident_id, l.booking_id, l.vendor_id, l.asset_id, l.memo
    from accounting_journal_entry_lines l
    join accounting_accounts a on a.account_id = l.account_id
   where l.journal_entry_id = p_journal_entry_id
   order by l.journal_entry_line_id;
end;
$$ language plpgsql stable security definer;

create or replace function get_journal_entry(p_journal_entry_id bigint)
returns table(
  journal_entry_id bigint, entry_date date, hostel_name text, source_type text, source_id bigint,
  narration text, status text, total_amount numeric, created_at timestamptz
) as $$
begin
  perform accounting_require_role(array['owner', 'finance_manager']);
  return query
  select je.journal_entry_id, je.entry_date, je.hostel_name, je.source_type, je.source_id,
         je.narration, je.status, coalesce((select sum(debit) from accounting_journal_entry_lines where journal_entry_id = je.journal_entry_id), 0),
         je.created_at
    from accounting_journal_entries je
   where je.journal_entry_id = p_journal_entry_id;
end;
$$ language plpgsql stable security definer;

-- Payables
create or replace function get_payables(p_hostel_name text default null) returns setof accounting_payables as $$
begin
  perform accounting_require_role(array['owner', 'finance_manager']);
  return query
  select * from accounting_payables
   where (p_hostel_name is null or hostel_name = p_hostel_name)
   order by due_date;
end;
$$ language plpgsql stable security definer;

-- Balance snapshots
create or replace function get_balance_snapshots(p_hostel_name text default null, p_from_date date default null, p_to_date date default current_date)
returns setof accounting_balance_snapshots as $$
begin
  perform accounting_require_role(array['owner', 'finance_manager']);
  return query
  select * from accounting_balance_snapshots
   where (p_hostel_name is null or hostel_name = p_hostel_name)
     and (p_from_date is null or snapshot_date >= p_from_date)
     and snapshot_date <= p_to_date
   order by snapshot_date;
end;
$$ language plpgsql stable security definer;

-- Reconciliation flags
create or replace function get_reconciliation_flags(p_include_resolved boolean default false)
returns setof accounting_reconciliation_flags as $$
begin
  perform accounting_require_role(array['owner', 'finance_manager']);
  return query
  select * from accounting_reconciliation_flags
   where p_include_resolved or resolved_at is null
   order by detected_at desc;
end;
$$ language plpgsql stable security definer;

-- Opening balances (writes are already owner-only; reads match that)
create or replace function get_opening_balance_batches() returns setof accounting_opening_balance_batches as $$
begin
  perform accounting_require_role(array['owner', 'finance_manager']);
  return query select * from accounting_opening_balance_batches order by as_of_date desc;
end;
$$ language plpgsql stable security definer;

create or replace function get_opening_balance_lines(p_batch_id bigint)
returns table(line_id bigint, account_code text, account_name text, hostel_name text, debit numeric, credit numeric, notes text) as $$
begin
  perform accounting_require_role(array['owner', 'finance_manager']);
  return query
  select l.line_id, a.code, a.name, l.hostel_name, l.debit, l.credit, l.notes
    from accounting_opening_balance_lines l
    join accounting_accounts a on a.account_id = l.account_id
   where l.batch_id = p_batch_id
   order by a.code;
end;
$$ language plpgsql stable security definer;

-- Owner's personal capital/drawing history — Owner only, more sensitive
-- than general finance data.
create or replace function get_owner_transactions() returns setof accounting_owner_transactions as $$
begin
  perform accounting_require_role(array['owner']);
  return query select * from accounting_owner_transactions order by transaction_date desc;
end;
$$ language plpgsql stable security definer;

-- Rent accrual status — matches post_rent_accrual's own role check.
create or replace function get_rent_accrual_status(p_period_year int, p_period_month int)
returns table(total_active_bookings int, already_accrued int, pending int) as $$
declare
  v_period_start date := make_date(p_period_year, p_period_month, 1);
  v_total int;
  v_accrued int;
begin
  perform accounting_require_role(array['owner', 'finance_manager']);

  select count(*) into v_total from bookings
   where status = 'confirmed'
     and start_date <= (v_period_start + interval '1 month - 1 day')
     and (end_date is null or end_date >= v_period_start);

  select count(*) into v_accrued from accounting_rent_accruals
   where period_year = p_period_year and period_month = p_period_month;

  return query select v_total, v_accrued, greatest(v_total - v_accrued, 0);
end;
$$ language plpgsql stable security definer;

-- Reconciliation catch-up / checks — these post journal entries and insert
-- flags, matching the role required by the individual posting functions
-- they call (post_payment_journal, post_expense_journal, etc. are meant to
-- be run by Owner/Finance Manager, not any authenticated user).
create or replace function reconcile_journal_postings(p_created_by uuid default null)
returns table(entity text, posted_count int) as $$
declare
  v_row record;
  v_payment_count int := 0;
  v_expense_count int := 0;
  v_asset_count int := 0;
begin
  perform accounting_require_role(array['owner', 'finance_manager']);

  for v_row in
    select p.id as payment_id from payments p
     where p.status <> 'reversed'
       and not exists (select 1 from accounting_journal_entries je where je.source_type = 'payment' and je.source_id = p.id)
  loop
    if post_payment_journal(v_row.payment_id, coalesce(p_created_by, auth.uid())) is not null then
      v_payment_count := v_payment_count + 1;
    end if;
  end loop;

  for v_row in
    select e.id as expense_id from expenses e
     where not exists (select 1 from accounting_journal_entries je where je.source_type = 'expense' and je.source_id = e.id)
  loop
    if post_expense_journal(v_row.expense_id, coalesce(p_created_by, auth.uid())) is not null then
      v_expense_count := v_expense_count + 1;
    end if;
  end loop;

  for v_row in
    select a.asset_id from assets a
     where a.purchase_cost > 0
       and not exists (select 1 from accounting_journal_entries je where je.source_type = 'asset_purchase' and je.source_id = a.asset_id)
  loop
    if post_asset_purchase_journal(v_row.asset_id, coalesce(p_created_by, auth.uid())) is not null then
      v_asset_count := v_asset_count + 1;
    end if;
  end loop;

  return query values ('payments', v_payment_count), ('expenses', v_expense_count), ('assets', v_asset_count);
end;
$$ language plpgsql security definer;

create or replace function accounting_raise_flag_if_new(
  p_flag_type text, p_description text, p_source_type text, p_source_id bigint, p_variance numeric default null
) returns boolean as $$
begin
  perform accounting_require_role(array['owner', 'finance_manager']);

  if exists (
    select 1 from accounting_reconciliation_flags
     where flag_type = p_flag_type
       and coalesce(related_source_type, '') = coalesce(p_source_type, '')
       and coalesce(related_source_id, -1) = coalesce(p_source_id, -1)
       and resolved_at is null
  ) then
    return false;
  end if;
  insert into accounting_reconciliation_flags (flag_type, description, related_source_type, related_source_id, amount_variance)
  values (p_flag_type, p_description, p_source_type, p_source_id, p_variance);
  return true;
end;
$$ language plpgsql security definer;

create or replace function run_accounting_reconciliation_checks(p_as_of_date date default current_date)
returns int as $$
declare
  v_flag_count int := 0;
  v_row record;
  v_debit numeric;
  v_credit numeric;
begin
  perform accounting_require_role(array['owner', 'finance_manager']);

  select coalesce(sum(debit_balance), 0), coalesce(sum(credit_balance), 0) into v_debit, v_credit
    from get_trial_balance(p_as_of_date);
  if round(v_debit, 2) <> round(v_credit, 2) then
    if accounting_raise_flag_if_new('trial_balance_unbalanced',
      'Trial balance does not balance as of ' || p_as_of_date, null, null, v_debit - v_credit)
    then v_flag_count := v_flag_count + 1; end if;
  end if;

  if not verify_balance_sheet_balances(p_as_of_date) then
    if accounting_raise_flag_if_new('balance_sheet_unbalanced',
      'Balance Sheet does not balance as of ' || p_as_of_date, null, null, null)
    then v_flag_count := v_flag_count + 1; end if;
  end if;

  for v_row in
    select id as payment_id from payments
     where status <> 'reversed'
       and not exists (select 1 from accounting_journal_entries where source_type = 'payment' and source_id = payments.id)
  loop
    if accounting_raise_flag_if_new('unjournaled_payment', 'Payment has no journal entry', 'payment', v_row.payment_id)
    then v_flag_count := v_flag_count + 1; end if;
  end loop;

  for v_row in
    select id as expense_id from expenses
     where not exists (select 1 from accounting_journal_entries where source_type = 'expense' and source_id = expenses.id)
  loop
    if accounting_raise_flag_if_new('unjournaled_expense', 'Expense has no journal entry', 'expense', v_row.expense_id)
    then v_flag_count := v_flag_count + 1; end if;
  end loop;

  for v_row in
    select asset_id from assets
     where purchase_cost > 0
       and not exists (select 1 from accounting_journal_entries where source_type = 'asset_purchase' and source_id = asset_id)
  loop
    if accounting_raise_flag_if_new('unjournaled_asset', 'Asset purchase has no journal entry', 'asset', v_row.asset_id)
    then v_flag_count := v_flag_count + 1; end if;
  end loop;

  for v_row in
    select je.journal_entry_id
      from accounting_journal_entries je
      join accounting_journal_entry_lines l on l.journal_entry_id = je.journal_entry_id
     where je.status = 'posted'
     group by je.journal_entry_id
    having round(sum(l.debit), 2) <> round(sum(l.credit), 2)
  loop
    if accounting_raise_flag_if_new('unbalanced_journal_entry', 'Journal entry does not balance', 'journal_entry', v_row.journal_entry_id)
    then v_flag_count := v_flag_count + 1; end if;
  end loop;

  for v_row in
    select l.journal_entry_line_id
      from accounting_journal_entry_lines l
     where not exists (select 1 from accounting_journal_entries je where je.journal_entry_id = l.journal_entry_id)
  loop
    if accounting_raise_flag_if_new('orphan_journal_line', 'Journal entry line has no parent entry', 'journal_entry_line', v_row.journal_entry_line_id)
    then v_flag_count := v_flag_count + 1; end if;
  end loop;

  for v_row in
    select a.asset_id, a.accumulated_depreciation as cached,
           coalesce((select sum(l.credit) - sum(l.debit) from accounting_journal_entry_lines l
                       join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
                      where l.asset_id = a.asset_id and l.account_id = accounting_get_account_id('1290')
                        and je.status = 'posted'), 0) as ledger
      from assets a
     where a.capitalized = true
  loop
    if round(v_row.cached, 2) <> round(v_row.ledger, 2) then
      if accounting_raise_flag_if_new('asset_register_vs_ledger',
        'Asset accumulated depreciation cache does not match ledger', 'asset', v_row.asset_id, v_row.cached - v_row.ledger)
      then v_flag_count := v_flag_count + 1; end if;
    end if;
  end loop;

  for v_row in
    select booking_id, outstanding from get_accounts_receivable() where outstanding < 0
  loop
    if accounting_raise_flag_if_new('ar_negative_balance',
      'AR-Rent has a credit (negative) balance — likely an overpayment not yet reclassified to Advance Rent Received',
      'booking', v_row.booking_id, v_row.outstanding)
    then v_flag_count := v_flag_count + 1; end if;
  end loop;

  return v_flag_count;
end;
$$ language plpgsql security definer;

commit;
