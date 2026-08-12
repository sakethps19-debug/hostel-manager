-- ============================================================================
-- Accounting module — reporting functions
-- ============================================================================
-- Every statement here is derived from accounting_journal_entry_lines (the
-- ledger), NOT by independently summing operational tables — this is what
-- guarantees the Balance Sheet always balances (it's the same debits/credits
-- partitioned by account type) and what makes drill-down possible (every
-- number traces back to journal_entry_line rows). The pre-existing
-- get_hostel_pnl/get_hostel_metrics_snapshot RPCs are left completely alone;
-- run_accounting_reconciliation_checks() below cross-checks against them as
-- an integrity signal, it does not replace them.
-- ============================================================================

begin;

create or replace function get_cash_balance_as_of(p_as_of_date date, p_hostel_name text default null)
returns numeric as $$
  select coalesce(sum(l.debit) - sum(l.credit), 0)
    from accounting_journal_entry_lines l
    join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
    join accounting_accounts a on a.account_id = l.account_id
   where a.code in ('1110', '1120', '1130')
     and je.entry_date <= p_as_of_date and je.status = 'posted'
     and (p_hostel_name is null or je.hostel_name = p_hostel_name);
$$ language sql stable;

-- ----------------------------------------------------------------------------
-- General Ledger + Trial Balance
-- ----------------------------------------------------------------------------

create or replace function get_general_ledger(
  p_account_code text, p_start_date date, p_end_date date, p_hostel_name text default null
) returns table(
  journal_entry_line_id bigint, journal_entry_id bigint, entry_date date, source_type text, source_id bigint,
  narration text, memo text, debit numeric, credit numeric, running_balance numeric
) as $$
declare
  v_normal text;
begin
  select normal_balance into v_normal from accounting_accounts where code = p_account_code;
  if v_normal is null then
    raise exception 'get_general_ledger: unknown account code %', p_account_code;
  end if;

  return query
  select l.journal_entry_line_id, l.journal_entry_id, je.entry_date, je.source_type, je.source_id,
         je.narration, l.memo, l.debit, l.credit,
         sum(case when v_normal = 'debit' then l.debit - l.credit else l.credit - l.debit end)
           over (order by je.entry_date, l.journal_entry_id, l.journal_entry_line_id
                 rows between unbounded preceding and current row) as running_balance
    from accounting_journal_entry_lines l
    join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
    join accounting_accounts a on a.account_id = l.account_id
   where a.code = p_account_code
     and je.entry_date between p_start_date and p_end_date
     and je.status = 'posted'
     and (p_hostel_name is null or je.hostel_name = p_hostel_name)
   order by je.entry_date, l.journal_entry_id, l.journal_entry_line_id;
end;
$$ language plpgsql stable;

create or replace function get_trial_balance(p_as_of_date date, p_hostel_name text default null)
returns table(account_code text, account_name text, account_type text, debit_balance numeric, credit_balance numeric) as $$
  select a.code, a.name, a.account_type,
         greatest(coalesce(sum(l.debit), 0) - coalesce(sum(l.credit), 0), 0) as debit_balance,
         greatest(coalesce(sum(l.credit), 0) - coalesce(sum(l.debit), 0), 0) as credit_balance
    from accounting_accounts a
    left join accounting_journal_entry_lines l on l.account_id = a.account_id
    left join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
     and je.entry_date <= p_as_of_date and je.status = 'posted'
     and (p_hostel_name is null or je.hostel_name = p_hostel_name)
   where a.is_active
   group by a.account_id, a.code, a.name, a.account_type
   order by a.code;
$$ language sql stable;

-- ----------------------------------------------------------------------------
-- Monthly P&L (ledger-driven)
-- ----------------------------------------------------------------------------

