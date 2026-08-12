-- ============================================================================
-- Accounting module — bridge functions
-- ============================================================================
--
-- These connect EXISTING operational tables (bookings, payments, expenses,
-- assets) to the new ledger. None of them touch the operational tables'
-- own write paths (record_payment, record_expense, add_asset, etc. are
-- untouched) — the app calls these bridge functions as an ADDITIONAL step
-- after the existing RPC succeeds, exactly the way logAuditEvent is already
-- called today (see lib/audit.ts). Every function is idempotent (checks for
-- an existing journal entry with the same source_type/source_id first) so a
-- retry, a reconciliation catch-up run, or an accidental double-call never
-- double-posts.
--
-- ASSUMED existing table shapes (inferred from RPC row types only — verify
-- against the live schema before applying):
--   bookings(booking_id pk, resident_id, hostel_name, start_date, end_date,
--            monthly_rent, booking_status)
--   rent_revisions(revision_id pk, booking_id, previous_rent, new_rent,
--            effective_date, reason, notes)
--   payments(payment_id pk, booking_id, receipt_number, payment_date,
--            payment_for_month, payment_type, amount, payment_mode,
--            reference_number, notes, status, reversed_reason)
--   expenses(expense_id pk, hostel_name, expense_date, category, amount,
--            vendor, payment_mode, reference_number, notes)
-- If any name differs, the affected function will fail with a clear
-- "relation does not exist" / "column does not exist" error — fix the
-- assumption in this file, not by silently catching the error.
-- ============================================================================

begin;

create or replace function accounting_cash_account_code(p_payment_mode text) returns text as $$
  select a.code from accounting_payment_mode_map m
  join accounting_accounts a on a.account_id = m.account_id
  where m.payment_mode = p_payment_mode;
$$ language sql stable;

-- ----------------------------------------------------------------------------
-- Rent accrual (Dr Accounts Receivable – Rent / Cr Rent Revenue)
-- ----------------------------------------------------------------------------

create or replace function accounting_rent_due_date(p_start_date date, p_period_year int, p_period_month int)
returns date as $$
  select make_date(
    p_period_year, p_period_month,
    least(
      extract(day from p_start_date)::int,
      extract(day from (make_date(p_period_year, p_period_month, 1) + interval '1 month - 1 day'))::int
    )
  );
$$ language sql immutable;

comment on function accounting_rent_due_date is
  'Implements the "joining-date anniversary" due-date rule confirmed in '
  'commit 03d4417 ("Confirm rent due-date rule; add Receivable Ageing '
  'buckets") and already used by app/rent/ageing/RentAgeingView.tsx. This is '
  'the ONE canonical accrual rule for the whole accounting module — do not '
  'reimplement it elsewhere. Note the residentLedger.ts client-side ledger '
  'statement builder uses a DIFFERENT calendar-month-start convention for '
  'its own display purposes; that inconsistency pre-dates this module and is '
  'flagged in the completion report, not silently resolved by this function.';

create or replace function accounting_rent_amount_for_period(p_booking_id bigint, p_period_year int, p_period_month int)
returns numeric as $$
  select coalesce(
    (select rr.new_rent from rent_revisions rr
      where rr.booking_id = p_booking_id
        and rr.effective_date <= (make_date(p_period_year, p_period_month, 1) + interval '1 month - 1 day')
      order by rr.effective_date desc limit 1),
    (select b.monthly_rent from bookings b where b.booking_id = p_booking_id)
  );
$$ language sql stable;

create or replace function post_rent_accrual(
  p_booking_id bigint, p_period_year int, p_period_month int, p_created_by uuid default null
) returns bigint as $$
declare
  v_booking bookings%rowtype;
  v_amount numeric;
  v_due_date date;
  v_journal_entry_id bigint;
