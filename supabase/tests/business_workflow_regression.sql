-- ============================================================================
-- Business workflow regression suite: booking, resident lifecycle, settlement
-- atomicity, payment atomicity/idempotency/reversal, accounting invariants,
-- and occupancy aggregation. Run against TEST/UAT only (creates and rolls
-- back real rows via the actual RPCs). Wrapped in begin/rollback throughout.
--
-- Run with: psql "$DATABASE_URL" -f supabase/tests/business_workflow_regression.sql
-- (or via the Supabase MCP execute_sql tool against a TEST/UAT project).
--
-- Depends on three real bugs found and fixed while writing this suite (see
-- their migration files for full details) - this suite will regress if any
-- of them is reverted:
--   - 2026092702_guard_create_booking_against_non_active_beds.sql
--     (create_booking never checked beds.status; A4 below)
--   - 2026092703_post_journal_for_settlement_deposit_refund.sql
--     (finalize_settlement_and_vacate's refund never posted a journal
--     entry; C7 below)
--   - 2026092704_fix_transfer_resident_deposit_carry_forward_null_resident_id.sql
--     (transfer_resident crashed whenever the transferred resident had an
--     existing deposit; Section B below)
--
-- beds/rooms/floors/hostels/bookings/residents/payments/settlements all
-- have RLS enabled with zero policies (RPC-only access by design), so any
-- direct SELECT while impersonating a test role silently returns nothing -
-- every verification query in this file runs after resetting back to the
-- admin/superuser connection role, never while impersonating owner/ops/
-- finance. get_hostel_dashboard()'s occupied/vacant/vacating_soon/reserved/
-- maintenance fields are NOT a simple partition of total_beds - see the
-- comment at Section F for its actual (verified) semantics.
-- ============================================================================
begin;
select plan(30);

create table pg_temp.results(id serial, msg text);
grant insert, select on pg_temp.results to authenticated;
grant usage, select on pg_temp.results_id_seq to authenticated;

create or replace function pg_temp.as_role(p_which text)
returns void language plpgsql as $$
declare
  v_id uuid;
begin
  v_id := case p_which
    when 'owner' then 'a0000000-0000-0000-0000-000000000001'::uuid
    when 'ops' then 'a0000000-0000-0000-0000-000000000002'::uuid
    when 'finance' then 'a0000000-0000-0000-0000-000000000003'::uuid
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id::text, 'role', 'authenticated')::text, true);
  execute 'set role authenticated';
end;
$$;

-- Bypasses RLS regardless of the ambient `set role` (owned by the admin
-- role that created it, before any role switch happens) - needed because
-- beds/rooms/floors/hostels have RLS enabled with zero policies (RPC-only
-- access by design), so a plain SELECT while impersonating a test role
-- would otherwise silently return no rows.
create or replace function pg_temp.bed_id(p_code text) returns bigint
language sql security definer as $$ select id from beds where bed_code = p_code $$;

-- ---------------------------------------------------------------------------
-- Section A: booking rules
-- ---------------------------------------------------------------------------
insert into hostels (name, address, is_active) values ('ZZ Regression Test Hostel', 'n/a', true)
on conflict do nothing;

do $$
declare
  v_hostel_id bigint;
  v_floor_id bigint;
  v_room_id bigint;
  v_bed1 bigint;
  v_maint_bed bigint;
begin
  select id into v_hostel_id from hostels where name = 'ZZ Regression Test Hostel';
  insert into floors (hostel_id, floor_number, floor_name) values (v_hostel_id, 1, 'Floor 1') returning id into v_floor_id;
  insert into rooms (floor_id, room_number, sharing_type, status, standard_rate) values (v_floor_id, 'ZZ101', 3, 'active', 5000) returning id into v_room_id;
  insert into beds (room_id, bed_number, status, bed_code) values (v_room_id, '1', 'active', 'ZZ101-1') returning id into v_bed1;
  insert into beds (room_id, bed_number, status, bed_code) values (v_room_id, '2', 'maintenance', 'ZZ101-2') returning id into v_maint_bed;
  insert into beds (room_id, bed_number, status, bed_code) values (v_room_id, '3', 'active', 'ZZ101-3');
