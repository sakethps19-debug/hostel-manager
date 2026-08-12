-- ============================================================================
-- Accounting module — simple list/CRUD RPCs
-- ============================================================================
-- The rest of this app exclusively calls named RPCs (callRpcServer/
-- callRpcClient with .rpc(name, params)), never PostgREST's direct table
-- API — these wrappers follow that convention for every new list/mutate
-- operation the frontend needs that isn't already covered by the posting/
-- reporting functions in 2026081202-04.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Chart of Accounts / asset categories (read)
-- ----------------------------------------------------------------------------

create or replace function get_chart_of_accounts() returns setof accounting_accounts as $$
  select * from accounting_accounts order by code;
$$ language sql stable security definer;

create or replace function get_asset_categories() returns setof asset_categories as $$
  select * from asset_categories where is_active order by name;
$$ language sql stable security definer;

-- ----------------------------------------------------------------------------
-- Journal entries browser (list entries + their lines together, for a
-- Journal Entries page / drill-down from any statement)
-- ----------------------------------------------------------------------------

create or replace function get_journal_entries(
  p_start_date date, p_end_date date, p_hostel_name text default null, p_source_type text default null
) returns table(
  journal_entry_id bigint, entry_date date, hostel_name text, source_type text, source_id bigint,
  narration text, status text, total_amount numeric, created_at timestamptz
) as $$
  select je.journal_entry_id, je.entry_date, je.hostel_name, je.source_type, je.source_id,
         je.narration, je.status, coalesce(sum(l.debit), 0), je.created_at
    from accounting_journal_entries je
    join accounting_journal_entry_lines l on l.journal_entry_id = je.journal_entry_id
   where je.entry_date between p_start_date and p_end_date
     and (p_hostel_name is null or je.hostel_name = p_hostel_name)
     and (p_source_type is null or je.source_type = p_source_type)
   group by je.journal_entry_id
   order by je.entry_date desc, je.journal_entry_id desc;
$$ language sql stable security definer;

create or replace function get_journal_entry_lines(p_journal_entry_id bigint)
returns table(
  journal_entry_line_id bigint, account_code text, account_name text, debit numeric, credit numeric,
  hostel_name text, resident_id bigint, booking_id bigint, vendor_id bigint, asset_id bigint, memo text
) as $$
  select l.journal_entry_line_id, a.code, a.name, l.debit, l.credit,
         l.hostel_name, l.resident_id, l.booking_id, l.vendor_id, l.asset_id, l.memo
    from accounting_journal_entry_lines l
    join accounting_accounts a on a.account_id = l.account_id
   where l.journal_entry_id = p_journal_entry_id
   order by l.journal_entry_line_id;
$$ language sql stable security definer;

-- ----------------------------------------------------------------------------
-- Payables (list + create invoice + record payment)
-- ----------------------------------------------------------------------------

create or replace function get_payables(p_hostel_name text default null) returns setof accounting_payables as $$
  select * from accounting_payables
   where (p_hostel_name is null or hostel_name = p_hostel_name)
   order by due_date;
$$ language sql stable security definer;

create or replace function add_payable(
  p_vendor_id bigint, p_vendor_name text, p_hostel_name text, p_category text, p_invoice_number text,
  p_invoice_date date, p_due_date date, p_amount numeric, p_notes text default null, p_attachment_path text default null
) returns bigint as $$
declare
  v_payable_id bigint;
begin
  perform accounting_require_role(array['owner', 'finance_manager']);

  insert into accounting_payables
    (vendor_id, vendor_name, hostel_name, category, invoice_number, invoice_date, due_date, amount, notes, attachment_path, created_by)
  values
    (p_vendor_id, p_vendor_name, p_hostel_name, p_category, p_invoice_number, p_invoice_date, p_due_date, p_amount, p_notes, p_attachment_path, auth.uid())
  returning payable_id into v_payable_id;

  perform post_payable_invoice(v_payable_id, auth.uid());

  return v_payable_id;
end;
$$ language plpgsql security definer;

create or replace function record_payable_payment(
  p_payable_id bigint, p_payment_date date, p_amount numeric, p_payment_mode text,
  p_reference_number text default null, p_notes text default null
) returns bigint as $$
declare
  v_payable_payment_id bigint;
begin
  perform accounting_require_role(array['owner', 'finance_manager']);

  insert into accounting_payable_payments (payable_id, payment_date, amount, payment_mode, reference_number, notes, created_by)
  values (p_payable_id, p_payment_date, p_amount, p_payment_mode, p_reference_number, p_notes, auth.uid())
  returning payable_payment_id into v_payable_payment_id;

  perform post_payable_payment(v_payable_payment_id, auth.uid());

  return v_payable_payment_id;
