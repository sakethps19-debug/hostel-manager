-- ============================================================================
-- General Ledger opening-balance bug.
--
-- get_general_ledger's running_balance was a window SUM computed only over
-- the ROWS RETURNED by the query (filtered to je.entry_date BETWEEN
-- p_start_date AND p_end_date). "rows between unbounded preceding and
-- current row" only reaches back to the start of the FILTERED result set,
-- not the account's actual history - so for any report window that
-- doesn't start at the account's very first transaction, every
-- running_balance shown was wrong: it silently treated the opening
-- balance as zero instead of the true cumulative balance from all posted
-- entries dated before p_start_date. Opening Balance + period movements
-- would not equal the displayed Closing Balance. This is the live General
-- Ledger report at /accounting/ledger (default range: last 3 months), not
-- dead code.
--
-- Fix: compute the true opening balance as of the day before p_start_date
-- first, then add it as a constant to the existing window sum so each
-- row's running_balance = opening balance + cumulative movement up to
-- that row. The set of rows returned (still just p_start_date..p_end_date)
-- is unchanged, so the UI's existing rendering needs no changes.
--
-- Verified live via a rolled-back transaction: an account with a $62,500
-- opening-balance entry on 2026-08-17 plus a new $10,000 debit posted on
-- 2026-09-01 - querying the window [2026-08-20, 2026-09-30] (which
-- excludes the opening entry) now correctly returns running_balance =
-- $52,500 (62,500 opening - 10,000 debit against a credit-normal account),
-- instead of the previous -10,000 (ignoring the true opening balance
-- entirely).
-- ============================================================================
begin;

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
     and je.status = 'posted'
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
     and je.status = 'posted'
     and (p_hostel_name is null or je.hostel_name = p_hostel_name)
   order by je.entry_date, l.journal_entry_id, l.journal_entry_line_id;
end;
$$;

commit;