end $$;

-- A1: valid booking on an active bed succeeds
do $$
declare
  v_bed_id bigint := pg_temp.bed_id('ZZ101-1');
  v_booking_id bigint;
begin
  perform pg_temp.as_role('ops');
  select booking_id into v_booking_id
  from create_booking(
    v_bed_id,
    'Regression Test A1', '9000000201', null, null, 'Aadhaar Card', '000000000201', null, null,
    'section A1', current_date, current_date + 180, 5000, 10000
  );
  insert into pg_temp.results(msg) select ok(v_booking_id is not null, 'A1: valid booking on an active bed succeeds');
end $$;

-- A2: overlapping booking on the same (now-occupied) bed is rejected
do $$
declare
  v_bed_id bigint := pg_temp.bed_id('ZZ101-1');
  v_query text;
begin
  v_query := format(
    'select booking_id from create_booking(%L::bigint, %L, %L, null, null, %L, %L, null, null, %L, %L::date, %L::date, %s, %s)',
    v_bed_id, 'Regression Test A2 (should fail)', '9000000202', 'Aadhaar Card', '000000000202',
    'section A2 - overlap', current_date, current_date + 90, 5000, 10000
  );
  insert into pg_temp.results(msg) select throws_ok(v_query, 'This bed is already booked for the selected dates', 'A2: overlapping booking on an occupied bed is rejected');
end $$;

-- A3: sequential (non-overlapping) booking on the same bed after the first ends is allowed
do $$
declare
  v_bed_id bigint := pg_temp.bed_id('ZZ101-1');
  v_booking_id bigint;
begin
  select booking_id into v_booking_id
  from create_booking(
    v_bed_id,
    'Regression Test A3', '9000000203', null, null, 'Aadhaar Card', '000000000203', null, null,
    'section A3 - sequential, non-overlapping', current_date + 181, current_date + 365, 5000, 10000
  );
  insert into pg_temp.results(msg) select ok(v_booking_id is not null, 'A3: sequential non-overlapping booking on the same bed is allowed');
end $$;

-- A4: maintenance-blocked bed cannot be booked (2026092702 fix)
do $$
declare
  v_bed_id bigint := pg_temp.bed_id('ZZ101-2');
  v_query text;
begin
  v_query := format(
    'select booking_id from create_booking(%L::bigint, %L, %L, null, null, %L, %L, null, null, %L, %L::date, %L::date, %s, %s)',
    v_bed_id, 'Regression Test A4 (should fail)', '9000000204', 'Aadhaar Card', '000000000204',
    'section A4 - maintenance-blocked bed', current_date, current_date + 90, 5000, 10000
  );
  insert into pg_temp.results(msg) select throws_ok(v_query, 'This bed is not available for booking (status: maintenance).', 'A4: booking a maintenance-blocked bed is rejected');
end $$;

-- A5: future reservation is accepted
do $$
declare
  v_bed_id bigint := pg_temp.bed_id('ZZ101-3');
  v_booking_id bigint;
begin
  select booking_id into v_booking_id
  from create_booking(
    v_bed_id,
    'Regression Test A5 (future)', '9000000205', null, null, 'Aadhaar Card', '000000000205',
    null, null, 'section A5 - future reservation', current_date + 30, current_date + 210, 5000, 10000
  );
  insert into pg_temp.results(msg) select ok(v_booking_id is not null, 'A5: future-dated reservation is accepted');
end $$;