end;
$$ language plpgsql security definer;

create or replace function cancel_payable(p_payable_id bigint) returns void as $$
begin
  perform accounting_require_role(array['owner', 'finance_manager']);
  if (select amount_paid from accounting_payables where payable_id = p_payable_id) > 0 then
    raise exception 'cancel_payable: cannot cancel a payable that already has payments recorded against it';
  end if;
  update accounting_payables set status = 'cancelled' where payable_id = p_payable_id;
end;
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- Balance snapshots (read range)
-- ----------------------------------------------------------------------------

create or replace function get_balance_snapshots(p_hostel_name text default null, p_from_date date default null, p_to_date date default current_date)
returns setof accounting_balance_snapshots as $$
  select * from accounting_balance_snapshots
   where (p_hostel_name is null or hostel_name = p_hostel_name)
     and (p_from_date is null or snapshot_date >= p_from_date)
     and snapshot_date <= p_to_date
   order by snapshot_date;
$$ language sql stable security definer;

-- ----------------------------------------------------------------------------
-- Reconciliation flags (read + resolve)
-- ----------------------------------------------------------------------------

create or replace function get_reconciliation_flags(p_include_resolved boolean default false)
returns setof accounting_reconciliation_flags as $$
  select * from accounting_reconciliation_flags
   where p_include_resolved or resolved_at is null
   order by detected_at desc;
$$ language sql stable security definer;

create or replace function resolve_reconciliation_flag(p_flag_id bigint, p_resolution_notes text) returns void as $$
begin
  perform accounting_require_role(array['owner', 'finance_manager']);
  update accounting_reconciliation_flags
     set resolved_at = now(), resolved_by = auth.uid(), resolution_notes = p_resolution_notes
   where flag_id = p_flag_id;
end;
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- Opening balances (batch draft/edit/post)
-- ----------------------------------------------------------------------------

create or replace function create_opening_balance_batch(p_as_of_date date) returns bigint as $$
declare
  v_batch_id bigint;
begin
  perform accounting_require_role(array['owner']);
  insert into accounting_opening_balance_batches (as_of_date, created_by)
  values (p_as_of_date, auth.uid())
  returning batch_id into v_batch_id;
  return v_batch_id;
end;
$$ language plpgsql security definer;

create or replace function add_opening_balance_line(
  p_batch_id bigint, p_account_code text, p_debit numeric, p_credit numeric,
  p_hostel_name text default null, p_notes text default null
) returns bigint as $$
declare
  v_account_id bigint;
  v_line_id bigint;
  v_status text;
begin
  perform accounting_require_role(array['owner']);

  select status into v_status from accounting_opening_balance_batches where batch_id = p_batch_id;
  if v_status <> 'draft' then
    raise exception 'add_opening_balance_line: batch % is not in draft status', p_batch_id;
  end if;

  v_account_id := accounting_get_account_id(p_account_code);
  if v_account_id is null then
    raise exception 'add_opening_balance_line: unknown account code %', p_account_code;
  end if;

  insert into accounting_opening_balance_lines (batch_id, account_id, hostel_name, debit, credit, notes)
  values (p_batch_id, v_account_id, p_hostel_name, p_debit, p_credit, p_notes)
  returning line_id into v_line_id;

  return v_line_id;
end;
$$ language plpgsql security definer;

create or replace function delete_opening_balance_line(p_line_id bigint) returns void as $$
begin
  perform accounting_require_role(array['owner']);
  delete from accounting_opening_balance_lines where line_id = p_line_id;
end;
$$ language plpgsql security definer;

create or replace function get_opening_balance_batches() returns setof accounting_opening_balance_batches as $$
  select * from accounting_opening_balance_batches order by as_of_date desc;
$$ language sql stable security definer;

create or replace function get_opening_balance_lines(p_batch_id bigint)
returns table(line_id bigint, account_code text, account_name text, hostel_name text, debit numeric, credit numeric, notes text) as $$
  select l.line_id, a.code, a.name, l.hostel_name, l.debit, l.credit, l.notes
    from accounting_opening_balance_lines l
    join accounting_accounts a on a.account_id = l.account_id
   where l.batch_id = p_batch_id
   order by a.code;
$$ language sql stable security definer;

create or replace function post_opening_balance_batch(p_batch_id bigint) returns bigint as $$
declare
  v_batch accounting_opening_balance_batches%rowtype;
  v_total_debit numeric;
  v_total_credit numeric;
  v_lines jsonb;
  v_journal_entry_id bigint;