begin
  perform accounting_require_role(array['owner', 'finance_manager']);

  select * into v_booking from bookings where booking_id = p_booking_id;
  if not found then
    raise exception 'post_rent_accrual: booking % not found', p_booking_id;
  end if;

  if exists (
    select 1 from accounting_rent_accruals
     where booking_id = p_booking_id and period_year = p_period_year and period_month = p_period_month
  ) then
    select journal_entry_id into v_journal_entry_id from accounting_rent_accruals
     where booking_id = p_booking_id and period_year = p_period_year and period_month = p_period_month;
    return v_journal_entry_id; -- idempotent no-op
  end if;

  v_amount := accounting_rent_amount_for_period(p_booking_id, p_period_year, p_period_month);
  if v_amount is null or v_amount <= 0 then
    return null;
  end if;
  v_due_date := accounting_rent_due_date(v_booking.start_date, p_period_year, p_period_month);

  v_journal_entry_id := accounting_post_entry(
    v_due_date, v_booking.hostel_name, 'rent_accrual', p_booking_id,
    'Rent due for ' || to_char(make_date(p_period_year, p_period_month, 1), 'Mon YYYY') || ' — booking #' || p_booking_id,
    jsonb_build_array(
      jsonb_build_object('account_code', '1140', 'debit', v_amount, 'credit', 0,
        'resident_id', v_booking.resident_id, 'booking_id', p_booking_id),
      jsonb_build_object('account_code', '4100', 'debit', 0, 'credit', v_amount,
        'resident_id', v_booking.resident_id, 'booking_id', p_booking_id)
    ),
    p_created_by
  );

  insert into accounting_rent_accruals
    (booking_id, resident_id, hostel_name, period_month, period_year, amount, due_date, journal_entry_id)
  values
    (p_booking_id, v_booking.resident_id, v_booking.hostel_name, p_period_month, p_period_year, v_amount, v_due_date, v_journal_entry_id);

  return v_journal_entry_id;
end;
$$ language plpgsql security definer;

-- Batch accrual for a whole period — run this once a month (Owner/Finance
-- action, see the Receivables page) rather than accruing continuously, so
-- "what's due" is a deliberate, reviewable step, not a silent background job.
create or replace function post_rent_accruals_for_period(
  p_period_year int, p_period_month int, p_created_by uuid default null
) returns int as $$
declare
  v_booking record;
  v_period_start date := make_date(p_period_year, p_period_month, 1);
  v_count int := 0;
begin
  for v_booking in
    select booking_id from bookings
     where booking_status in ('confirmed', 'checked_in')
       and start_date <= (v_period_start + interval '1 month - 1 day')
       and (end_date is null or end_date >= v_period_start)
  loop
    if post_rent_accrual(v_booking.booking_id, p_period_year, p_period_month, p_created_by) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- Payments (rent collection, deposits, other charges, adjustments)
-- ----------------------------------------------------------------------------

create or replace function post_payment_journal(p_payment_id bigint, p_created_by uuid default null)
returns bigint as $$
declare
  v_payment payments%rowtype;
  v_booking bookings%rowtype;
  v_cash_code text;
  v_journal_entry_id bigint;
  v_lines jsonb;
begin
  select * into v_payment from payments where payment_id = p_payment_id;
  if not found then
    raise exception 'post_payment_journal: payment % not found', p_payment_id;
  end if;

  if exists (select 1 from accounting_journal_entries where source_type = 'payment' and source_id = p_payment_id) then
    select journal_entry_id into v_journal_entry_id from accounting_journal_entries
     where source_type = 'payment' and source_id = p_payment_id limit 1;
    return v_journal_entry_id;
  end if;

  -- A payment recorded as reversed never had a lasting cash effect worth
  -- journaling fresh; if an entry already existed for it (posted before the
  -- reversal happened), that entry must be reversed explicitly via
  -- accounting_reverse_entry by the caller that detects the reversal, not
  -- silently skipped here.
  if v_payment.status = 'reversed' then
    return null;
  end if;

  select * into v_booking from bookings where booking_id = v_payment.booking_id;
  v_cash_code := coalesce(accounting_cash_account_code(v_payment.payment_mode), '1110');

  if v_payment.payment_type = 'Monthly Rent' then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_cash_code, 'debit', v_payment.amount, 'credit', 0,
        'resident_id', v_booking.resident_id, 'booking_id', v_payment.booking_id),
      jsonb_build_object('account_code', '1140', 'debit', 0, 'credit', v_payment.amount,
        'resident_id', v_booking.resident_id, 'booking_id', v_payment.booking_id)
    );
  elsif v_payment.payment_type = 'Adjustment' then
    -- Non-cash write-down of the rent receivable (discount/waiver) — clears
    -- AR without a cash movement, so it correctly stays out of Cash Flow.
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
  else -- 'Other Charge' and any future/unrecognized type: recognized immediately,
       -- there is no accrual/invoicing workflow for ad-hoc resident charges today.
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_cash_code, 'debit', v_payment.amount, 'credit', 0,
        'resident_id', v_booking.resident_id, 'booking_id', v_payment.booking_id),
      jsonb_build_object('account_code', '4110', 'debit', 0, 'credit', v_payment.amount,
        'resident_id', v_booking.resident_id, 'booking_id', v_payment.booking_id)
    );
  end if;

  v_journal_entry_id := accounting_post_entry(
    v_payment.payment_date, v_booking.hostel_name, 'payment', p_payment_id,
    v_payment.payment_type || ' payment — booking #' || v_payment.booking_id,
    v_lines, p_created_by
  );

  return v_journal_entry_id;
end;
$$ language plpgsql security definer;

