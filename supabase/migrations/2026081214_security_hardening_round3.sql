-- ============================================================================
-- Security hardening, round 3
-- ============================================================================
--
-- Found while manually reconciling a stale, pre-existing communications
-- schema against the new one in 2026081210-2026081213 (see deployment
-- notes): two functions unrelated to any table this session created -
-- get_resident_communication_preferences / update_resident_communication_preferences,
-- operating on whatsapp_allowed/sms_allowed/communication_opt_out/preferred_channel
-- columns already on the pre-existing `residents` table - were never wired
-- to any frontend code (confirmed via full-repo search) and had effectively
-- no authorization:
--   - get_resident_communication_preferences had NO role check at all.
--   - update_resident_communication_preferences only checked that
--     get_my_role() IS NOT NULL - satisfied by any authenticated user with
--     ANY role, not a real permission check.
-- Both are re-declared here with the SAME shape, gated to manageResidents'
-- role set (owner, operations_manager) - matching the app's convention that
-- resident contact/document-level data is not finance_manager-accessible
-- merely because Communications/finance features exist elsewhere.
--
-- Also drops two stale duplicate function overloads left over from the same
-- older, abandoned communications schema (integer-typed resident_id, never
-- called by any current frontend code, superseded by the bigint-typed
-- versions in 2026081211): add_resident_communication(integer, text, text)
-- and get_resident_communications(integer).
-- ============================================================================

begin;

drop function if exists add_resident_communication(integer, text, text);
drop function if exists get_resident_communications(integer);

create or replace function get_resident_communication_preferences(p_resident_id bigint)
returns table(
  whatsapp_allowed boolean, sms_allowed boolean,
  communication_opt_out boolean, preferred_channel text
) as $$
begin
  if (select get_my_role()) not in ('owner', 'operations_manager') then
    raise exception 'Permission denied.';
  end if;

  return query
    select whatsapp_allowed, sms_allowed, communication_opt_out, preferred_channel
    from residents
    where id = p_resident_id;
end;
$$ language plpgsql stable security definer;

create or replace function update_resident_communication_preferences(
  p_resident_id bigint, p_whatsapp_allowed boolean, p_sms_allowed boolean,
  p_communication_opt_out boolean, p_preferred_channel text
) returns void as $$
begin
  if (select get_my_role()) not in ('owner', 'operations_manager') then
    raise exception 'Permission denied.';
  end if;

  update residents
  set whatsapp_allowed = p_whatsapp_allowed,
      sms_allowed = p_sms_allowed,
      communication_opt_out = p_communication_opt_out,
      preferred_channel = p_preferred_channel
  where id = p_resident_id;
end;
$$ language plpgsql security definer;

commit;