begin
  perform accounting_require_role(array['owner']);

  select * into v_batch from accounting_opening_balance_batches where batch_id = p_batch_id;
  if not found then
    raise exception 'post_opening_balance_batch: batch % not found', p_batch_id;
  end if;
  if v_batch.status = 'posted' then
    raise exception 'post_opening_balance_batch: batch % is already posted', p_batch_id;
  end if;

  select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into v_total_debit, v_total_credit
    from accounting_opening_balance_lines where batch_id = p_batch_id;

  if v_total_debit <> v_total_credit then
    raise exception 'post_opening_balance_batch: batch % does not balance (debit=% credit=%). Add a plug line against Opening Balance Equity (3190) to balance it.',
      p_batch_id, v_total_debit, v_total_credit;
  end if;

  if v_total_debit = 0 then
    raise exception 'post_opening_balance_batch: batch % has no lines', p_batch_id;
  end if;

  select jsonb_agg(jsonb_build_object(
    'account_code', a.code, 'debit', l.debit, 'credit', l.credit, 'hostel_name', l.hostel_name, 'memo', l.notes
  ))
  into v_lines
  from accounting_opening_balance_lines l
  join accounting_accounts a on a.account_id = l.account_id
  where l.batch_id = p_batch_id;

  v_journal_entry_id := accounting_post_entry(
    v_batch.as_of_date, null, 'opening_balance', p_batch_id,
    'Opening balances as of ' || v_batch.as_of_date, v_lines, auth.uid()
  );

  update accounting_opening_balance_batches
     set status = 'posted', journal_entry_id = v_journal_entry_id, posted_at = now()
   where batch_id = p_batch_id;

  return v_journal_entry_id;
end;
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- Owner transactions (list)
-- ----------------------------------------------------------------------------

create or replace function get_owner_transactions() returns setof accounting_owner_transactions as $$
  select * from accounting_owner_transactions order by transaction_date desc;
$$ language sql stable security definer;

-- ----------------------------------------------------------------------------
-- Asset transfers / documents / disposals (list, per asset)
-- ----------------------------------------------------------------------------

create or replace function get_asset_transfers(p_asset_id bigint) returns setof asset_transfers as $$
  select * from asset_transfers where asset_id = p_asset_id order by transfer_date desc;
$$ language sql stable security definer;

create or replace function get_asset_documents(p_asset_id bigint) returns setof asset_documents as $$
  select * from asset_documents where asset_id = p_asset_id order by uploaded_at desc;
$$ language sql stable security definer;

create or replace function add_asset_document(p_asset_id bigint, p_document_type text, p_storage_path text, p_notes text default null)
returns bigint as $$
declare
  v_document_id bigint;
begin
  perform accounting_require_role(array['owner', 'finance_manager']);
  insert into asset_documents (asset_id, document_type, storage_path, notes, uploaded_by)
  values (p_asset_id, p_document_type, p_storage_path, p_notes, auth.uid())
  returning document_id into v_document_id;
  return v_document_id;
end;
$$ language plpgsql security definer;

create or replace function get_asset_disposal(p_asset_id bigint) returns setof asset_disposals as $$
  select * from asset_disposals where asset_id = p_asset_id;
$$ language sql stable security definer;

create or replace function get_asset_depreciation_entries(p_asset_id bigint) returns setof asset_depreciation_entries as $$
  select * from asset_depreciation_entries where asset_id = p_asset_id order by period_year desc, period_month desc;
$$ language sql stable security definer;

-- ----------------------------------------------------------------------------
-- Rent accrual status (which bookings/periods have and haven't been accrued
-- yet, for the Receivables page's "Run Accrual" control)
-- ----------------------------------------------------------------------------

create or replace function get_rent_accrual_status(p_period_year int, p_period_month int)
returns table(total_active_bookings int, already_accrued int, pending int) as $$
declare
  v_period_start date := make_date(p_period_year, p_period_month, 1);
  v_total int;
  v_accrued int;
begin
  select count(*) into v_total from bookings
   where booking_status in ('confirmed', 'checked_in')
     and start_date <= (v_period_start + interval '1 month - 1 day')
     and (end_date is null or end_date >= v_period_start);

  select count(*) into v_accrued from accounting_rent_accruals
   where period_year = p_period_year and period_month = p_period_month;

  return query select v_total, v_accrued, greatest(v_total - v_accrued, 0);
end;
$$ language plpgsql stable security definer;

commit;
