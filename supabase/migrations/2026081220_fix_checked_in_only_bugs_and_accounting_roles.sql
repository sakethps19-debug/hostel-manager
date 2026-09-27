-- ============================================================================
-- Full end-to-end audit fixes, batch 1:
--
-- 1. Same systemic bug as transfer_resident (prior migration): revise_rent,
--    get_operational_alerts, get_today_snapshot, and get_todays_checkouts all
--    required/filtered on status = 'checked_in' only, a status nothing in
--    this app ever sets. revise_rent was completely broken for every real
--    booking (confirmed live: "No active checked-in booking found").
--    get_operational_alerts silently always returned 0 for overdue rent,
--    vacating-soon, deposit-pending, and missing-ID-proof counts on the
--    dashboard's "Needs Attention" section. get_today_snapshot and
--    get_todays_checkouts always returned 0 checkouts / an empty checkout
--    list, regardless of reality.
--
-- 2. Five real money-posting functions (post_payment_journal,
--    post_expense_journal, post_payable_invoice, post_payable_payment,
--    post_asset_purchase_journal) and the petty-cash/cash-reconciliation
--    functions had NO role check at all - any authenticated user of any
--    role could call them directly via RPC, bypassing the page-level
--    owner/finance_manager gating entirely. Found by an independent
--    review agent, cross-checked live via pg_get_functiondef.
--
-- 3. add_petty_cash_transaction had no validation on p_transaction_type
--    (silently accepted any string, using the raw unsigned amount for
--    anything other than 'Top-up'/'Expense') or on p_amount's sign.
-- ============================================================================
begin;

create or replace function revise_rent(
  p_booking_id bigint, p_new_rent numeric, p_effective_date date,
  p_reason text default null, p_notes text default null
) returns rent_revisions as $$
declare
  v_current_rent numeric;
  v_record rent_revisions;
begin
  perform require_role(array['owner','operations_manager']);

  select monthly_rent into v_current_rent
  from bookings
  where id = p_booking_id and status in ('confirmed', 'checked_in');

  if v_current_rent is null then
    raise exception 'No active booking found for booking id %', p_booking_id;
  end if;

  insert into rent_revisions (booking_id, previous_rent, new_rent, effective_date, reason, notes)
  values (p_booking_id, v_current_rent, p_new_rent, p_effective_date, p_reason, p_notes)
  returning * into v_record;

  update bookings set monthly_rent = p_new_rent where id = p_booking_id;

  return v_record;
end;
$$ language plpgsql security definer set search_path to 'public';

create or replace function get_operational_alerts()
returns table(overdue_rent_count bigint, vacating_7_days_count bigint, vacating_30_days_count bigint, deposit_pending_count bigint, missing_id_proof_count bigint, maintenance_count bigint)
language sql security definer set search_path to 'public'
as $$
  select
    (
      select count(*)
      from bookings b
      cross join lateral get_booking_ledger(b.id) l
      where b.status in ('confirmed', 'checked_in') and l.balance_outstanding > 0
    ) as overdue_rent_count,
    (
      select count(*)
      from bookings b
      where b.status in ('confirmed', 'checked_in')
        and coalesce(b.expected_vacate_date, b.end_date) between current_date and current_date + 7
    ) as vacating_7_days_count,
    (
      select count(*)
      from bookings b
      where b.status in ('confirmed', 'checked_in')
        and coalesce(b.expected_vacate_date, b.end_date) between current_date and current_date + 30
    ) as vacating_30_days_count,
    (
      select count(*)
      from bookings b
      cross join lateral get_deposit_summary(b.id) d
      where b.status in ('confirmed', 'checked_in') and d.deposit_balance > 0
    ) as deposit_pending_count,
    (
      select count(*)
      from bookings b
      join residents r on r.id = b.resident_id
      where b.status in ('confirmed', 'checked_in')
        and (r.id_proof_number is null or trim(r.id_proof_number) = '')
    ) as missing_id_proof_count,
    (
      select count(*) from bed_maintenance where status = 'open'
    ) as maintenance_count;
$$;