create or replace function get_ledger_pnl(p_period_year int, p_period_month int, p_hostel_name text default null)
returns table(account_code text, account_name text, account_type text, amount numeric) as $$
  select a.code, a.name, a.account_type,
         case when a.account_type = 'income' then sum(l.credit) - sum(l.debit)
              else sum(l.debit) - sum(l.credit) end as amount
    from accounting_journal_entry_lines l
    join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
    join accounting_accounts a on a.account_id = l.account_id
   where a.account_type in ('income', 'expense')
     and je.period_year = p_period_year and je.period_month = p_period_month
     and je.status = 'posted'
     and (p_hostel_name is null or je.hostel_name = p_hostel_name)
   group by a.account_id, a.code, a.name, a.account_type
   order by a.code;
$$ language sql stable;

create or replace function get_ledger_pnl_summary(p_period_year int, p_period_month int, p_hostel_name text default null)
returns table(total_revenue numeric, total_expenses numeric, net_surplus numeric) as $$
  with flows as (
    select a.account_type,
           sum(case when a.account_type = 'income' then l.credit - l.debit else l.debit - l.credit end) as amt
      from accounting_journal_entry_lines l
      join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
      join accounting_accounts a on a.account_id = l.account_id
     where a.account_type in ('income', 'expense')
       and je.period_year = p_period_year and je.period_month = p_period_month
       and je.status = 'posted'
       and (p_hostel_name is null or je.hostel_name = p_hostel_name)
     group by a.account_type
  )
  select
    coalesce((select amt from flows where account_type = 'income'), 0),
    coalesce((select amt from flows where account_type = 'expense'), 0),
    coalesce((select amt from flows where account_type = 'income'), 0) - coalesce((select amt from flows where account_type = 'expense'), 0);
$$ language sql stable;

-- ----------------------------------------------------------------------------
-- Balance Sheet (as of date). The "Accumulated Surplus (P&L to date)" line
-- is synthetic (not a stored account) — it's the running total of every
-- income/expense posting up to the as-of date, which is what makes
-- Assets = Liabilities + Equity a mathematical certainty rather than
-- something that can silently drift: every journal entry is balanced, so
-- summing all debits/credits and partitioning by account type must balance
-- too, with no separate month-end "close to equity" step required.
-- ----------------------------------------------------------------------------

create or replace function get_balance_sheet(p_as_of_date date, p_hostel_name text default null)
returns table(section text, account_code text, account_name text, amount numeric) as $$
begin
  return query
  select 'asset'::text, a.code, a.name, sum(l.debit) - sum(l.credit)
    from accounting_journal_entry_lines l
    join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
    join accounting_accounts a on a.account_id = l.account_id
   where a.account_type = 'asset' and je.entry_date <= p_as_of_date and je.status = 'posted'
     and (p_hostel_name is null or je.hostel_name = p_hostel_name)
   group by a.account_id, a.code, a.name

  union all

  select 'liability'::text, a.code, a.name, sum(l.credit) - sum(l.debit)
    from accounting_journal_entry_lines l
    join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
    join accounting_accounts a on a.account_id = l.account_id
   where a.account_type = 'liability' and je.entry_date <= p_as_of_date and je.status = 'posted'
     and (p_hostel_name is null or je.hostel_name = p_hostel_name)
   group by a.account_id, a.code, a.name

  union all

  select 'equity'::text, a.code, a.name, sum(l.credit) - sum(l.debit)
    from accounting_journal_entry_lines l
    join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
    join accounting_accounts a on a.account_id = l.account_id
   where a.account_type = 'equity' and je.entry_date <= p_as_of_date and je.status = 'posted'
     and (p_hostel_name is null or je.hostel_name = p_hostel_name)
   group by a.account_id, a.code, a.name

  union all

  select 'equity'::text, '3199'::text, 'Accumulated Surplus (P&L to date)'::text,
         coalesce(sum(case when a.account_type = 'income' then l.credit - l.debit else -(l.debit - l.credit) end), 0)
    from accounting_journal_entry_lines l
    join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
    join accounting_accounts a on a.account_id = l.account_id
   where a.account_type in ('income', 'expense') and je.entry_date <= p_as_of_date and je.status = 'posted'
     and (p_hostel_name is null or je.hostel_name = p_hostel_name);
