-- ============================================================================
-- Orphaned function overload cleanup.
--
-- The original record_payment(8 args, no idempotency key) was never
-- actually replaced when the idempotency-key parameter was added -
-- CREATE OR REPLACE with a different parameter COUNT creates a new
-- overload in Postgres rather than replacing the existing function, since
-- overload identity is based on declared parameter types, not defaults.
-- The stale 8-arg version stayed callable via direct RPC the whole time,
-- with none of the idempotency protection or atomic journal-posting fix
-- applied to the 9-arg version everything else in the app now calls.
-- Drop it - nothing in the app calls the 8-arg form.
--
-- Verified: add_asset and record_expense's own signature changes earlier
-- in this sprint each used an explicit `drop function if exists <old
-- signature>` before recreating with a different parameter count, so
-- neither left a similar orphan (confirmed live - one overload each).
-- ============================================================================
begin;

drop function if exists public.record_payment(bigint, numeric, date, date, text, text, text, text);

commit;