-- ---------------------------------------------------------------------------
-- Section B: resident lifecycle (create -> book -> transfer -> notice ->
-- settle -> vacate), verifying searchability and payment history continuity
-- ---------------------------------------------------------------------------
do $$
declare
  v_hostel_id bigint;
  v_floor_id bigint;
  v_room_id bigint;
  v_bed_from bigint;
  v_bed_to bigint;
  v_booking_id bigint;
  v_resident_id bigint;
  v_new_booking_id bigint;
  v_still_visible boolean;
  v_deposit_visible_on_new_booking boolean;
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select id into v_hostel_id from hostels where name = 'ZZ Regression Test Hostel';
  select id into v_floor_id from floors where hostel_id = v_hostel_id;
  insert into rooms (floor_id, room_number, sharing_type, status, standard_rate) values (v_floor_id, 'ZZ201', 2, 'active', 5000) returning id into v_room_id;
  insert into beds (room_id, bed_number, status, bed_code) values (v_room_id, '1', 'active', 'ZZ201-1') returning id into v_bed_from;
  insert into beds (room_id, bed_number, status, bed_code) values (v_room_id, '2', 'active', 'ZZ201-2') returning id into v_bed_to;

  perform pg_temp.as_role('ops');
  select booking_id, resident_id into v_booking_id, v_resident_id
  from create_booking(v_bed_from, 'Regression Test B Lifecycle', '9000000210', null, null, 'Aadhaar Card', '000000000210',
    null, null, 'section B - full lifecycle', current_date - 60, current_date + 300, 5000, 10000);

  perform pg_temp.as_role('finance');
  perform record_payment(v_booking_id, 10000, current_date - 60, null, 'Security Deposit', 'Cash', 'B-DEP', 'lifecycle deposit', 'lifecycle-b-deposit');

  perform pg_temp.as_role('owner');
  select new_booking_id into v_new_booking_id
  from transfer_resident(v_booking_id, v_bed_to, current_date - 10, 'lifecycle test transfer', null, 6000, 12000, null);

  perform give_notice(v_new_booking_id, current_date + 20, 'lifecycle test notice');

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  insert into pg_temp.results(msg) select ok(
    not exists (select 1 from bookings where bed_id = v_bed_from and status in ('confirmed','checked_in')),
    'B1: old bed released after transfer (no active booking remains on it)'
  );

  insert into pg_temp.results(msg) select ok(
    exists (select 1 from bookings where id = v_new_booking_id and bed_id = v_bed_to and status in ('confirmed','checked_in')),
    'B2: new bed correctly allocated to the transferred booking'
  );

  select exists (select 1 from residents where id = v_resident_id and full_name = 'Regression Test B Lifecycle') into v_still_visible;
  insert into pg_temp.results(msg) select ok(v_still_visible, 'B3: resident remains searchable after transfer');

  select exists (
    select 1 from payments p
    join bookings b on b.id = p.booking_id
    where b.resident_id = v_resident_id and p.payment_type = 'Security Deposit'
  ) into v_deposit_visible_on_new_booking;
  insert into pg_temp.results(msg) select ok(v_deposit_visible_on_new_booking, 'B4: pre-transfer deposit payment history remains attached to the resident');

  insert into pg_temp.results(msg) select ok(
    (select status = 'completed' and end_date = (current_date - 10) - 1 from bookings where id = v_booking_id),
    'B5: old booking correctly closed out on transfer (completed, end_date = transfer_date - 1)'
  );
end $$;