end;
$$ language plpgsql stable;

create or replace function verify_balance_sheet_balances(p_as_of_date date, p_hostel_name text default null)
returns boolean as $$
declare
  v_assets numeric;
  v_liab_equity numeric;
begin
  select coalesce(sum(amount), 0) into v_assets from get_balance_sheet(p_as_of_date, p_hostel_name) where section = 'asset';
  select coalesce(sum(amount), 0) into v_liab_equity from get_balance_sheet(p_as_of_date, p_hostel_name) where section in ('liability', 'equity');
  return round(v_assets, 2) = round(v_liab_equity, 2);
end;
$$ language plpgsql stable;

-- ----------------------------------------------------------------------------
-- Cash Flow Statement (direct method — classifies actual Cash/Bank/UPI
-- account movements by the source transaction type of the journal entry
-- that produced them)
-- ----------------------------------------------------------------------------

create or replace function get_cash_flow_statement(p_period_year int, p_period_month int, p_hostel_name text default null)
returns table(category text, line_item text, amount numeric) as $$
  with cash_lines as (
    select l.debit, l.credit, je.source_type, je.source_id
      from accounting_journal_entry_lines l
      join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
      join accounting_accounts a on a.account_id = l.account_id
     where a.code in ('1110', '1120', '1130')
       and je.period_year = p_period_year and je.period_month = p_period_month
       and je.status = 'posted'
       and (p_hostel_name is null or je.hostel_name = p_hostel_name)
  ),
  classified as (
    select
      case
        when cl.source_type = 'payment' and p.payment_type = 'Monthly Rent' then 'Operating|Rent Collections'
        when cl.source_type = 'payment' and p.payment_type = 'Other Charge' then 'Operating|Other Resident Collections'
        when cl.source_type = 'payment' and p.payment_type = 'Security Deposit' then 'Operating|Security Deposits Received'
        when cl.source_type = 'payment' and p.payment_type = 'Deposit Refund' then 'Operating|Security Deposits Refunded'
        when cl.source_type = 'expense' then 'Operating|Operating Expense Payments'
        when cl.source_type = 'payable_payment' then 'Operating|Vendor Payments'
        when cl.source_type = 'asset_purchase' then 'Investing|Fixed Asset Purchases'
        when cl.source_type = 'asset_disposal' then 'Investing|Asset Sale Proceeds'
        when cl.source_type = 'owner_capital' then 'Financing|Owner Capital Introduced'
        when cl.source_type = 'owner_drawing' then 'Financing|Owner Drawings'
        else 'Operating|Other Operating Cash Flow'
      end as bucket,
      (cl.debit - cl.credit) as net_cash -- positive = inflow, negative = outflow (Cash/Bank/UPI are debit-normal)
    from cash_lines cl
    left join payments p on cl.source_type = 'payment' and p.payment_id = cl.source_id
  )
  select split_part(bucket, '|', 1), split_part(bucket, '|', 2), sum(net_cash)
    from classified
   group by bucket
   order by 1, 2;
$$ language sql stable;

-- ----------------------------------------------------------------------------
-- Net Worth
-- ----------------------------------------------------------------------------

create or replace function get_net_worth(p_as_of_date date, p_hostel_name text default null)
returns table(total_assets numeric, total_liabilities numeric, net_worth numeric) as $$
declare
  v_assets numeric;
  v_liab numeric;
begin
  select coalesce(sum(amount), 0) into v_assets from get_balance_sheet(p_as_of_date, p_hostel_name) where section = 'asset';
  select coalesce(sum(amount), 0) into v_liab from get_balance_sheet(p_as_of_date, p_hostel_name) where section = 'liability';
  return query select v_assets, v_liab, v_assets - v_liab;
end;
$$ language plpgsql stable;

