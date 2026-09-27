-- ============================================================================
-- Full end-to-end audit fixes, batch 2:
-- 1. set_feature_flag had zero role check - any authenticated user of any
--    role could toggle any feature flag, bypassing the owner-only page gate.
-- 2. admin_set_user_role had no guard against demoting/removing the last
--    remaining owner account - with exactly one real Owner today, a single
--    misclick could leave the app with zero accounts able to reach any
--    owner-only page, recoverable only via direct database access.
-- ============================================================================
begin;

create or replace function set_feature_flag(p_key text, p_enabled boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  perform require_role(array['owner']);
  update feature_flags set enabled = p_enabled, updated_at = now() where key = p_key;
end;
$$;

create or replace function admin_set_user_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  perform require_role(array['owner']);

  if p_role not in ('owner','operations_manager','finance_manager') then
    raise exception 'Invalid role: %', p_role;
  end if;

  if p_role <> 'owner' and (select role from profiles where id = p_user_id) = 'owner'
     and (select count(*) from profiles where role = 'owner') <= 1 then
    raise exception 'Cannot change this account''s role - it is the only remaining Owner account';
  end if;

  update profiles set role = p_role, updated_at = now() where id = p_user_id;

  if not found then
    raise exception 'User not found';
  end if;
end;
$$;

commit;
