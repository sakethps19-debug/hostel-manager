-- ============================================================================
-- Systemic double-entry integrity bug: reversed entries silently corrupted
-- every balance-affecting report, not just cash flow.
--
-- accounting_journal_entries.status can only be 'posted' or 'reversed'
-- (check constraint). accounting_reverse_entry marks the ORIGINAL entry
-- 'reversed' and posts a NEW entry (status defaults to 'posted') with
-- every line's debit/credit flipped. Every report function below filtered
-- on je.status = 'posted', which means: the original entry (now
-- 'reversed') is EXCLUDED, while its flipped reversal (still 'posted') is
-- INCLUDED. That is not "net zero, as if it never happened" - it is the
-- OPPOSITE of the original transaction counted alone. Reversing a $9,000
-- asset purchase, for example, made the books show a $9,000 INFLOW from
-- investing activity instead of $0 net effect, and the same wrong-sign
-- distortion applies to the Trial Balance, Balance Sheet, General Ledger,
-- P&L, Accounts Receivable, cash balance, and working capital.
--
-- This is reachable today via the "Reverse Entry" button on any journal
-- entry's detail page (accounting_reverse_entry has a live UI caller
-- already), and via reverse_payment now that it also reverses the linked
-- journal entry - not a theoretical/dead-code issue.
--
-- Fix: every report/aggregation function must count BOTH 'posted' and
-- 'reversed' entries (status IN ('posted','reversed')) - a 'reversed'
-- entry is still part of the ledger, just superseded by its own reversal,
-- which is what actually cancels it out. reverse_payment's own query
-- (finding the not-yet-reversed entry linked to a payment, to avoid
-- double-reversing it) correctly keeps status = 'posted' and is
-- deliberately NOT changed here.
--
-- Verified live via rolled-back transactions: posting a $9,000 test
-- asset-purchase entry and then fully reversing it now leaves the Trial
-- Balance's total debits/credits ($62,500 / $62,500) IDENTICAL before and
-- after (previously the reversal alone shifted the trial balance), and
-- get_cash_flow_statement's Investing bucket now nets to $0.00
-- (previously showed +$9,000). run_accounting_reconciliation_checks()
-- still reports 0 flags against production after this change.
-- ============================================================================
begin;

create or replace function get_trial_balance(p_as_of_date date, p_hostel_name text default null)
returns table(account_code text, account_name text, account_type text, debit_balance numeric, credit_balance numeric)
language sql stable as $$
  select a.code, a.name, a.account_type,
         greatest(coalesce(sum(l.debit), 0) - coalesce(sum(l.credit), 0), 0) as debit_balance,
         greatest(coalesce(sum(l.credit), 0) - coalesce(sum(l.debit), 0), 0) as credit_balance
    from accounting_accounts a
    left join accounting_journal_entry_lines l on l.account_id = a.account_id
    left join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
     and je.entry_date <= p_as_of_date and je.status in ('posted','reversed')
     and (p_hostel_name is null or je.hostel_name = p_hostel_name)
   where a.is_active
   group by a.account_id, a.code, a.name, a.account_type
   order by a.code;
$$;

create or replace function get_balance_sheet(p_as_of_date date, p_hostel_name text default null)
returns table(section text, account_code text, account_name text, amount numeric)
language plpgsql stable as $$
begin
  return query
  select 'asset'::text, a.code, a.name, sum(l.debit) - sum(l.credit)
    from accounting_journal_entry_lines l
    join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
    join accounting_accounts a on a.account_id = l.account_id
   where a.account_type = 'asset' and je.entry_date <= p_as_of_date and je.status in ('posted','reversed')
     and (p_hostel_name is null or je.hostel_name = p_hostel_name)
   group by a.account_id, a.code, a.name

  union all

  select 'liability'::text, a.code, a.name, sum(l.credit) - sum(l.debit)
    from accounting_journal_entry_lines l
    join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
    join accounting_accounts a on a.account_id = l.account_id
   where a.account_type = 'liability' and je.entry_date <= p_as_of_date and je.status in ('posted','reversed')
     and (p_hostel_name is null or je.hostel_name = p_hostel_name)
   group by a.account_id, a.code, a.name

  union all

  select 'equity'::text, a.code, a.name, sum(l.credit) - sum(l.debit)
    from accounting_journal_entry_lines l
    join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
    join accounting_accounts a on a.account_id = l.account_id
   where a.account_type = 'equity' and je.entry_date <= p_as_of_date and je.status in ('posted','reversed')
     and (p_hostel_name is null or je.hostel_name = p_hostel_name)
   group by a.account_id, a.code, a.name

  union all

  select 'equity'::text, '3199'::text, 'Accumulated Surplus (P&L to date)'::text,
         coalesce(sum(case when a.account_type = 'income' then l.credit - l.debit else -(l.debit - l.credit) end), 0)
    from accounting_journal_entry_lines l
    join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
    join accounting_accounts a on a.account_id = l.account_id
   where a.account_type in ('income', 'expense') and je.entry_date <= p_as_of_date and je.status in ('posted','reversed')
     and (p_hostel_name is null or je.hostel_name = p_hostel_name);