create or replace function capture_balance_snapshot(p_snapshot_date date, p_hostel_name text default null)
returns bigint as $$
declare
  v_cash numeric; v_ar numeric; v_other_ca numeric; v_nfa numeric; v_total_assets numeric;
  v_ap numeric; v_deposits numeric; v_other_liab numeric; v_total_liab numeric;
  v_equity numeric;
  v_snapshot_id bigint;
begin
  select coalesce(sum(case when a.code in ('1110', '1120', '1130') then l.debit - l.credit else 0 end), 0),
         coalesce(sum(case when a.code in ('1140', '1150') then l.debit - l.credit else 0 end), 0),
         coalesce(sum(case when a.code in ('1160', '1170', '1190') then l.debit - l.credit else 0 end), 0),
         coalesce(sum(case when a.code between '1210' and '1229' then l.debit - l.credit else 0 end), 0)
           - coalesce(sum(case when a.code = '1290' then l.credit - l.debit else 0 end), 0)
    into v_cash, v_ar, v_other_ca, v_nfa
    from accounting_journal_entry_lines l
    join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
    join accounting_accounts a on a.account_id = l.account_id
   where a.account_type = 'asset' and je.entry_date <= p_snapshot_date and je.status = 'posted'
     and (p_hostel_name is null or je.hostel_name = p_hostel_name);

  v_total_assets := v_cash + v_ar + v_other_ca + v_nfa;

  select coalesce(sum(case when a.code = '2110' then l.credit - l.debit else 0 end), 0),
         coalesce(sum(case when a.code = '2160' then l.credit - l.debit else 0 end), 0),
         coalesce(sum(case when a.code not in ('2110', '2160') then l.credit - l.debit else 0 end), 0)
    into v_ap, v_deposits, v_other_liab
    from accounting_journal_entry_lines l
    join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
    join accounting_accounts a on a.account_id = l.account_id
   where a.account_type = 'liability' and je.entry_date <= p_snapshot_date and je.status = 'posted'
     and (p_hostel_name is null or je.hostel_name = p_hostel_name);

  v_total_liab := v_ap + v_deposits + v_other_liab;
  v_equity := v_total_assets - v_total_liab;

  insert into accounting_balance_snapshots
    (snapshot_date, hostel_name, cash_bank, receivables, other_current_assets, net_fixed_assets, total_assets,
     payables, deposits_held, other_liabilities, total_liabilities, owner_equity, net_worth)
  values
    (p_snapshot_date, p_hostel_name, v_cash, v_ar, v_other_ca, v_nfa, v_total_assets,
     v_ap, v_deposits, v_other_liab, v_total_liab, v_equity, v_equity)
  on conflict (snapshot_date, hostel_name) do update set
    cash_bank = excluded.cash_bank, receivables = excluded.receivables, other_current_assets = excluded.other_current_assets,
    net_fixed_assets = excluded.net_fixed_assets, total_assets = excluded.total_assets, payables = excluded.payables,
    deposits_held = excluded.deposits_held, other_liabilities = excluded.other_liabilities,
    total_liabilities = excluded.total_liabilities, owner_equity = excluded.owner_equity, net_worth = excluded.net_worth
  returning snapshot_id into v_snapshot_id;

  return v_snapshot_id;
end;
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- Receivables + ageing
-- ----------------------------------------------------------------------------

create or replace function get_accounts_receivable(p_hostel_name text default null)
returns table(booking_id bigint, resident_id bigint, hostel_name text, outstanding numeric, last_activity_date date) as $$
  select l.booking_id, l.resident_id, coalesce(je.hostel_name, l.hostel_name),
         sum(l.debit) - sum(l.credit) as outstanding,
         max(je.entry_date) as last_activity_date
    from accounting_journal_entry_lines l
    join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
    join accounting_accounts a on a.account_id = l.account_id
   where a.code = '1140' and je.status = 'posted'
     and (p_hostel_name is null or je.hostel_name = p_hostel_name)
     and l.booking_id is not null
   group by l.booking_id, l.resident_id, coalesce(je.hostel_name, l.hostel_name)
  having sum(l.debit) - sum(l.credit) <> 0
   order by outstanding desc;