-- ---------------------------------------------------------------------------
-- Section C: settlement + vacate atomicity (forced failure, then success)
-- ---------------------------------------------------------------------------
do $$
declare
  v_hostel_id bigint;
  v_floor_id bigint;
  v_room_id bigint;
  v_bed_id bigint;
  v_booking_id bigint;
  v_caught boolean := false;
  v_settlement_exists boolean;
  v_refund_payment_exists boolean;
  v_booking_status text;
  v_journal_exists boolean;
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select id into v_hostel_id from hostels where name = 'ZZ Regression Test Hostel';
  select id into v_floor_id from floors where hostel_id = v_hostel_id;
  insert into rooms (floor_id, room_number, sharing_type, status, standard_rate) values (v_floor_id, 'ZZ301', 1, 'active', 5000) returning id into v_room_id;
  insert into beds (room_id, bed_number, status, bed_code) values (v_room_id, '1', 'active', 'ZZ301-1') returning id into v_bed_id;

  perform pg_temp.as_role('ops');
  select booking_id into v_booking_id
  from create_booking(v_bed_id, 'Regression Test C Settlement', '9000000220', null, null, 'Aadhaar Card', '000000000220',
    null, null, 'section C - settlement atomicity', current_date, current_date + 200, 5000, 15000);

  perform pg_temp.as_role('finance');
  perform record_payment(v_booking_id, 15000, current_date, null, 'Security Deposit', 'Cash', 'C-DEP', 'settlement test deposit', 'settlement-c-deposit');
  perform record_payment(v_booking_id, 5000, current_date, date_trunc('month', current_date)::date, 'Monthly Rent', 'Cash', 'C-RENT', 'settlement test rent', 'settlement-c-rent');

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update accounting_accounts set is_active = false where code = '2160';

  perform pg_temp.as_role('ops');
  begin
    perform finalize_settlement_and_vacate(v_booking_id, 0, null, 'section C - forced failure');
  exception when others then
    v_caught := true;
  end;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update accounting_accounts set is_active = true where code = '2160';

  insert into pg_temp.results(msg) select ok(v_caught, 'C1: forced failure inside settlement raises an exception');

  select exists(select 1 from settlements where booking_id = v_booking_id) into v_settlement_exists;
  insert into pg_temp.results(msg) select ok(not v_settlement_exists, 'C2: forced failure leaves no settlements row (all-or-nothing)');

  select exists(select 1 from payments where booking_id = v_booking_id and payment_type = 'Deposit Refund') into v_refund_payment_exists;
  insert into pg_temp.results(msg) select ok(not v_refund_payment_exists, 'C3: forced failure leaves no orphaned Deposit Refund payment row');

  select status into v_booking_status from bookings where id = v_booking_id;
  insert into pg_temp.results(msg) select is(v_booking_status, 'confirmed', 'C4: forced failure leaves the booking status untouched (still confirmed, not vacated)');

  perform pg_temp.as_role('ops');
  perform finalize_settlement_and_vacate(v_booking_id, 0, null, 'section C - successful settlement');

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select exists(select 1 from settlements where booking_id = v_booking_id) into v_settlement_exists;
  insert into pg_temp.results(msg) select ok(v_settlement_exists, 'C5: successful settlement creates a settlements row');

  select (status = 'completed') into v_settlement_exists from bookings where id = v_booking_id;
  insert into pg_temp.results(msg) select ok(v_settlement_exists, 'C6: successful settlement marks the booking completed (vacated)');

  select exists (
    select 1 from accounting_journal_entries je
    join accounting_journal_entry_lines jel on jel.journal_entry_id = je.journal_entry_id
    where je.source_type = 'payment'
      and je.source_id = (select id from payments where booking_id = v_booking_id and payment_type = 'Deposit Refund')
    group by je.journal_entry_id
    having sum(jel.debit) = sum(jel.credit) and sum(jel.debit) > 0
  ) into v_journal_exists;
  insert into pg_temp.results(msg) select ok(v_journal_exists, 'C7: successful settlement posts a correctly-balanced refund journal entry');
end $$;