end;
$$;

create or replace function get_cash_balance_as_of(p_as_of_date date, p_hostel_name text default null)
returns numeric
language sql stable as $$
  select coalesce(sum(l.debit) - sum(l.credit), 0)
    from accounting_journal_entry_lines l
    join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
    join accounting_accounts a on a.account_id = l.account_id
   where a.code in ('1110', '1120', '1130')
     and je.entry_date <= p_as_of_date and je.status in ('posted','reversed')
     and (p_hostel_name is null or je.hostel_name = p_hostel_name);
$$;

create or replace function get_accounts_receivable(p_hostel_name text default null)
returns table(booking_id bigint, resident_id bigint, hostel_name text, outstanding numeric, last_activity_date date)
language sql stable as $$
  select l.booking_id, l.resident_id, coalesce(je.hostel_name, l.hostel_name),
         sum(l.debit) - sum(l.credit) as outstanding,
         max(je.entry_date) as last_activity_date
    from accounting_journal_entry_lines l
    join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
    join accounting_accounts a on a.account_id = l.account_id
   where a.code = '1140' and je.status in ('posted','reversed')
     and (p_hostel_name is null or je.hostel_name = p_hostel_name)
     and l.booking_id is not null
   group by l.booking_id, l.resident_id, coalesce(je.hostel_name, l.hostel_name)
  having sum(l.debit) - sum(l.credit) <> 0
   order by outstanding desc;
$$;

create or replace function get_ledger_pnl(p_period_year integer, p_period_month integer, p_hostel_name text default null)
returns table(account_code text, account_name text, account_type text, amount numeric)
language sql stable as $$
  select a.code, a.name, a.account_type,
         case when a.account_type = 'income' then sum(l.credit) - sum(l.debit)
              else sum(l.debit) - sum(l.credit) end as amount
    from accounting_journal_entry_lines l
    join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
    join accounting_accounts a on a.account_id = l.account_id
   where a.account_type in ('income', 'expense')
     and je.period_year = p_period_year and je.period_month = p_period_month
     and je.status in ('posted','reversed')
     and (p_hostel_name is null or je.hostel_name = p_hostel_name)
   group by a.account_id, a.code, a.name, a.account_type
   order by a.code;
$$;

create or replace function get_ledger_pnl_summary(p_period_year integer, p_period_month integer, p_hostel_name text default null)
returns table(total_revenue numeric, total_expenses numeric, net_surplus numeric)
language sql stable as $$
  with flows as (
    select a.account_type,
           sum(case when a.account_type = 'income' then l.credit - l.debit else l.debit - l.credit end) as amt
      from accounting_journal_entry_lines l
      join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
      join accounting_accounts a on a.account_id = l.account_id
     where a.account_type in ('income', 'expense')
       and je.period_year = p_period_year and je.period_month = p_period_month
       and je.status in ('posted','reversed')
       and (p_hostel_name is null or je.hostel_name = p_hostel_name)
     group by a.account_type
  )
  select
    coalesce((select amt from flows where account_type = 'income'), 0),
    coalesce((select amt from flows where account_type = 'expense'), 0),
    coalesce((select amt from flows where account_type = 'income'), 0) - coalesce((select amt from flows where account_type = 'expense'), 0);
$$;