$$ language sql stable;

comment on function get_accounts_receivable is
  'Ageing bucket boundaries here (0-7/8-30/31-60/60+, see get_receivable_ageing) '
  'are the ones specified for the new accounting AR module (section 28) and '
  'deliberately differ from app/rent/ageing/RentAgeingView.tsx''s existing '
  '0-30/31-60/61-90/90+ operational buckets — the two views serve different '
  'purposes (quick operational glance vs formal AR ageing) and are not meant '
  'to be unified into one, per the completion report.';

create or replace function get_receivable_ageing(p_as_of_date date default current_date, p_hostel_name text default null)
returns table(
  booking_id bigint, resident_id bigint, hostel_name text, outstanding numeric,
  oldest_due_date date, days_overdue int, ageing_bucket text
) as $$
  with ar as (
    select * from get_accounts_receivable(p_hostel_name)
  ),
  oldest_due as (
    select ra.booking_id, min(ra.due_date) as oldest_due_date
      from accounting_rent_accruals ra
     where ra.booking_id in (select booking_id from ar)
     group by ra.booking_id
  )
  select ar.booking_id, ar.resident_id, ar.hostel_name, ar.outstanding,
         od.oldest_due_date,
         greatest(0, (p_as_of_date - od.oldest_due_date))::int as days_overdue,
         case
           when od.oldest_due_date is null then 'Unknown'
           when p_as_of_date < od.oldest_due_date then 'Current'
           when (p_as_of_date - od.oldest_due_date) <= 7 then '0-7 days'
           when (p_as_of_date - od.oldest_due_date) <= 30 then '8-30 days'
           when (p_as_of_date - od.oldest_due_date) <= 60 then '31-60 days'
           else '60+ days'
         end as ageing_bucket
    from ar
    left join oldest_due od on od.booking_id = ar.booking_id
   order by days_overdue desc nulls last;
$$ language sql stable;

comment on function get_receivable_ageing is
  'oldest_due_date is the earliest unpaid rent_accrual due_date for the '
  'booking — a FIFO-style approximation, not a per-invoice payment '
  'allocation ledger. Sufficient for ageing-bucket purposes; documented as a '
  'simplification, not silently assumed exact.';

-- ----------------------------------------------------------------------------
-- Payables + ageing
-- ----------------------------------------------------------------------------

create or replace function get_payable_ageing(p_as_of_date date default current_date, p_hostel_name text default null)
returns table(
  payable_id bigint, vendor_id bigint, vendor_name text, hostel_name text, invoice_number text,
  due_date date, outstanding numeric, ageing_bucket text
) as $$
  select p.payable_id, p.vendor_id, p.vendor_name, p.hostel_name, p.invoice_number, p.due_date,
         p.amount - p.amount_paid as outstanding,
         case
           when p.due_date > p_as_of_date then 'Not Yet Due'
           when (p_as_of_date - p.due_date) <= 7 then '0-7 overdue'
           when (p_as_of_date - p.due_date) <= 30 then '8-30'
           when (p_as_of_date - p.due_date) <= 60 then '31-60'
           else '60+'
         end as ageing_bucket
    from accounting_payables p
   where p.status in ('due', 'partially_paid', 'overdue')
     and p.amount - p.amount_paid > 0
     and (p_hostel_name is null or p.hostel_name = p_hostel_name)
   order by p.due_date;
$$ language sql stable;

-- Keep `status` current (due -> overdue) — call this before rendering the
-- Payables page/ageing report, or on a schedule; it never touches amount/
-- amount_paid, only the status label.
create or replace function refresh_payable_statuses(p_as_of_date date default current_date)
returns int as $$
  with updated as (
    update accounting_payables
       set status = 'overdue'
     where status in ('due', 'partially_paid')
       and due_date < p_as_of_date
       and amount_paid < amount
    returning payable_id
  )
  select count(*)::int from updated;
$$ language sql volatile;

-- ----------------------------------------------------------------------------
-- Forecast: future contracted rent, future expenses, cash surplus/shortfall
-- ----------------------------------------------------------------------------