-- ---------------------------------------------------------------------------
-- Section D: payment idempotency, distinctness, and reversal
-- ---------------------------------------------------------------------------
do $$
declare
  v_hostel_id bigint;
  v_floor_id bigint;
  v_room_id bigint;
  v_bed_id bigint;
  v_booking_id bigint;
  v_pay1_id bigint; v_pay1_receipt text; v_pay1_new boolean;
  v_pay2_id bigint; v_pay2_receipt text; v_pay2_new boolean;
  v_pay3_id bigint; v_pay3_new boolean;
  v_reversal_ok boolean;
  v_net_after_reversal numeric;
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select id into v_hostel_id from hostels where name = 'ZZ Regression Test Hostel';
  select id into v_floor_id from floors where hostel_id = v_hostel_id;
  insert into rooms (floor_id, room_number, sharing_type, status, standard_rate) values (v_floor_id, 'ZZ401', 1, 'active', 5000) returning id into v_room_id;
  insert into beds (room_id, bed_number, status, bed_code) values (v_room_id, '1', 'active', 'ZZ401-1') returning id into v_bed_id;

  perform pg_temp.as_role('ops');
  select booking_id into v_booking_id
  from create_booking(v_bed_id, 'Regression Test D Payments', '9000000230', null, null, 'Aadhaar Card', '000000000230',
    null, null, 'section D - payments', current_date, current_date + 200, 5000, 0);

  perform pg_temp.as_role('finance');

  select payment_id, receipt_number, is_new into v_pay1_id, v_pay1_receipt, v_pay1_new
  from record_payment(v_booking_id, 5000, current_date, date_trunc('month', current_date)::date, 'Monthly Rent', 'Cash', 'D-1', 'idempotency test', 'idem-key-d-1');
  select payment_id, receipt_number, is_new into v_pay2_id, v_pay2_receipt, v_pay2_new
  from record_payment(v_booking_id, 5000, current_date, date_trunc('month', current_date)::date, 'Monthly Rent', 'Cash', 'D-1-retry', 'idempotency retry (should be a no-op)', 'idem-key-d-1');

  insert into pg_temp.results(msg) select is(v_pay1_new, true, 'D1: first call with a new idempotency key creates a payment');
  insert into pg_temp.results(msg) select ok(v_pay2_id = v_pay1_id and v_pay2_new = false, 'D2: repeated call with the same idempotency key returns the original payment, not a duplicate');

  select payment_id, is_new into v_pay3_id, v_pay3_new
  from record_payment(v_booking_id, 5000, current_date, (date_trunc('month', current_date) + interval '1 month')::date, 'Monthly Rent', 'Cash', 'D-2', 'separate payment', 'idem-key-d-2');
  insert into pg_temp.results(msg) select ok(v_pay3_id <> v_pay1_id and v_pay3_new = true, 'D3: a payment with a distinct idempotency key is recorded as a genuinely separate payment');

  insert into pg_temp.results(msg) select ok(
    (select count(distinct receipt_number) = count(*) from payments where id in (v_pay1_id, v_pay3_id)),
    'D4: receipt numbers are unique across distinct payments'
  );

  perform reverse_payment(v_pay3_id, 'regression test reversal');

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select (status = 'reversed') into v_reversal_ok from payments where id = v_pay3_id;
  insert into pg_temp.results(msg) select ok(v_reversal_ok, 'D5: reverse_payment marks the original payment as reversed');

  select coalesce(sum(jel.debit), 0) - coalesce(sum(jel.credit), 0)
  into v_net_after_reversal
  from accounting_journal_entry_lines jel
  join accounting_journal_entries je on je.journal_entry_id = jel.journal_entry_id
  where (je.source_type = 'payment' and je.source_id = v_pay3_id)
     or (je.source_type = 'payment_reversal' and je.source_id = v_pay3_id);

  insert into pg_temp.results(msg) select is(v_net_after_reversal, 0::numeric, 'D6: original payment + its reversal net to zero across the affected accounts');
end $$;