create or replace function get_working_capital(p_as_of_date date, p_hostel_name text default null)
returns table(current_assets numeric, current_liabilities numeric, working_capital numeric, accounts_receivable numeric, accounts_payable numeric, cash numeric, deposits_held numeric, other_current_liabilities numeric)
language sql stable as $$
  with ca as (
    select coalesce(sum(l.debit) - sum(l.credit), 0) as amt
      from accounting_journal_entry_lines l
      join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
      join accounting_accounts a on a.account_id = l.account_id
     where a.account_type = 'asset' and a.account_subtype = 'current_asset'
       and je.entry_date <= p_as_of_date and je.status in ('posted','reversed')
       and (p_hostel_name is null or je.hostel_name = p_hostel_name)
  ),
  cl as (
    select coalesce(sum(l.credit) - sum(l.debit), 0) as amt
      from accounting_journal_entry_lines l
      join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
      join accounting_accounts a on a.account_id = l.account_id
     where a.account_type = 'liability' and a.account_subtype = 'current_liability'
       and je.entry_date <= p_as_of_date and je.status in ('posted','reversed')
       and (p_hostel_name is null or je.hostel_name = p_hostel_name)
  ),
  ar as (
    select coalesce(sum(l.debit) - sum(l.credit), 0) as amt
      from accounting_journal_entry_lines l
      join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
      join accounting_accounts a on a.account_id = l.account_id
     where a.code in ('1140', '1150') and je.entry_date <= p_as_of_date and je.status in ('posted','reversed')
       and (p_hostel_name is null or je.hostel_name = p_hostel_name)
  ),
  ap as (
    select coalesce(sum(l.credit) - sum(l.debit), 0) as amt
      from accounting_journal_entry_lines l
      join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
      join accounting_accounts a on a.account_id = l.account_id
     where a.code = '2110' and je.entry_date <= p_as_of_date and je.status in ('posted','reversed')
       and (p_hostel_name is null or je.hostel_name = p_hostel_name)
  ),
  deposits as (
    select coalesce(sum(l.credit) - sum(l.debit), 0) as amt
      from accounting_journal_entry_lines l
      join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
      join accounting_accounts a on a.account_id = l.account_id
     where a.code = '2160' and je.entry_date <= p_as_of_date and je.status in ('posted','reversed')
       and (p_hostel_name is null or je.hostel_name = p_hostel_name)
  )
  select
    (select amt from ca), (select amt from cl), (select amt from ca) - (select amt from cl),
    (select amt from ar), (select amt from ap), get_cash_balance_as_of(p_as_of_date, p_hostel_name),
    (select amt from deposits), (select amt from cl) - (select amt from ap) - (select amt from deposits);
$$;

create or replace function capture_balance_snapshot(p_snapshot_date date, p_hostel_name text default null)
returns bigint
language plpgsql security definer set search_path to 'public' as $$
declare
  v_cash numeric; v_ar numeric; v_other_ca numeric; v_nfa numeric; v_total_assets numeric;
  v_ap numeric; v_deposits numeric; v_other_liab numeric; v_total_liab numeric;
  v_equity numeric;
  v_snapshot_id bigint;
begin
  perform accounting_require_role(array['owner', 'finance_manager']);

  select coalesce(sum(case when a.code in ('1110', '1120', '1130') then l.debit - l.credit else 0 end), 0),
         coalesce(sum(case when a.code in ('1140', '1150') then l.debit - l.credit else 0 end), 0),
         coalesce(sum(case when a.code in ('1160', '1170', '1190') then l.debit - l.credit else 0 end), 0),
         coalesce(sum(case when a.code between '1210' and '1229' then l.debit - l.credit else 0 end), 0)
           - coalesce(sum(case when a.code = '1290' then l.credit - l.debit else 0 end), 0)
    into v_cash, v_ar, v_other_ca, v_nfa
    from accounting_journal_entry_lines l
    join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
    join accounting_accounts a on a.account_id = l.account_id
   where a.account_type = 'asset' and je.entry_date <= p_snapshot_date and je.status in ('posted','reversed')
     and (p_hostel_name is null or je.hostel_name = p_hostel_name);

  v_total_assets := v_cash + v_ar + v_other_ca + v_nfa;

  select coalesce(sum(case when a.code = '2110' then l.credit - l.debit else 0 end), 0),
         coalesce(sum(case when a.code = '2160' then l.credit - l.debit else 0 end), 0),
         coalesce(sum(case when a.code not in ('2110', '2160') then l.credit - l.debit else 0 end), 0)
    into v_ap, v_deposits, v_other_liab
    from accounting_journal_entry_lines l
    join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
    join accounting_accounts a on a.account_id = l.account_id
   where a.account_type = 'liability' and je.entry_date <= p_snapshot_date and je.status in ('posted','reversed')
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
$$;