create or replace function get_today_snapshot()
returns table(checkins_today_count integer, checkouts_today_count integer, enquiries_followup_count integer)
language sql security definer set search_path to 'public'
as $$
  SELECT
    (
      SELECT count(*)::int FROM bookings b
      WHERE b.start_date = (now() AT TIME ZONE 'Asia/Kolkata')::date
        AND b.status IN ('confirmed', 'checked_in')
    ) AS checkins_today_count,
    (
      SELECT count(*)::int FROM bookings b
      WHERE b.status IN ('confirmed', 'checked_in')
        AND (
          (b.notice_given_at IS NOT NULL AND b.expected_vacate_date = (now() AT TIME ZONE 'Asia/Kolkata')::date)
          OR (b.notice_given_at IS NULL AND b.end_date = (now() AT TIME ZONE 'Asia/Kolkata')::date)
        )
    ) AS checkouts_today_count,
    (
      SELECT count(*)::int FROM enquiries e
      WHERE e.status NOT IN ('Converted', 'Lost')
    ) AS enquiries_followup_count;
$$;

create or replace function get_todays_checkouts()
returns table(booking_id integer, bed_id integer, bed_number text, bed_code text, hostel_name text, floor_number integer, room_number text, resident_id integer, full_name text, mobile_number text, checkout_date date, notice_given boolean, monthly_rent numeric)
language sql security definer set search_path to 'public'
as $$
  SELECT
    b.id, bd.id, bd.bed_number, bd.bed_code, h.name, f.floor_number,
    r.room_number, res.id, res.full_name, res.mobile_number,
    COALESCE(b.expected_vacate_date, b.end_date),
    (b.notice_given_at IS NOT NULL), b.monthly_rent
  FROM bookings b
  JOIN residents res ON res.id = b.resident_id
  JOIN beds bd ON bd.id = b.bed_id
  JOIN rooms r ON r.id = bd.room_id
  JOIN floors f ON f.id = r.floor_id
  JOIN hostels h ON h.id = f.hostel_id
  WHERE b.status IN ('confirmed', 'checked_in')
    AND (
      (b.notice_given_at IS NOT NULL AND b.expected_vacate_date = (now() AT TIME ZONE 'Asia/Kolkata')::date)
      OR (b.notice_given_at IS NULL AND b.end_date = (now() AT TIME ZONE 'Asia/Kolkata')::date)
    )
  ORDER BY h.name, r.room_number, bd.bed_number;
$$;

create or replace function post_payment_journal(p_payment_id bigint, p_created_by uuid default null)
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare
  v_payment payments%rowtype;
  v_booking bookings%rowtype;
  v_cash_code text;
  v_journal_entry_id bigint;
  v_lines jsonb;
begin
  perform accounting_require_role(array['owner','finance_manager']);

  select * into v_payment from payments where id = p_payment_id;
  if not found then
    raise exception 'post_payment_journal: payment % not found', p_payment_id;
  end if;

  if exists (select 1 from accounting_journal_entries where source_type = 'payment' and source_id = p_payment_id) then
    select journal_entry_id into v_journal_entry_id from accounting_journal_entries
     where source_type = 'payment' and source_id = p_payment_id limit 1;
    return v_journal_entry_id;
  end if;

  if v_payment.status = 'reversed' then
    return null;
  end if;

  select * into v_booking from bookings where id = v_payment.booking_id;
  v_cash_code := coalesce(accounting_cash_account_code(v_payment.payment_mode), '1110');

  if v_payment.payment_type = 'Monthly Rent' then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_cash_code, 'debit', v_payment.amount, 'credit', 0,
        'resident_id', v_booking.resident_id, 'booking_id', v_payment.booking_id),
      jsonb_build_object('account_code', '1140', 'debit', 0, 'credit', v_payment.amount,
        'resident_id', v_booking.resident_id, 'booking_id', v_payment.booking_id)
    );
  elsif v_payment.payment_type = 'Adjustment' then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', '4100', 'debit', v_payment.amount, 'credit', 0,
        'resident_id', v_booking.resident_id, 'booking_id', v_payment.booking_id, 'memo', 'Rent adjustment/discount'),
      jsonb_build_object('account_code', '1140', 'debit', 0, 'credit', v_payment.amount,
        'resident_id', v_booking.resident_id, 'booking_id', v_payment.booking_id)
    );
  elsif v_payment.payment_type = 'Security Deposit' then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_cash_code, 'debit', v_payment.amount, 'credit', 0,
        'resident_id', v_booking.resident_id, 'booking_id', v_payment.booking_id),
      jsonb_build_object('account_code', '2160', 'debit', 0, 'credit', v_payment.amount,
        'resident_id', v_booking.resident_id, 'booking_id', v_payment.booking_id)
    );
  elsif v_payment.payment_type = 'Deposit Refund' then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', '2160', 'debit', v_payment.amount, 'credit', 0,
        'resident_id', v_booking.resident_id, 'booking_id', v_payment.booking_id),
      jsonb_build_object('account_code', v_cash_code, 'debit', 0, 'credit', v_payment.amount,
        'resident_id', v_booking.resident_id, 'booking_id', v_payment.booking_id)
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_cash_code, 'debit', v_payment.amount, 'credit', 0,
        'resident_id', v_booking.resident_id, 'booking_id', v_payment.booking_id),
      jsonb_build_object('account_code', '4110', 'debit', 0, 'credit', v_payment.amount,
        'resident_id', v_booking.resident_id, 'booking_id', v_payment.booking_id)
    );
  end if;

  v_journal_entry_id := accounting_post_entry(
    v_payment.payment_date, accounting_hostel_name_for_booking(v_payment.booking_id), 'payment', p_payment_id,
    v_payment.payment_type || ' payment — booking #' || v_payment.booking_id,
    v_lines, p_created_by
  );

  return v_journal_entry_id;
