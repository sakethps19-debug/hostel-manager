-- ============================================================================
-- Regression guard: every authenticated-callable SECURITY DEFINER function
-- must have a recognized role-authorization check, unless explicitly
-- allow-listed below with a one-line justification.
-- ============================================================================
-- Run with: psql "$DATABASE_URL" -f supabase/tests/security_definer_regression.sql
-- (or paste into the Supabase SQL editor / execute_sql). Read-only - performs
-- no writes, so it is always safe to run directly against any environment,
-- including production.
--
-- This is the same audit query used during the RPC hardening sprint
-- (2026081223-2026081227) to find every function missing a guard, now kept
-- as a permanent regression test: a new SECURITY DEFINER function added
-- later without a role check, and not added to the allow-list below with a
-- reason, will show up in the failing set.
-- ============================================================================
begin;
select plan(2);

-- Allow-list: functions that are SECURITY DEFINER, callable by
-- `authenticated`, and legitimately have no require_role/
-- accounting_require_role/comms_require_role call - each with why.
create temp table allowlisted_unguarded (proname text primary key, reason text) on commit drop;
insert into allowlisted_unguarded (proname, reason) values
  ('accounting_current_role', 'role-lookup primitive itself - reads only the caller''s own profiles row via auth.uid()'),
  ('comms_current_role', 'role-lookup primitive itself - same as above'),
  ('get_my_role', 'role-lookup primitive itself - same as above'),
  ('assert_aal2_if_enrolled', 'the AAL guard primitive - called BY require_role/accounting_require_role/comms_require_role, not itself a role gate'),
  ('handle_new_user', 'trigger function on auth.users insert - never called directly by a client, no role to check yet at signup'),
  ('clear_must_change_password', 'self-service - only ever updates the caller''s own profiles row (auth.uid()), safe for any authenticated user by construction'),
  ('get_resident_communication_preferences', 'guarded inline via (select get_my_role()) not in (...) rather than calling require_role()'),
  ('update_resident_communication_preferences', 'guarded inline via (select get_my_role()) not in (...) rather than calling require_role()'),
  ('set_text_setting', 'guarded inline via (select get_my_role()) <> ''owner'' rather than calling require_role()'),
  ('reserve_broadcast_message', 'guarded inline via comms_current_role() + manual role-array check rather than calling comms_require_role()'),
  ('reserve_resident_message', 'guarded inline via comms_current_role() + manual role-array check rather than calling comms_require_role()');

create temp table unguarded_functions on commit drop as
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
  and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  and not exists (
    select 1 from pg_depend d
     where d.objid = p.oid and d.deptype = 'e' and d.refclassid = 'pg_extension'::regclass
  )
  and pg_get_functiondef(p.oid) !~* '(require_role|accounting_require_role|comms_require_role)\s*\('
  and pg_get_functiondef(p.oid) !~* 'get_my_role\(\)\s*\)?\s*(<>|not in|=)'
  and pg_get_functiondef(p.oid) !~* 'v_role\s*(is null|:=|not in|<>|=)';

select is(
  (select count(*)::int from unguarded_functions uf where not exists (
     select 1 from allowlisted_unguarded al where al.proname = uf.proname
   )),
  0,
  'no new authenticated-callable SECURITY DEFINER function is missing a role guard and missing from the allow-list'
);

-- Second guard: `anon` must have zero EXECUTE on any function that performs
-- a write (insert/update/delete) or calls a mutating RPC - i.e. no
-- application mutation is reachable without authenticating at all.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and not exists (
        select 1 from pg_depend d
         where d.objid = p.oid and d.deptype = 'e' and d.refclassid = 'pg_extension'::regclass
      )
      and pg_get_functiondef(p.oid) ~* '\y(insert into|update |delete from)\y'
      -- webhook intake functions are intentionally anon-callable (the Meta
      -- webhook route has no user session) but their own body never trusts
      -- caller-asserted identity for anything sensitive - covered instead by
      -- the fixed migration 2026081228_lock_down_webhook_only_functions.sql
      and p.proname not in ('apply_whatsapp_delivery_status', 'record_communication_webhook_event')
  ),
  0,
  'anon has no EXECUTE on any function that performs an insert/update/delete, other than the two documented unauthenticated webhook-intake functions'
);

select * from finish();
rollback;