comment on function post_payment_journal is
  'Known simplification (documented in the completion report, not silently '
  'ignored): rent payments are not capped at the outstanding AR-Rent balance '
  'before posting, so an overpayment currently posts AR-Rent into a credit '
  '(negative) balance rather than being auto-reclassified to the Advance '
  'Rent Received liability (2170). This mirrors the existing app, which '
  'already has an informal "Advance Paid" payment_status label with no '
  'formal accounting distinction either — flagged as a policy question, not '
  'invented here.';

-- ----------------------------------------------------------------------------
-- Expenses (already-paid transactions, per the existing record_expense flow)
-- ----------------------------------------------------------------------------

create or replace function post_expense_journal(p_expense_id bigint, p_created_by uuid default null)
returns bigint as $$
declare
  v_expense expenses%rowtype;
  v_expense_code text;
  v_cash_code text;
  v_journal_entry_id bigint;
begin
  select * into v_expense from expenses where expense_id = p_expense_id;
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
    v_expense_code := '5290'; -- Other Operating Expenses fallback for a category with no mapping yet
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
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- Accounts Payable — genuine unpaid vendor invoices (new concept; the
-- pre-existing `expenses` log stays the paid-at-entry cash-basis record)
-- ----------------------------------------------------------------------------

create or replace function post_payable_invoice(p_payable_id bigint, p_created_by uuid default null)
returns bigint as $$
declare
  v_payable accounting_payables%rowtype;
  v_expense_code text;
  v_journal_entry_id bigint;
begin
  select * into v_payable from accounting_payables where payable_id = p_payable_id;
  if not found then
    raise exception 'post_payable_invoice: payable % not found', p_payable_id;
  end if;
  if v_payable.accrual_journal_entry_id is not null then
    return v_payable.accrual_journal_entry_id; -- idempotent
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
$$ language plpgsql security definer;

create or replace function post_payable_payment(p_payable_payment_id bigint, p_created_by uuid default null)
returns bigint as $$
declare
  v_pp accounting_payable_payments%rowtype;
  v_payable accounting_payables%rowtype;
  v_cash_code text;
  v_journal_entry_id bigint;
  v_new_paid numeric;
begin
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
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- Fixed assets: purchase, depreciation, disposal
-- ----------------------------------------------------------------------------

create or replace function post_asset_purchase_journal(p_asset_id bigint, p_created_by uuid default null)
returns bigint as $$
declare
  v_asset assets%rowtype;
  v_gl_code text;
  v_cash_code text;
  v_journal_entry_id bigint;
  v_threshold numeric;
  v_capitalized boolean;
begin
  select * into v_asset from assets where asset_id = p_asset_id;
  if not found then
    raise exception 'post_asset_purchase_journal: asset % not found', p_asset_id;
  end if;
  if v_asset.purchase_cost is null or v_asset.purchase_cost <= 0 then
    return null; -- nothing to journal for a zero/unspecified-cost entry
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
    v_gl_code := '1229'; -- Other Fixed Assets fallback
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
$$ language plpgsql security definer;

create or replace function post_depreciation_run(p_period_year int, p_period_month int, p_created_by uuid default null)
returns int as $$
declare
  v_asset record;
  v_monthly numeric;
  v_new_accum numeric;
  v_nbv numeric;
  v_depreciable numeric;
  v_period_end date := (make_date(p_period_year, p_period_month, 1) + interval '1 month - 1 day')::date;
  v_journal_entry_id bigint;
  v_count int := 0;