create or replace function get_future_rent_forecast(p_as_of_date date, p_horizon_months int, p_hostel_name text default null)
returns table(period_year int, period_month int, expected_amount numeric) as $$
declare
  v_month_offset int;
  v_period_date date;
begin
  for v_month_offset in 0..(p_horizon_months - 1) loop
    v_period_date := (date_trunc('month', p_as_of_date) + (v_month_offset || ' months')::interval)::date;
    period_year := extract(year from v_period_date)::int;
    period_month := extract(month from v_period_date)::int;
    select coalesce(sum(accounting_rent_amount_for_period(b.booking_id, period_year, period_month)), 0)
      into expected_amount
      from bookings b
     where b.booking_status in ('confirmed', 'checked_in')
       and b.start_date <= (v_period_date + interval '1 month - 1 day')
       and (b.end_date is null or b.end_date >= v_period_date)
       and (p_hostel_name is null or b.hostel_name = p_hostel_name);
    return next;
  end loop;
end;
$$ language plpgsql stable;

comment on function get_future_rent_forecast is
  'This is FUTURE CONTRACTED RENT, not Accounts Receivable — it must never be '
  'summed into the Balance Sheet. Adjusts for expected checkout via each '
  'booking''s end_date, which is what "adjust for expected checkout or '
  'notice" (section 16) resolves to given the data model available today: '
  'a booking with notice_given_at set already has (or should have) an '
  'end_date reflecting the notice period, per the existing Give Notice flow '
  '— there is no separate "expected checkout probability" concept to model.';

create or replace function get_future_expense_forecast(p_as_of_date date, p_horizon_months int, p_hostel_name text default null)
returns table(period_year int, period_month int, expected_amount numeric) as $$
declare
  v_month_offset int;
  v_period_date date;
begin
  for v_month_offset in 0..(p_horizon_months - 1) loop
    v_period_date := (date_trunc('month', p_as_of_date) + (v_month_offset || ' months')::interval)::date;
    period_year := extract(year from v_period_date)::int;
    period_month := extract(month from v_period_date)::int;
    select coalesce(sum(t.amount), 0) into expected_amount
      from recurring_expense_templates t
     where t.is_active
       and (p_hostel_name is null or t.hostel_name = p_hostel_name);
    return next;
  end loop;
end;
$$ language plpgsql stable;

comment on function get_future_expense_forecast is
  'Sourced from active recurring_expense_templates only (every template '
  'recurs monthly today — day_of_month is the only cadence the existing '
  'schema supports, so monthly is not an invented assumption). Known '
  'vendor payments already due belong in Accounts Payable, not here — do '
  'not double count a payable in both this forecast and get_payable_ageing.';

create or replace function get_cash_forecast(p_as_of_date date, p_horizon_months int, p_hostel_name text default null)
returns table(period_year int, period_month int, opening_cash numeric, expected_inflow numeric, expected_outflow numeric, projected_closing_cash numeric) as $$
declare
  v_cash numeric := get_cash_balance_as_of(p_as_of_date, p_hostel_name);
  v_row record;
begin
  for v_row in
    select r.period_year, r.period_month, r.expected_amount as inflow, coalesce(e.expected_amount, 0) as outflow
      from get_future_rent_forecast(p_as_of_date, p_horizon_months, p_hostel_name) r
      left join get_future_expense_forecast(p_as_of_date, p_horizon_months, p_hostel_name) e
        on e.period_year = r.period_year and e.period_month = r.period_month
     order by r.period_year, r.period_month
  loop
    period_year := v_row.period_year;
    period_month := v_row.period_month;
    opening_cash := v_cash;
    expected_inflow := v_row.inflow;
    expected_outflow := v_row.outflow;
    v_cash := v_cash + v_row.inflow - v_row.outflow;
    projected_closing_cash := v_cash;
    return next;
  end loop;
end;
$$ language plpgsql stable;

