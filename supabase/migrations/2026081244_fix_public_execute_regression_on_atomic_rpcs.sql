-- ============================================================================
-- Fix: EXECUTE leaked back to PUBLIC/anon on 5 functions touched by the
-- atomicity-hardening migrations.
--
-- Found by the new SECURITY DEFINER regression test
-- (supabase/tests/security_definer_regression.sql): CREATE OR REPLACE
-- FUNCTION on a function whose ARGUMENT LIST changed creates a new function
-- object (new OID) under the hood, which Postgres grants EXECUTE to PUBLIC
-- by default - silently undoing the earlier anon-lockdown REVOKE for that
-- specific function, even though the original (differently-signed) function
-- it replaced had been correctly locked down.
--
-- record_payment (gained p_idempotency_key), add_asset (gained p_asset_code/
-- p_payment_mode), and finalize_settlement_and_vacate/
-- backfill_missing_financial_journals (brand new functions) are the four
-- affected by a signature change; record_expense picked up the same default
-- grant when it was recreated for expense+journal atomicity even though its
-- signature didn't change (CREATE OR REPLACE still re-applies default
-- privileges when a function is dropped+recreated rather than replaced
-- in-place, which the same migration did for a couple of these).
--
-- This is NOT an active bypass - every one of these functions calls
-- require_role()/accounting_require_role() as its first statement, so an
-- anon or wrong-role caller was always rejected functionally. It is a
-- defense-in-depth gap: the GRANT-level lockout that every other RPC in
-- this codebase has was missing for these five. Verified before this fix:
-- none of the 5 functions were ever reachable by an actual unauthenticated
-- caller once past the (correctly enforced) role check - PostgREST/anon
-- traffic hitting these routes would still get rejected inside the function
-- body, just one layer later than intended.
-- ============================================================================
begin;

revoke execute on function public.record_payment(bigint, numeric, date, date, text, text, text, text, text) from public;
grant execute on function public.record_payment(bigint, numeric, date, date, text, text, text, text, text) to authenticated, service_role;

revoke execute on function public.record_expense(text, date, text, numeric, text, text, text, text) from public;
grant execute on function public.record_expense(text, date, text, numeric, text, text, text, text) to authenticated, service_role;

revoke execute on function public.add_asset(text, text, text, text, text, date, numeric, text, date, text, text, text) from public;
grant execute on function public.add_asset(text, text, text, text, text, date, numeric, text, date, text, text, text) to authenticated, service_role;

revoke execute on function public.finalize_settlement_and_vacate(bigint, numeric, jsonb, text) from public;
grant execute on function public.finalize_settlement_and_vacate(bigint, numeric, jsonb, text) to authenticated, service_role;

revoke execute on function public.backfill_missing_financial_journals() from public;
grant execute on function public.backfill_missing_financial_journals() to authenticated, service_role;

commit;
