-- ============================================================================
-- Authorization regression matrix
-- ============================================================================
-- Data-driven: add a row to v_matrix to cover a new/changed RPC instead of
-- writing a bespoke test. Each row calls the RPC with placeholder args (the
-- role guard is the first statement in every hardened function, so it fires
-- before any argument is actually used) as four simulated callers -
-- unauthenticated (anon), owner, operations_manager, finance_manager - and
-- asserts the AUTHORIZATION outcome matches the expected allow-list.
--
-- Placeholder IDs (booking_id=0 etc.) never exist, so a call that clears the
-- authorization check will still usually raise a *business-logic* exception
-- ("Booking 0 not found"). That is NOT an authorization failure - try_call()
-- classifies only the recognized authorization-rejection shapes
-- ("not authoriz...", "permission denied for function...", "insufficient
-- permission...", the AAL/two-factor message, or SQLSTATE 42501) as
-- "rejected"; any other outcome (success OR a business-logic exception)
-- counts as "authorization passed", which is exactly what this matrix means
-- to measure.
--
-- Run with: psql "$DATABASE_URL" -f supabase/tests/authorization_matrix.sql
-- Wrapped in begin/rollback - safe to run anywhere, including production,
-- though it inserts (and rolls back) 3 synthetic auth.users/profiles rows,
-- so prefer running it against TEST/UAT.
-- ============================================================================
begin;
select plan(1);

create or replace function pg_temp.call_outcome(p_sql text)
returns text language plpgsql as $$
declare
  v_state text;
  v_message text;
begin
  execute p_sql;
  return 'passed';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
  if v_state = '42501'
     or v_message ~* 'not authoriz'
     or v_message ~* 'permission denied for function'
     or v_message ~* 'insufficient permission'
     or v_message ~* 'two-factor authentication'
  then
    return 'rejected';
  else
    return 'passed'; -- reached the business logic; a data-validation error is not an authorization rejection
  end if;
end;
$$;

create or replace function pg_temp.as_role(p_authenticated boolean, p_user_id uuid)
returns void language plpgsql as $$
begin
  if not p_authenticated then
    perform set_config('request.jwt.claims', '', true);
    execute 'set role anon';
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
    execute 'set role authenticated';
  end if;
end;
$$;

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_ops uuid := gen_random_uuid();
  v_finance uuid := gen_random_uuid();
  -- "passed"/"rejected" express the expected AUTHORIZATION outcome, not
  -- whether the call would fully succeed against real data.
  v_matrix jsonb := '[
    {"fn": "select require_role(array[''owner''])", "owner": "passed", "ops": "rejected", "finance": "rejected", "anon": "rejected", "label": "require_role(owner-only) sample"},
    {"fn": "select create_booking(0,''X'',''1234567890'',null,null,''Other'',''1'',null,null,null,current_date,current_date,0,0)", "owner": "passed", "ops": "passed", "finance": "rejected", "anon": "rejected", "label": "create_booking"},
    {"fn": "select cancel_booking(0)", "owner": "passed", "ops": "passed", "finance": "rejected", "anon": "rejected", "label": "cancel_booking"},
    {"fn": "select give_notice(0, current_date, null)", "owner": "passed", "ops": "passed", "finance": "rejected", "anon": "rejected", "label": "give_notice"},
    {"fn": "select vacate_bed(0)", "owner": "passed", "ops": "passed", "finance": "rejected", "anon": "rejected", "label": "vacate_bed"},
    {"fn": "select finalize_settlement_and_vacate(0,0,null,null)", "owner": "passed", "ops": "passed", "finance": "rejected", "anon": "rejected", "label": "finalize_settlement_and_vacate"},
    {"fn": "select revise_rent(0,0,current_date,null,null)", "owner": "passed", "ops": "passed", "finance": "rejected", "anon": "rejected", "label": "revise_rent"},
    {"fn": "select transfer_resident(0,0,current_date,null,null)", "owner": "passed", "ops": "passed", "finance": "rejected", "anon": "rejected", "label": "transfer_resident"},
    {"fn": "select record_payment(0,0,current_date,null,''Monthly Rent'',''Cash'',null,null,null)", "owner": "passed", "ops": "rejected", "finance": "passed", "anon": "rejected", "label": "record_payment"},
    {"fn": "select reverse_payment(0,null)", "owner": "passed", "ops": "rejected", "finance": "passed", "anon": "rejected", "label": "reverse_payment"},
    {"fn": "select record_expense(null,current_date,''Other'',0,null,''Cash'',null,null)", "owner": "passed", "ops": "rejected", "finance": "passed", "anon": "rejected", "label": "record_expense"},
    {"fn": "select add_asset(''X'',''Other'')", "owner": "passed", "ops": "passed", "finance": "passed", "anon": "rejected", "label": "add_asset"},
    {"fn": "select accounting_reverse_entry(0)", "owner": "passed", "ops": "rejected", "finance": "passed", "anon": "rejected", "label": "accounting_reverse_entry"},
    {"fn": "select close_month(1,2000,null)", "owner": "passed", "ops": "rejected", "finance": "rejected", "anon": "rejected", "label": "close_month (owner-only)"},
    {"fn": "select reopen_month(1,2000)", "owner": "passed", "ops": "rejected", "finance": "rejected", "anon": "rejected", "label": "reopen_month (owner-only)"},
    {"fn": "select admin_set_user_role(gen_random_uuid(),''owner'')", "owner": "passed", "ops": "rejected", "finance": "rejected", "anon": "rejected", "label": "admin_set_user_role (owner-only)"},
    {"fn": "select admin_list_users()", "owner": "passed", "ops": "rejected", "finance": "rejected", "anon": "rejected", "label": "admin_list_users (owner-only)"},
    {"fn": "select create_complaint()", "owner": "passed", "ops": "passed", "finance": "rejected", "anon": "rejected", "label": "create_complaint"},
    {"fn": "select create_enquiry(''X'',''1234567890'')", "owner": "passed", "ops": "passed", "finance": "rejected", "anon": "rejected", "label": "create_enquiry"},
    {"fn": "select create_waitlist_entry(''X'',''1234567890'')", "owner": "passed", "ops": "passed", "finance": "rejected", "anon": "rejected", "label": "create_waitlist_entry"},
    {"fn": "select add_vendor(''X'',''Other'',null,null,null,null,null,null)", "owner": "passed", "ops": "rejected", "finance": "passed", "anon": "rejected", "label": "add_vendor"},
    {"fn": "select add_payable(null,''X'',null,''Other'',null,current_date,current_date,1,null,null)", "owner": "passed", "ops": "rejected", "finance": "passed", "anon": "rejected", "label": "add_payable"},
    {"fn": "select get_trial_balance(current_date,current_date)", "owner": "passed", "ops": "passed", "finance": "passed", "anon": "passed", "label": "get_trial_balance (RLS-enforced, not SECURITY DEFINER - see note)"},
    {"fn": "select get_balance_sheet(current_date)", "owner": "passed", "ops": "passed", "finance": "passed", "anon": "passed", "label": "get_balance_sheet (RLS-enforced, not SECURITY DEFINER - see note)"},
    {"fn": "select get_hostel_pnl(1,2000)", "owner": "passed", "ops": "rejected", "finance": "passed", "anon": "rejected", "label": "get_hostel_pnl"},
    {"fn": "select create_message_broadcast(''whatsapp'',null,''X'',''X'',0)", "owner": "passed", "ops": "passed", "finance": "passed", "anon": "rejected", "label": "create_message_broadcast"},
    {"fn": "select create_message_template(''general_notice'',''X'',''whatsapp'',''X'')", "owner": "passed", "ops": "rejected", "finance": "rejected", "anon": "rejected", "label": "create_message_template (owner-only)"},
    {"fn": "select get_my_role()", "owner": "passed", "ops": "passed", "finance": "passed", "anon": "passed", "label": "get_my_role (no guard by design - self role lookup)"},
    {"fn": "select apply_whatsapp_delivery_status(''x'',''sent'',now())", "owner": "rejected", "ops": "rejected", "finance": "rejected", "anon": "rejected", "label": "apply_whatsapp_delivery_status (service_role/webhook-only, nobody via RPC)"},
    {"fn": "select record_communication_webhook_event(''meta'',''x'',''{}''::jsonb)", "owner": "rejected", "ops": "rejected", "finance": "rejected", "anon": "rejected", "label": "record_communication_webhook_event (service_role/webhook-only, nobody via RPC)"}
  ]'::jsonb;
  v_row jsonb;
  v_which text;
  v_expected text;
  v_actual text;
  v_fail_count int := 0;
  v_total int := 0;
  v_mismatches text := '';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  values
    ('00000000-0000-0000-0000-000000000000', v_owner, 'authenticated', 'authenticated', 'test-owner@example.invalid', '', now(), now(), now(), '{}', '{}', false, '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_ops, 'authenticated', 'authenticated', 'test-ops@example.invalid', '', now(), now(), now(), '{}', '{}', false, '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_finance, 'authenticated', 'authenticated', 'test-finance@example.invalid', '', now(), now(), now(), '{}', '{}', false, '', '', '', '');

  insert into profiles (id, full_name, role, email, is_active)
  values
    (v_owner, 'Test Owner', 'owner', 'test-owner@example.invalid', true),
    (v_ops, 'Test Ops', 'operations_manager', 'test-ops@example.invalid', true),
    (v_finance, 'Test Finance', 'finance_manager', 'test-finance@example.invalid', true)
  on conflict (id) do update set
    role = excluded.role, is_active = excluded.is_active, full_name = excluded.full_name;

  for v_row in select * from jsonb_array_elements(v_matrix)
  loop
    foreach v_which in array array['anon','owner','ops','finance']
    loop
      v_total := v_total + 1;
      perform pg_temp.as_role(
        v_which <> 'anon',
        case v_which when 'owner' then v_owner when 'ops' then v_ops when 'finance' then v_finance else null end
      );
      v_expected := v_row->>v_which;
      v_actual := pg_temp.call_outcome(v_row->>'fn');
      if v_actual <> v_expected then
        v_fail_count := v_fail_count + 1;
        v_mismatches := v_mismatches || format('%s as %s -> expected %s got %s; ', v_row->>'label', v_which, v_expected, v_actual);
      end if;
    end loop;
  end loop;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  if v_fail_count > 0 then
    raise exception '% of % checks mismatched: %', v_fail_count, v_total, v_mismatches;
  end if;
end $$;

select ok(true, 'authorization matrix: all role/RPC combinations matched expectations');

select * from finish();
rollback;