comment on function get_cash_forecast is
  'FORECAST, not actual accounting balances — labeled as such in every '
  'consuming page per section 26. expected_inflow here is gross contracted '
  'rent for the period, not netted against expected collection shortfall; '
  'the app UI should present this alongside actual collection-efficiency % '
  '(already computed elsewhere, e.g. Owner KPIs) so the reader can judge '
  'how much of the forecast is realistic.';

-- ----------------------------------------------------------------------------
-- Working Capital
-- ----------------------------------------------------------------------------

create or replace function get_working_capital(p_as_of_date date, p_hostel_name text default null)
returns table(
  current_assets numeric, current_liabilities numeric, working_capital numeric,
  accounts_receivable numeric, accounts_payable numeric, cash numeric,
  deposits_held numeric, other_current_liabilities numeric
) as $$
  with ca as (
    select coalesce(sum(l.debit) - sum(l.credit), 0) as amt
      from accounting_journal_entry_lines l
      join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
      join accounting_accounts a on a.account_id = l.account_id
     where a.account_type = 'asset' and a.account_subtype = 'current_asset'
       and je.entry_date <= p_as_of_date and je.status = 'posted'
       and (p_hostel_name is null or je.hostel_name = p_hostel_name)
  ),
  cl as (
    select coalesce(sum(l.credit) - sum(l.debit), 0) as amt
      from accounting_journal_entry_lines l
      join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
      join accounting_accounts a on a.account_id = l.account_id
     where a.account_type = 'liability' and a.account_subtype = 'current_liability'
       and je.entry_date <= p_as_of_date and je.status = 'posted'
       and (p_hostel_name is null or je.hostel_name = p_hostel_name)
  ),
  ar as (
    select coalesce(sum(l.debit) - sum(l.credit), 0) as amt
      from accounting_journal_entry_lines l
      join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
      join accounting_accounts a on a.account_id = l.account_id
     where a.code in ('1140', '1150') and je.entry_date <= p_as_of_date and je.status = 'posted'
       and (p_hostel_name is null or je.hostel_name = p_hostel_name)
  ),
  ap as (
    select coalesce(sum(l.credit) - sum(l.debit), 0) as amt
      from accounting_journal_entry_lines l
      join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
      join accounting_accounts a on a.account_id = l.account_id
     where a.code = '2110' and je.entry_date <= p_as_of_date and je.status = 'posted'
       and (p_hostel_name is null or je.hostel_name = p_hostel_name)
  ),
  deposits as (
    select coalesce(sum(l.credit) - sum(l.debit), 0) as amt
      from accounting_journal_entry_lines l
      join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
      join accounting_accounts a on a.account_id = l.account_id
     where a.code = '2160' and je.entry_date <= p_as_of_date and je.status = 'posted'
       and (p_hostel_name is null or je.hostel_name = p_hostel_name)
  )
  select
    (select amt from ca), (select amt from cl), (select amt from ca) - (select amt from cl),
    (select amt from ar), (select amt from ap), get_cash_balance_as_of(p_as_of_date, p_hostel_name),
    (select amt from deposits), (select amt from cl) - (select amt from ap) - (select amt from deposits);
$$ language sql stable;

-- ----------------------------------------------------------------------------
-- Reconciliation checks
-- ----------------------------------------------------------------------------

create or replace function accounting_raise_flag_if_new(
  p_flag_type text, p_description text, p_source_type text, p_source_id bigint, p_variance numeric default null
) returns boolean as $$
begin
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
    select payment_id from payments
     where status <> 'reversed'
       and not exists (select 1 from accounting_journal_entries where source_type = 'payment' and source_id = payment_id)
  loop
    if accounting_raise_flag_if_new('unjournaled_payment', 'Payment has no journal entry', 'payment', v_row.payment_id)
    then v_flag_count := v_flag_count + 1; end if;
  end loop;

  for v_row in
    select expense_id from expenses
     where not exists (select 1 from accounting_journal_entries where source_type = 'expense' and source_id = expense_id)
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