end;
$$;

create or replace function post_expense_journal(p_expense_id bigint, p_created_by uuid default null)
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare
  v_expense expenses%rowtype;
  v_expense_code text;
  v_cash_code text;
  v_journal_entry_id bigint;
begin
  perform accounting_require_role(array['owner','finance_manager']);

  select * into v_expense from expenses where id = p_expense_id;
  if not found then
    raise exception 'post_expense_journal: expense % not found', p_expense_id;
  end if;

  if exists (select 1 from accounting_journal_entries where source_type = 'expense' and source_id = p_expense_id) then
    select journal_entry_id into v_journal_entry_id from accounting_journal_entries
     where source_type = 'expense' and source_id = p_expense_id limit 1;
    return v_journal_entry_id;
  end if;

  select a.code into v_expense_code
    from accounting_expense_category_map m join accounting_accounts a on a.account_id = m.account_id
   where m.category = v_expense.category;
  if v_expense_code is null then
    v_expense_code := '5290';
  end if;

  v_cash_code := coalesce(accounting_cash_account_code(v_expense.payment_mode), '1110');

  v_journal_entry_id := accounting_post_entry(
    v_expense.expense_date, v_expense.hostel_name, 'expense', p_expense_id,
    v_expense.category || ' expense' || case when v_expense.vendor is not null then ' — ' || v_expense.vendor else '' end,
    jsonb_build_array(
      jsonb_build_object('account_code', v_expense_code, 'debit', v_expense.amount, 'credit', 0, 'memo', v_expense.notes),
      jsonb_build_object('account_code', v_cash_code, 'debit', 0, 'credit', v_expense.amount)
    ),
    p_created_by
  );

  return v_journal_entry_id;
end;
$$;

create or replace function post_payable_invoice(p_payable_id bigint, p_created_by uuid default null)
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare
  v_payable accounting_payables%rowtype;
  v_expense_code text;
  v_journal_entry_id bigint;
