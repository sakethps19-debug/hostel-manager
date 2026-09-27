-- apply_whatsapp_delivery_status and record_communication_webhook_event are
-- called only from app/api/webhooks/whatsapp/route.ts, an unauthenticated
-- Meta webhook endpoint (auth is HMAC-signature based, not a Supabase
-- session) - there is no legitimate authenticated UI caller for either.
-- Both were still authenticated-executable with no role check, so any
-- logged-in owner/operations_manager/finance_manager could forge a
-- delivery-status update or a webhook-event record via direct RPC call.
-- Since anon was already revoked from these in an earlier lockdown, and the
-- only real caller is meant to be the service role, tighten EXECUTE to
-- service_role only rather than adding a role guard nothing legitimate
-- would ever satisfy.
begin;

revoke execute on function public.apply_whatsapp_delivery_status(text, text, timestamptz) from authenticated;
revoke execute on function public.record_communication_webhook_event(text, text, jsonb) from authenticated;

commit;
