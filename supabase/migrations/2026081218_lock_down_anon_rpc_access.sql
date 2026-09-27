-- ============================================================================
-- Security remediation found during a full-app audit:
--
-- 1. 90 SECURITY DEFINER functions had no explicit search_path set, a known
--    privilege-escalation vector (a caller able to create objects earlier in
--    the search_path could shadow a table/function reference and get code
--    executed with the definer's elevated privileges). Pinned search_path
--    on all of them.
--
-- 2. Postgres grants EXECUTE to the implicit PUBLIC pseudo-role on function
--    creation by default, and every role (including anon) is implicitly a
--    member of PUBLIC. This meant anyone holding the public Supabase anon
--    key - no login at all - could call any business-logic RPC directly,
--    including accounting_post_entry (writes arbitrary journal entries to
--    the real accounting ledger with zero validation) and
--    get_resident_master_list (full resident PII + financial ledger data).
--    Revoked EXECUTE from PUBLIC across the schema, re-granted explicitly to
--    authenticated/service_role (verified this doesn't break the app - every
--    real call already runs as `authenticated` via a logged-in session), and
--    set default privileges so future functions don't inherit the PUBLIC
--    grant either.
--
-- 3. accounting_post_entry is a raw, unvalidated ledger-writing primitive
--    meant to be called only internally by already-guarded wrapper functions
--    (post_payment_journal, post_expense_journal, etc). Those wrappers are
--    themselves SECURITY DEFINER owned by `postgres`, so revoking
--    `authenticated`'s direct EXECUTE here doesn't affect their ability to
--    call it (a function owner's own calls are never blocked by GRANT/REVOKE).
-- ============================================================================
begin;

do $do$
declare
  r record;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef = true
      and (p.proconfig is null or not exists (
        select 1 from unnest(p.proconfig) c where c like 'search_path=%'
      ))
  loop
    execute format('alter function public.%I(%s) set search_path = ''public''', r.proname, r.args);
  end loop;
end
$do$;

revoke execute on all functions in schema public from public;
grant execute on all functions in schema public to authenticated, service_role;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public grant execute on functions to authenticated, service_role;

revoke execute on function accounting_post_entry(date, text, text, bigint, text, jsonb, uuid) from authenticated;

commit;