begin
  perform accounting_require_role(array['owner','finance_manager']);

  select * into v_payable from accounting_payables where payable_id = p_payable_id;
  if not found then
    raise exception 'post_payable_invoice: payable % not found', p_payable_id;
  end if;
  if v_payable.accrual_journal_entry_id is not null then
    return v_payable.accrual_journal_entry_id;
  end if;

  select a.code into v_expense_code
    from accounting_expense_category_map m join accounting_accounts a on a.account_id = m.account_id
   where m.category = v_payable.category;
  if v_expense_code is null then
    v_expense_code := '5290';
  end if;

  v_journal_entry_id := accounting_post_entry(
    v_payable.invoice_date, v_payable.hostel_name, 'payable_invoice', p_payable_id,
    'Invoice ' || coalesce(v_payable.invoice_number, '#' || p_payable_id) || ' — ' || v_payable.vendor_name,
    jsonb_build_array(
      jsonb_build_object('account_code', v_expense_code, 'debit', v_payable.amount, 'credit', 0, 'vendor_id', v_payable.vendor_id),
      jsonb_build_object('account_code', '2110', 'debit', 0, 'credit', v_payable.amount, 'vendor_id', v_payable.vendor_id)
    ),
    p_created_by
  );

  update accounting_payables set accrual_journal_entry_id = v_journal_entry_id where payable_id = p_payable_id;
  return v_journal_entry_id;
end;
$$;

create or replace function post_payable_payment(p_payable_payment_id bigint, p_created_by uuid default null)
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare
  v_pp accounting_payable_payments%rowtype;
  v_payable accounting_payables%rowtype;
  v_cash_code text;
  v_journal_entry_id bigint;
  v_new_paid numeric;
begin
  perform accounting_require_role(array['owner','finance_manager']);

  select * into v_pp from accounting_payable_payments where payable_payment_id = p_payable_payment_id;
  if not found then
    raise exception 'post_payable_payment: payable payment % not found', p_payable_payment_id;
  end if;
  if v_pp.journal_entry_id is not null then
    return v_pp.journal_entry_id;
  end if;

  select * into v_payable from accounting_payables where payable_id = v_pp.payable_id;
  v_cash_code := coalesce(accounting_cash_account_code(v_pp.payment_mode), '1110');

  v_journal_entry_id := accounting_post_entry(
    v_pp.payment_date, v_payable.hostel_name, 'payable_payment', p_payable_payment_id,
    'Payment against invoice ' || coalesce(v_payable.invoice_number, '#' || v_payable.payable_id) || ' — ' || v_payable.vendor_name,
    jsonb_build_array(
      jsonb_build_object('account_code', '2110', 'debit', v_pp.amount, 'credit', 0, 'vendor_id', v_payable.vendor_id),
      jsonb_build_object('account_code', v_cash_code, 'debit', 0, 'credit', v_pp.amount, 'vendor_id', v_payable.vendor_id)
    ),
    p_created_by
  );

  update accounting_payable_payments set journal_entry_id = v_journal_entry_id where payable_payment_id = p_payable_payment_id;

  v_new_paid := v_payable.amount_paid + v_pp.amount;
  update accounting_payables
     set amount_paid = v_new_paid,
         status = case
           when v_new_paid >= amount then 'paid'
           when v_new_paid > 0 then 'partially_paid'
           else status
         end
   where payable_id = v_payable.payable_id;

  return v_journal_entry_id;
end;
$$;

create or replace function post_asset_purchase_journal(p_asset_id bigint, p_created_by uuid default null)
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare
  v_asset assets%rowtype;
  v_gl_code text;
  v_cash_code text;
  v_journal_entry_id bigint;
  v_threshold numeric;
  v_capitalized boolean;
