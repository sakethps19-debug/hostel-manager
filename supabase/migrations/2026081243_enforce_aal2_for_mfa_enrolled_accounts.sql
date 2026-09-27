-- ============================================================================
-- MFA/AAL: direct RPC calls did not respect authentication level.
--
-- The app's only AAL enforcement was in lib/supabase/proxy.ts (Next.js
-- middleware), which redirects a page navigation to /mfa-challenge when
-- the session is aal1 but a verified TOTP factor exists (nextLevel would
-- be aal2). That is a PAGE-ROUTING guard only - a request made directly
-- against the Supabase REST/RPC endpoint (e.g. from the browser console,
-- or a stolen aal1 session token captured right after password login but
-- before the TOTP step) never passes through that middleware at all, and
-- every RPC's own role check (require_role/accounting_require_role/
-- comms_require_role) only ever verified profiles.role, never the
-- session's AAL. Once an account enrolls MFA, an aal1-only session for
-- that same account could still call any RPC it's otherwise permitted for
-- by role, fully bypassing the second factor.
--
-- No account is currently enrolled (confirmed live: 0 rows in
-- auth.mfa_factors), so this has zero effect on anyone today - it closes
-- the gap before the first account enrolls, per the explicit requirement
-- that this be safe and not force AAL2 on anyone who hasn't opted in.
--
-- assert_aal2_if_enrolled() is a no-op for an account with no verified MFA
-- factor; only once an account has completed enrollment does it require
-- the session's aal claim to be 'aal2' for any require_role/
-- accounting_require_role/comms_require_role-gated action.
--
-- Verified live via rolled-back transactions: an aal1 session for an
-- account with a (temporarily inserted, rolled back) verified TOTP factor
-- is rejected by require_role with "two-factor authentication enabled -
-- complete the verification step"; the same account at aal2 passes
-- normally; and a real account with no factor at aal1 (today's actual
-- state for every account) is unaffected.
-- ============================================================================
begin;

create or replace function assert_aal2_if_enrolled()
returns void language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_has_verified_factor boolean;
begin
  select exists(
    select 1 from auth.mfa_factors
     where user_id = auth.uid() and status = 'verified'
  ) into v_has_verified_factor;

  if v_has_verified_factor and coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then
    raise exception 'This account has two-factor authentication enabled - complete the verification step before performing this action.' using errcode = '42501';
  end if;
end;
$$;

create or replace function require_role(allowed_roles text[])
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_role text;
begin
  v_role := get_my_role();
  if v_role is null or not (v_role = any(allowed_roles)) then
    raise exception 'Insufficient permissions for this action.' using errcode = '42501';
  end if;
  perform assert_aal2_if_enrolled();
end;
$$;

create or replace function accounting_require_role(p_allowed_roles text[])
returns void language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_role text;
begin
  v_role := accounting_current_role();
  if v_role is null or not (v_role = any(p_allowed_roles)) then
    raise exception 'Not authorized: this action requires one of % (current role: %)', p_allowed_roles, coalesce(v_role, 'none');
  end if;
  perform assert_aal2_if_enrolled();
end;
$$;

create or replace function comms_require_role(p_allowed_roles text[])
returns void language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_role text;
begin
  v_role := comms_current_role();
  if v_role is null or not (v_role = any(p_allowed_roles)) then
    raise exception 'Not authorized: this action requires one of % (current role: %)', p_allowed_roles, coalesce(v_role, 'none');
  end if;
  perform assert_aal2_if_enrolled();
end;
$$;

commit;