begin
  for v_asset in
    select * from assets
     where capitalized = true
       and coalesce(depreciation_method, 'straight_line') = 'straight_line'
       and useful_life_months is not null and useful_life_months > 0
       and purchase_cost is not null and purchase_cost > 0
       and coalesce(depreciation_start_date, purchase_date) <= v_period_end
       and status not in ('sold', 'retired', 'written_off', 'lost')
       and not exists (
         select 1 from asset_depreciation_entries d
          where d.asset_id = assets.asset_id and d.period_year = p_period_year and d.period_month = p_period_month
       )
  loop
    v_depreciable := v_asset.purchase_cost - coalesce(v_asset.residual_value, 0);
    v_monthly := round(v_depreciable / v_asset.useful_life_months, 2);
    v_monthly := least(v_monthly, greatest(v_depreciable - v_asset.accumulated_depreciation, 0));

    if v_monthly <= 0 then
      continue; -- fully depreciated already
    end if;

    v_new_accum := v_asset.accumulated_depreciation + v_monthly;
    v_nbv := v_asset.purchase_cost - v_new_accum;

    v_journal_entry_id := accounting_post_entry(
      v_period_end, v_asset.hostel_name, 'depreciation', v_asset.asset_id,
      'Depreciation for ' || to_char(v_period_end, 'Mon YYYY') || ' — ' || v_asset.name,
      jsonb_build_array(
        jsonb_build_object('account_code', '5210', 'debit', v_monthly, 'credit', 0, 'asset_id', v_asset.asset_id),
        jsonb_build_object('account_code', '1290', 'debit', 0, 'credit', v_monthly, 'asset_id', v_asset.asset_id)
      ),
      p_created_by
    );

    insert into asset_depreciation_entries
      (asset_id, period_month, period_year, depreciation_amount, accumulated_depreciation_after, net_book_value_after, journal_entry_id)
    values
      (v_asset.asset_id, p_period_month, p_period_year, v_monthly, v_new_accum, v_nbv, v_journal_entry_id);

    update assets set accumulated_depreciation = v_new_accum where asset_id = v_asset.asset_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
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
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '4195', 'debit', 0, 'credit', v_gain_loss, 'asset_id', p_asset_id)
    );
  elsif v_gain_loss < 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '5295', 'debit', -v_gain_loss, 'credit', 0, 'asset_id', p_asset_id)
    );
  end if;

  v_journal_entry_id := accounting_post_entry(
    p_disposal_date, v_asset.hostel_name, 'asset_disposal', p_asset_id,
    'Disposal — ' || v_asset.name || coalesce(' to ' || p_buyer, ''),
    v_lines, p_created_by
  );

  insert into asset_disposals
    (asset_id, disposal_date, sale_proceeds, buyer, reason, book_value_at_disposal, gain_loss, journal_entry_id, created_by)
  values
    (p_asset_id, p_disposal_date, coalesce(p_sale_proceeds, 0), p_buyer, p_reason, v_book_value, v_gain_loss, v_journal_entry_id, p_created_by);

  update assets set status = case when p_sale_proceeds > 0 then 'sold' else 'written_off' end
   where asset_id = p_asset_id;

  return v_journal_entry_id;
end;
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- Owner capital / drawings and manual journal entries
-- ----------------------------------------------------------------------------

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
    v_lines, p_created_by
  );

  insert into accounting_owner_transactions
    (transaction_type, amount, transaction_date, cash_account_code, hostel_name, notes, journal_entry_id, created_by)
  values
    (p_transaction_type, p_amount, p_transaction_date, p_cash_account_code, p_hostel_name, p_notes, v_journal_entry_id, p_created_by)
  returning owner_transaction_id into v_owner_transaction_id;

  return v_journal_entry_id;
end;
$$ language plpgsql security definer;

create or replace function post_manual_journal_entry(
  p_entry_date date, p_hostel_name text, p_narration text, p_lines jsonb, p_created_by uuid default null
) returns bigint as $$
begin
  return accounting_post_entry(p_entry_date, p_hostel_name, 'manual', null, p_narration, p_lines, p_created_by);
end;
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- Reconciliation catch-up: finds operational rows with no matching journal
-- entry and posts them retroactively. Safe to run repeatedly (every bridge
-- function above is idempotent). This is the resilience mechanism against a
-- client-side failure between "existing RPC succeeded" and "bridge posting
-- call fired" — see section 47 of the spec ("surface exceptions", not silent
-- gaps) and the completion report for how this is meant to be operated.
-- ----------------------------------------------------------------------------

create or replace function reconcile_journal_postings(p_created_by uuid default null)
returns table(entity text, posted_count int) as $$
declare
  v_row record;
  v_payment_count int := 0;
  v_expense_count int := 0;
  v_asset_count int := 0;
begin
  for v_row in
    select p.payment_id from payments p
     where p.status <> 'reversed'
       and not exists (select 1 from accounting_journal_entries je where je.source_type = 'payment' and je.source_id = p.payment_id)
  loop
    if post_payment_journal(v_row.payment_id, p_created_by) is not null then
      v_payment_count := v_payment_count + 1;
    end if;
  end loop;

  for v_row in
    select e.expense_id from expenses e
     where not exists (select 1 from accounting_journal_entries je where je.source_type = 'expense' and je.source_id = e.expense_id)
  loop
    if post_expense_journal(v_row.expense_id, p_created_by) is not null then
      v_expense_count := v_expense_count + 1;
    end if;
  end loop;

  for v_row in
    select a.asset_id from assets a
     where a.purchase_cost > 0
       and not exists (select 1 from accounting_journal_entries je where je.source_type = 'asset_purchase' and je.source_id = a.asset_id)
  loop
    if post_asset_purchase_journal(v_row.asset_id, p_created_by) is not null then
      v_asset_count := v_asset_count + 1;
    end if;
  end loop;

  return query values ('payments', v_payment_count), ('expenses', v_expense_count), ('assets', v_asset_count);
end;
$$ language plpgsql security definer;

commit;