-- ---------------------------------------------------------------------------
-- Section E: accounting invariants (unbalanced entries rejected atomically,
-- payment/journal atomicity under a forced failure)
-- ---------------------------------------------------------------------------
do $$
declare
  v_caught boolean := false;
  v_before_count int;
  v_after_count int;
  v_hostel_id bigint;
  v_floor_id bigint;
  v_room_id bigint;
  v_bed_id bigint;
  v_booking_id bigint;
  v_payment_count_before int;
  v_payment_count_after int;
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_before_count from accounting_journal_entries where narration = 'regression-test-unbalanced-entry';
  begin
    perform accounting_post_entry(current_date, 'Hostel A', 'manual_adjustment', 0, 'regression-test-unbalanced-entry',
      jsonb_build_array(
        jsonb_build_object('account_code','1110','debit',100,'credit',0),
        jsonb_build_object('account_code','4110','debit',0,'credit',50)
      ), null);
  exception when others then
    v_caught := true;
  end;
  select count(*) into v_after_count from accounting_journal_entries where narration = 'regression-test-unbalanced-entry';

  insert into pg_temp.results(msg) select ok(v_caught, 'E1a: accounting_post_entry rejects an unbalanced entry (debit <> credit)');
  insert into pg_temp.results(msg) select is(v_after_count, v_before_count, 'E1b: a rejected unbalanced entry leaves no partial journal_entries/lines rows behind');

  select id into v_hostel_id from hostels where name = 'ZZ Regression Test Hostel';
  select id into v_floor_id from floors where hostel_id = v_hostel_id;
  insert into rooms (floor_id, room_number, sharing_type, status, standard_rate) values (v_floor_id, 'ZZ501', 1, 'active', 5000) returning id into v_room_id;
  insert into beds (room_id, bed_number, status, bed_code) values (v_room_id, '1', 'active', 'ZZ501-1') returning id into v_bed_id;

  perform pg_temp.as_role('ops');
  select booking_id into v_booking_id
  from create_booking(v_bed_id, 'Regression Test E Atomicity', '9000000240', null, null, 'Aadhaar Card', '000000000240',
    null, null, 'section E - payment/journal atomicity', current_date, current_date + 200, 5000, 0);

  select count(*) into v_payment_count_before from payments where booking_id = v_booking_id;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update accounting_accounts set is_active = false where code = '1110';

  perform pg_temp.as_role('finance');
  v_caught := false;
  begin
    perform record_payment(v_booking_id, 5000, current_date, date_trunc('month', current_date)::date, 'Monthly Rent', 'Cash', 'E-1', 'atomicity forced failure', 'atomicity-e-1');
  exception when others then
    v_caught := true;
  end;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update accounting_accounts set is_active = true where code = '1110';

  select count(*) into v_payment_count_after from payments where booking_id = v_booking_id;

  insert into pg_temp.results(msg) select ok(v_caught, 'E2a: record_payment fails when the underlying journal posting fails');
  insert into pg_temp.results(msg) select is(v_payment_count_after, v_payment_count_before, 'E2b: forced journal-posting failure leaves no orphaned payment row (no split state)');

  perform pg_temp.as_role('finance');
  perform record_payment(v_booking_id, 5000, current_date, date_trunc('month', current_date)::date, 'Monthly Rent', 'Cash', 'E-2', 'atomicity success after retry', 'atomicity-e-2');

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  insert into pg_temp.results(msg) select ok(
    (select count(*) from payments where booking_id = v_booking_id) = v_payment_count_before + 1,
    'E2c: after reactivating the account, the same payment succeeds normally'
  );
end $$;

-- ---------------------------------------------------------------------------
-- Section F: occupancy aggregation invariants
-- ---------------------------------------------------------------------------
-- NOTE on get_hostel_dashboard()'s actual (verified) semantics, since a
-- naive "5 categories sum to total_beds" assumption is WRONG and was an
-- authoring bug in an earlier draft of this test, not a product bug:
--   - total_beds counts only beds where bed.status='active' (maintenance-
--     status beds are deliberately excluded from total_beds, and reported
--     separately via maintenance_beds).
--   - vacating_soon_beds is a SUBSET of occupied_beds (any booking with
--     notice_given_at set), not a mutually-exclusive peer category.
--   - vacant_beds is derived as total_beds - occupied_beds - reserved_beds.
-- The real invariants to check are these two relationships, not a sum.
do $$
declare
  v_row record;
  v_all_consistent boolean := true;
begin
  perform pg_temp.as_role('owner');
  for v_row in select * from get_hostel_dashboard()
  loop
    if v_row.vacant_beds <> (v_row.total_beds - v_row.occupied_beds - v_row.reserved_beds) then
      v_all_consistent := false;
    end if;
    if v_row.vacating_soon_beds > v_row.occupied_beds then
      v_all_consistent := false;
    end if;
  end loop;
  insert into pg_temp.results(msg) select ok(v_all_consistent, 'F1: vacant_beds = total_beds - occupied_beds - reserved_beds, and vacating_soon_beds <= occupied_beds, for every hostel');
end $$;

do $$
declare
  v_maintenance_count bigint;
begin
  perform pg_temp.as_role('owner');
  select maintenance_beds into v_maintenance_count from get_hostel_dashboard() where hostel_name = 'Hostel B';
  insert into pg_temp.results(msg) select ok(v_maintenance_count >= 1, 'F2: the seeded maintenance-blocked bed in Hostel B is reflected in the dashboard maintenance_beds count');
end $$;

select msg from pg_temp.results
union all
select * from finish();
rollback;