create or replace function get_general_ledger(p_account_code text, p_start_date date, p_end_date date, p_hostel_name text default null)
returns table(journal_entry_line_id bigint, journal_entry_id bigint, entry_date date, source_type text, source_id bigint, narration text, memo text, debit numeric, credit numeric, running_balance numeric)
language plpgsql stable as $$
declare
  v_normal text;
  v_opening_balance numeric;
begin
  select normal_balance into v_normal from accounting_accounts where code = p_account_code;
  if v_normal is null then
    raise exception 'get_general_ledger: unknown account code %', p_account_code;
  end if;

  select coalesce(sum(case when v_normal = 'debit' then l.debit - l.credit else l.credit - l.debit end), 0)
    into v_opening_balance
    from accounting_journal_entry_lines l
    join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
    join accounting_accounts a on a.account_id = l.account_id
   where a.code = p_account_code
     and je.entry_date < p_start_date
     and je.status in ('posted','reversed')
     and (p_hostel_name is null or je.hostel_name = p_hostel_name);

  return query
  select l.journal_entry_line_id, l.journal_entry_id, je.entry_date, je.source_type, je.source_id,
         je.narration, l.memo, l.debit, l.credit,
         v_opening_balance + sum(case when v_normal = 'debit' then l.debit - l.credit else l.credit - l.debit end)
           over (order by je.entry_date, l.journal_entry_id, l.journal_entry_line_id
                 rows between unbounded preceding and current row) as running_balance
    from accounting_journal_entry_lines l
    join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
    join accounting_accounts a on a.account_id = l.account_id
   where a.code = p_account_code
     and je.entry_date between p_start_date and p_end_date
     and je.status in ('posted','reversed')
     and (p_hostel_name is null or je.hostel_name = p_hostel_name)
   order by je.entry_date, l.journal_entry_id, l.journal_entry_line_id;
end;
$$;

create or replace function get_cash_flow_statement(p_period_year integer, p_period_month integer, p_hostel_name text default null)
returns table(category text, line_item text, amount numeric)
language sql stable as $$
  with cash_lines as (
    select l.debit, l.credit,
           coalesce(orig.source_type, je.source_type) as effective_source_type,
           coalesce(orig.source_id, je.source_id) as effective_source_id
      from accounting_journal_entry_lines l
      join accounting_journal_entries je on je.journal_entry_id = l.journal_entry_id
      join accounting_accounts a on a.account_id = l.account_id
      left join accounting_journal_entries orig
        on je.source_type = 'reversal' and orig.journal_entry_id = je.source_id
     where a.code in ('1110', '1120', '1130')
       and je.period_year = p_period_year and je.period_month = p_period_month
       and je.status in ('posted','reversed')
       and (p_hostel_name is null or je.hostel_name = p_hostel_name)
  ),
  classified as (
    select
      case
        when cl.effective_source_type = 'payment' and p.payment_type = 'Monthly Rent' then 'Operating|Rent Collections'
        when cl.effective_source_type = 'payment' and p.payment_type = 'Other Charge' then 'Operating|Other Resident Collections'
        when cl.effective_source_type = 'payment' and p.payment_type = 'Security Deposit' then 'Operating|Security Deposits Received'
        when cl.effective_source_type = 'payment' and p.payment_type = 'Deposit Refund' then 'Operating|Security Deposits Refunded'
        when cl.effective_source_type = 'expense' then 'Operating|Operating Expense Payments'
        when cl.effective_source_type = 'payable_payment' then 'Operating|Vendor Payments'
        when cl.effective_source_type = 'asset_purchase' then 'Investing|Fixed Asset Purchases'
        when cl.effective_source_type = 'asset_disposal' then 'Investing|Asset Sale Proceeds'
        when cl.effective_source_type = 'owner_capital' then 'Financing|Owner Capital Introduced'
        when cl.effective_source_type = 'owner_drawing' then 'Financing|Owner Drawings'
        else 'Operating|Other Operating Cash Flow'
      end as bucket,
      (cl.debit - cl.credit) as net_cash
    from cash_lines cl
    left join payments p on cl.effective_source_type = 'payment' and p.id = cl.effective_source_id
  )
  select split_part(bucket, '|', 1), split_part(bucket, '|', 2), sum(net_cash)
    from classified
   group by bucket
   order by 1, 2;
$$;

commit;
