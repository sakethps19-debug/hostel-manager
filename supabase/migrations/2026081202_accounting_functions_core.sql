-- ============================================================================
-- Accounting module — core posting primitives
-- ============================================================================
--
-- accounting_post_entry() is the ONE function every bridge/posting RPC in
-- 2026081203 calls to actually write a journal entry. Nothing else in this
-- module inserts into accounting_journal_entries/_lines directly, so there
-- is exactly one code path to audit for correctness.
--
-- jsonb line shape:
--   {"account_code": "1120", "debit": 25000, "credit": 0,
--    "hostel_name": "Hostel B", "resident_id": null, "booking_id": null,
--    "vendor_id": null, "asset_id": 41, "memo": "Washing machine purchase"}
-- ============================================================================

begin;

create or replace function accounting_get_account_id(p_code text) returns bigint as $$
  select account_id from accounting_accounts where code = p_code and is_active;
$$ language sql stable;

create or replace function accounting_post_entry(
  p_entry_date  date,
  p_hostel_name text,
  p_source_type text,
  p_source_id   bigint,
  p_narration   text,
  p_lines       jsonb,           -- array of line objects, see header comment
  p_created_by  uuid default null
) returns bigint as $$
declare
  v_journal_entry_id bigint;
  v_line jsonb;
  v_account_id bigint;
  v_total_debit numeric(14,2) := 0;
  v_total_credit numeric(14,2) := 0;
begin
  if jsonb_array_length(p_lines) < 2 then
    raise exception 'accounting_post_entry: an entry needs at least 2 lines, got %',
      jsonb_array_length(p_lines);
  end if;

  insert into accounting_journal_entries
    (entry_date, hostel_name, period_month, period_year, source_type, source_id, narration, created_by)
  values
    (p_entry_date, p_hostel_name, extract(month from p_entry_date)::int, extract(year from p_entry_date)::int,
     p_source_type, p_source_id, p_narration, p_created_by)
  returning journal_entry_id into v_journal_entry_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_account_id := accounting_get_account_id(v_line->>'account_code');
    if v_account_id is null then
      raise exception 'accounting_post_entry: unknown or inactive account code %', v_line->>'account_code';
    end if;

    insert into accounting_journal_entry_lines
      (journal_entry_id, account_id, debit, credit, hostel_name, resident_id, booking_id, vendor_id, asset_id, memo)
    values
      (v_journal_entry_id, v_account_id,
       coalesce((v_line->>'debit')::numeric, 0),
       coalesce((v_line->>'credit')::numeric, 0),
       coalesce(v_line->>'hostel_name', p_hostel_name),
       nullif(v_line->>'resident_id','')::bigint,
       nullif(v_line->>'booking_id','')::bigint,
       nullif(v_line->>'vendor_id','')::bigint,
       nullif(v_line->>'asset_id','')::bigint,
       v_line->>'memo');

    v_total_debit := v_total_debit + coalesce((v_line->>'debit')::numeric, 0);
    v_total_credit := v_total_credit + coalesce((v_line->>'credit')::numeric, 0);
  end loop;

  if v_total_debit <> v_total_credit then
    -- The deferred trigger would also catch this at commit, but failing
    -- fast here gives the caller a clearer error inside the same statement.
    raise exception 'accounting_post_entry: entry does not balance (debit=% credit=%) for source_type=% source_id=%',
      v_total_debit, v_total_credit, p_source_type, p_source_id;
  end if;

  return v_journal_entry_id;
end;
$$ language plpgsql security definer;

comment on function accounting_post_entry is
  'Single write path for all journal entries in this module. Validates that '
  'debits=credits before returning; the deferred trigger on '
  'accounting_journal_entry_lines is the final backstop at commit.';

-- Reverse an existing entry: posts an equal-and-opposite entry dated today
-- (or a supplied date) and links both records together. Used for
-- corrections during a locked/closed period per the spec's "use reversal,
-- not silent edit" rule (section 32).
create or replace function accounting_reverse_entry(
  p_journal_entry_id bigint,
  p_reversal_date    date default current_date,
  p_reason           text default null,
  p_created_by       uuid default null
) returns bigint as $$
declare
  v_original accounting_journal_entries%rowtype;
  v_reversal_id bigint;
  v_lines jsonb;
begin
  select * into v_original from accounting_journal_entries where journal_entry_id = p_journal_entry_id;
  if not found then
    raise exception 'accounting_reverse_entry: journal entry % not found', p_journal_entry_id;
  end if;
  if v_original.status = 'reversed' then
    raise exception 'accounting_reverse_entry: journal entry % is already reversed', p_journal_entry_id;
  end if;

  select jsonb_agg(jsonb_build_object(
    'account_code', a.code,
    'debit', l.credit,   -- flipped
    'credit', l.debit,   -- flipped
    'hostel_name', l.hostel_name,
    'resident_id', l.resident_id,
    'booking_id', l.booking_id,
    'vendor_id', l.vendor_id,
    'asset_id', l.asset_id,
    'memo', l.memo
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
    v_lines, p_created_by
  );

  update accounting_journal_entries set status = 'reversed', reversed_by_journal_entry_id = v_reversal_id
   where journal_entry_id = p_journal_entry_id;
  update accounting_journal_entries set reverses_journal_entry_id = p_journal_entry_id
   where journal_entry_id = v_reversal_id;

  return v_reversal_id;
end;
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- Period lock / unlock (see accounting_period_locks in the schema file)
-- ----------------------------------------------------------------------------

create or replace function lock_accounting_period(p_month int, p_year int, p_user uuid default null)
returns void as $$
begin
  insert into accounting_period_locks (period_month, period_year, is_locked, locked_by, locked_at)
  values (p_month, p_year, true, p_user, now())
  on conflict (period_year, period_month)
  do update set is_locked = true, locked_by = p_user, locked_at = now(),
                unlocked_by = null, unlocked_at = null;
end;
$$ language plpgsql security definer;

create or replace function unlock_accounting_period(p_month int, p_year int, p_user uuid default null)
returns void as $$
begin
  insert into accounting_period_locks (period_month, period_year, is_locked, unlocked_by, unlocked_at)
  values (p_month, p_year, false, p_user, now())
  on conflict (period_year, period_month)
  do update set is_locked = false, unlocked_by = p_user, unlocked_at = now();
end;
$$ language plpgsql security definer;

commit;
