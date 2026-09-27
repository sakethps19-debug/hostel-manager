-- ============================================================================
-- Historical payment/expense/asset journal backfill.
--
-- Now that record_payment/record_expense/add_asset post their journal
-- entries atomically, this is a safety net for anything recorded before
-- that fix (or any future gap this doesn't anticipate) - not a routine
-- workflow. It walks every active payment, every expense, and every
-- cost-bearing asset that is missing its accounting journal entry and
-- posts it via the existing post_payment_journal/post_expense_journal/
-- post_asset_purchase_journal functions, which are already idempotent
-- (each checks for an existing entry for that source before inserting, so
-- calling this repeatedly, or on rows that already have an entry, never
-- creates a duplicate).
--
-- Live run against production (2026-09-27): 1 payment total (reversed,
-- correctly has no journal entry), 0 expenses, 0 cost-bearing assets - 0
-- missing journal entries found, 0 repairs needed
-- (run_accounting_reconciliation_checks() independently confirmed 0 flags:
-- trial balance and balance sheet both balance, no unjournaled
-- payments/expenses/assets, no unbalanced or orphaned journal entries, no
-- asset-ledger mismatches, no negative AR balances). Kept as a reusable,
-- owner/finance_manager-only, safe-to-rerun tool for when real payment
-- volume begins.
-- ============================================================================
begin;

create or replace function backfill_missing_financial_journals()
returns table(source_type text, source_id bigint, journal_entry_id bigint)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_row record;
  v_journal_entry_id bigint;
begin
  perform accounting_require_role(array['owner','finance_manager']);

  for v_row in
    select p.id from payments p
     where p.status <> 'reversed'
       and not exists (select 1 from accounting_journal_entries je where je.source_type = 'payment' and je.source_id = p.id)
  loop
    v_journal_entry_id := post_payment_journal(v_row.id, auth.uid());
    if v_journal_entry_id is not null then
      source_type := 'payment'; source_id := v_row.id; journal_entry_id := v_journal_entry_id;
      return next;
    end if;
  end loop;

  for v_row in
    select e.id from expenses e
     where not exists (select 1 from accounting_journal_entries je where je.source_type = 'expense' and je.source_id = e.id)
  loop
    v_journal_entry_id := post_expense_journal(v_row.id, auth.uid());
    if v_journal_entry_id is not null then
      source_type := 'expense'; source_id := v_row.id; journal_entry_id := v_journal_entry_id;
      return next;
    end if;
  end loop;

  for v_row in
    select a.asset_id as id from assets a
     where a.purchase_cost > 0
       and not exists (select 1 from accounting_journal_entries je where je.source_type = 'asset_purchase' and je.source_id = a.asset_id)
  loop
    v_journal_entry_id := post_asset_purchase_journal(v_row.id, auth.uid());
    if v_journal_entry_id is not null then
      source_type := 'asset_purchase'; source_id := v_row.id; journal_entry_id := v_journal_entry_id;
      return next;
    end if;
  end loop;

  return;
end;
$$;

commit;