begin
  perform accounting_require_role(array['owner','finance_manager']);

  select * into v_asset from assets where asset_id = p_asset_id;
  if not found then
    raise exception 'post_asset_purchase_journal: asset % not found', p_asset_id;
  end if;
  if v_asset.purchase_cost is null or v_asset.purchase_cost <= 0 then
    return null;
  end if;

  if exists (select 1 from accounting_journal_entries where source_type = 'asset_purchase' and source_id = p_asset_id) then
    select journal_entry_id into v_journal_entry_id from accounting_journal_entries
     where source_type = 'asset_purchase' and source_id = p_asset_id limit 1;
    return v_journal_entry_id;
  end if;

  select setting_value::numeric into v_threshold from accounting_settings where setting_key = 'capitalization_threshold';
  v_capitalized := v_asset.purchase_cost >= coalesce(v_threshold, 5000);

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

  v_cash_code := coalesce(accounting_cash_account_code(v_asset.payment_mode), '1110');

  if v_capitalized then
    v_journal_entry_id := accounting_post_entry(
      coalesce(v_asset.purchase_date, current_date), v_asset.hostel_name, 'asset_purchase', p_asset_id,
      'Asset purchase — ' || v_asset.name || coalesce(' (' || v_asset.asset_code || ')', ''),
      jsonb_build_array(
        jsonb_build_object('account_code', v_gl_code, 'debit', v_asset.purchase_cost, 'credit', 0, 'asset_id', p_asset_id),
        jsonb_build_object('account_code', v_cash_code, 'debit', 0, 'credit', v_asset.purchase_cost, 'asset_id', p_asset_id)
      ),
      p_created_by
    );
    update assets set capitalized = true where asset_id = p_asset_id;
  else
    v_journal_entry_id := accounting_post_entry(
      coalesce(v_asset.purchase_date, current_date), v_asset.hostel_name, 'asset_purchase', p_asset_id,
      'Low-value purchase (expensed, below capitalization threshold) — ' || v_asset.name,
      jsonb_build_array(
        jsonb_build_object('account_code', '5290', 'debit', v_asset.purchase_cost, 'credit', 0, 'asset_id', p_asset_id),
        jsonb_build_object('account_code', v_cash_code, 'debit', 0, 'credit', v_asset.purchase_cost, 'asset_id', p_asset_id)
      ),
      p_created_by
    );
    update assets set capitalized = false where asset_id = p_asset_id;
  end if;

  return v_journal_entry_id;
end;
$$;

create or replace function get_petty_cash_balance()
returns numeric language sql security definer set search_path to 'public' as $$
  select coalesce(sum(amount), 0) from petty_cash_transactions;
$$;

create or replace function get_petty_cash_transactions()
returns table(transaction_id bigint, hostel_name text, transaction_type text, amount numeric, description text, transaction_date date, running_balance numeric, created_at timestamp with time zone)
language sql security definer set search_path to 'public' as $$
  select
    id, hostel_name, transaction_type, amount, description, transaction_date,
    sum(amount) over (order by transaction_date, id) as running_balance,
    created_at
  from petty_cash_transactions
  order by transaction_date desc, id desc;
$$;

create or replace function add_petty_cash_transaction(p_hostel_name text, p_transaction_type text, p_amount numeric, p_description text, p_transaction_date date)
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare
  v_id bigint;
  v_signed_amount numeric;
begin
  perform accounting_require_role(array['owner','finance_manager']);

  if p_transaction_type not in ('Top-up', 'Expense') then
    raise exception 'Invalid petty cash transaction type: %', p_transaction_type;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  v_signed_amount := case
    when p_transaction_type = 'Top-up' then abs(p_amount)
    when p_transaction_type = 'Expense' then -abs(p_amount)
  end;

  insert into petty_cash_transactions (
    hostel_name, transaction_type, amount, description, transaction_date, created_by
  )
  values (
    p_hostel_name, p_transaction_type, v_signed_amount, p_description,
    coalesce(p_transaction_date, (now() AT TIME ZONE 'Asia/Kolkata')::date), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function get_cash_reconciliations()
returns table(reconciliation_id bigint, reconciliation_date date, hostel_name text, expected_balance numeric, counted_balance numeric, variance numeric, notes text, created_by_name text, created_at timestamp with time zone)
language sql security definer set search_path to 'public' as $$
  select
    r.id, r.reconciliation_date, r.hostel_name, r.expected_balance,
    r.counted_balance, r.variance, r.notes, p.full_name, r.created_at
  from cash_reconciliations r
  left join profiles p on p.id = r.created_by
  order by r.reconciliation_date desc, r.created_at desc;
$$;

create or replace function add_cash_reconciliation(p_reconciliation_date date, p_hostel_name text, p_counted_balance numeric, p_notes text)
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare
  v_id bigint;
  v_expected numeric;
begin
  perform accounting_require_role(array['owner','finance_manager']);

  select get_petty_cash_balance() into v_expected;

  insert into cash_reconciliations (
    reconciliation_date, hostel_name, expected_balance,
    counted_balance, variance, notes, created_by
  )
  values (
    coalesce(p_reconciliation_date, (now() AT TIME ZONE 'Asia/Kolkata')::date),
    p_hostel_name, v_expected, p_counted_balance,
    p_counted_balance - v_expected, p_notes, auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

commit;
