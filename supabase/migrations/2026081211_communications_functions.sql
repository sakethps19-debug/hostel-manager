-- ============================================================================
-- Communications module — RPC functions
-- ============================================================================
--
-- Every function name/parameter here matches EXACTLY what the existing
-- frontend already calls (app/actions/communications.ts, app/communications/**,
-- app/settings/message-templates/**, components/SendResidentMessageButton.tsx,
-- components/ResidentCommunications.tsx) - traced call-site by call-site
-- before writing this file. New optional parameters (idempotency, override)
-- default to values that preserve today's exact behavior for any caller that
-- doesn't pass them.
--
-- SAFETY DESIGN NOTE ON THE MONTHLY LIMIT / DUPLICATE SENDS ("reserve then
-- finalize"): a standalone pre-flight check function (in a separate RPC/
-- transaction from the insert) cannot actually serialize concurrent sends -
-- a Postgres advisory xact lock is released the moment that RPC's
-- transaction commits, which happens BEFORE the caller's next RPC call even
-- starts. Two overlapping requests (double-click, or a client retry racing
-- a slow-but-succeeding first attempt) can each pass the check before
-- either has recorded anything.
--
-- Instead: reserve_resident_message() / reserve_broadcast_message() do the
-- permission check, category check, AND monthly-limit check (advisory lock
-- included) IN THE SAME TRANSACTION as inserting a 'queued' placeholder row.
-- The caller (app/actions/communications.ts) only calls the provider
-- AFTER a successful reserve, and only when the reserve reports a genuinely
-- NEW row (is_new = true) - a retry that matches an existing row (same
-- idempotency key, or same broadcast_id+resident_id pair already reserved
-- by an earlier attempt) is told is_new = false and the provider is never
-- called again for it. finalize_resident_message() / log_broadcast_message()
-- then update that same row with the real outcome after the provider call
-- completes. This guarantees the provider is invoked at most once per
-- reserved row, even across retries, timeouts, and double-submits.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Templates
-- ----------------------------------------------------------------------------

create or replace function get_message_templates() returns setof message_templates as $$
begin
  perform comms_require_role(array['owner', 'operations_manager', 'finance_manager']);
  return query select * from message_templates order by category, name;
end;
$$ language plpgsql stable security definer;

create or replace function create_message_template(
  p_category text, p_name text, p_channel text, p_body text
) returns bigint as $$
declare
  v_id bigint;
begin
  perform comms_require_role(array['owner']);  -- matches manageMessageTemplates: ["owner"] in lib/permissions.ts
  insert into message_templates (category, name, channel, body, provider_template_status, created_by, updated_by)
  values (p_category, p_name, p_channel, p_body, 'not_submitted', auth.uid(), auth.uid())
  returning template_id into v_id;
  return v_id;
end;
$$ language plpgsql security definer;

create or replace function update_message_template(
  p_template_id bigint, p_name text, p_channel text, p_body text
) returns void as $$
begin
  perform comms_require_role(array['owner']);
  update message_templates
     set name = p_name, channel = p_channel, body = p_body, updated_by = auth.uid(), updated_at = now()
   where template_id = p_template_id;
end;
$$ language plpgsql security definer;

create or replace function set_message_template_active(p_template_id bigint, p_is_active boolean) returns void as $$
begin
  perform comms_require_role(array['owner']);
  update message_templates set is_active = p_is_active, updated_by = auth.uid(), updated_at = now()
   where template_id = p_template_id;
end;
$$ language plpgsql security definer;

-- Records Meta's approval decision for a WhatsApp template - Owner-only,
-- matching template management generally.
create or replace function set_message_template_provider_status(
  p_template_id bigint, p_provider_template_id text, p_provider_template_status text
) returns void as $$
begin
  perform comms_require_role(array['owner']);
  update message_templates
     set provider_template_id = p_provider_template_id,
         provider_template_status = p_provider_template_status,
         updated_by = auth.uid(), updated_at = now()
   where template_id = p_template_id;
end;
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- Cost estimation + monthly volume safeguard
-- ----------------------------------------------------------------------------

create or replace function comms_estimate_cost(p_channel text, p_category text) returns numeric as $$
declare
  v_rate_key text;
  v_rate numeric;
begin
  if p_channel = 'sms' then
    v_rate_key := 'sms_rate';
  elsif p_category = 'general_notice' then
    v_rate_key := 'whatsapp_marketing_rate';  -- broad announcements approximate to Meta's marketing category
  else
    v_rate_key := 'whatsapp_utility_rate';    -- everything else (rent/booking/ops notices) is transactional/utility
  end if;

  select setting_value::numeric into v_rate from communication_settings where setting_key = v_rate_key;
  return coalesce(v_rate, 0);
end;
$$ language plpgsql stable security definer;

comment on function comms_estimate_cost is
  'ESTIMATED cost only, from Owner-configurable rates in communication_settings, '
  'not actual provider billing. See Communications -> Usage & Cost for the '
  'estimated-vs-actual distinction.';

-- Shared monthly-limit check. MUST be called from inside the same
-- transaction as the row insert that it is gating (see reserve_* functions
-- below) - calling it as its own standalone RPC does not close the race,
-- because the advisory lock releases when that RPC's transaction commits,
-- before a caller's next RPC call even begins. Returns boolean rather than
-- raising so callers can decide what to do (raise for individual sends,
-- record a 'cancelled' row for broadcast recipients).
create or replace function comms_monthly_limit_ok(
  p_resident_id bigint, p_category text, p_override boolean, p_role text
) returns boolean as $$
declare
  v_limit int;
  v_count int;
begin
  -- Emergency notices always bypass the volume safeguard - it exists to
  -- catch programming errors and duplicate-reminder loops, not to make a
  -- genuine emergency message impossible to send.
  if p_category = 'emergency_notice' then
    return true;
  end if;

  if p_override then
    if p_role <> 'owner' then
      raise exception 'Only the Owner may override the monthly message limit';
    end if;
    return true;
  end if;

  -- Serializes concurrent limit-checks for the SAME resident. Because this
  -- runs inside the caller's insert transaction (not a separate RPC), the
  -- lock is held until that insert commits, genuinely preventing two
  -- concurrent reservations for the same resident from both reading
  -- "under limit" before either has a row on disk.
  perform pg_advisory_xact_lock(hashtext('comms_monthly_limit:' || p_resident_id));

  select coalesce(setting_value::int, 5) into v_limit
    from communication_settings where setting_key = 'monthly_message_limit_per_resident';

  select count(*) into v_count from (
    select created_at from resident_messages
     where resident_id = p_resident_id and status not in ('failed', 'cancelled')
       and created_at >= date_trunc('month', now())
    union all
    select created_at from broadcast_messages
     where resident_id = p_resident_id and status not in ('failed', 'cancelled')
       and created_at >= date_trunc('month', now())
  ) sent_this_month;

  return v_count < v_limit;
end;
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- Individual resident messages
-- ----------------------------------------------------------------------------

-- Atomically checks permissions + the monthly limit and inserts a 'queued'
-- placeholder row, all in one transaction. The caller must only invoke the
-- provider when is_new = true; when is_new = false the returned row is
-- either an idempotency-key match from an earlier attempt (already
-- resolved, or still 'queued' because a previous finalize step failed - see
-- finalize_resident_message) and must NOT be sent again.
create or replace function reserve_resident_message(
  p_resident_id bigint,
  p_booking_id bigint,
  p_channel text,
  p_template_id bigint,
  p_message_body text,
  p_recipient_mobile text,
  p_override boolean default false,
  p_idempotency_key text default null
) returns table(message_id bigint, is_new boolean, status text) as $$
declare
  v_role text;
  v_category text;
  v_message_id bigint;
  v_status text;
begin
  v_role := comms_current_role();
  if v_role is null or not (v_role = any(array['owner', 'operations_manager', 'finance_manager'])) then
    raise exception 'Not authorized to send communications';
  end if;

  if p_idempotency_key is not null then
    select rm.message_id, rm.status into v_message_id, v_status
      from resident_messages rm where rm.idempotency_key = p_idempotency_key;
    if v_message_id is not null then
      return query select v_message_id, false, v_status;
      return;
    end if;
  end if;

  if p_template_id is not null then
    select category into v_category from message_templates where template_id = p_template_id;
    if v_category is not null and not comms_can_send_category(v_role, v_category) then
      raise exception 'Not authorized to send messages in category %', v_category;
    end if;
  end if;

  if not comms_monthly_limit_ok(p_resident_id, v_category, p_override, v_role) then
    raise exception
      'Monthly message limit reached for this resident. The Owner can override this specific send if it is genuinely needed.';
  end if;

  insert into resident_messages (
    resident_id, booking_id, channel, category, template_id, message_body, recipient_mobile,
    status, idempotency_key, sent_by
  ) values (
    p_resident_id, p_booking_id, p_channel, v_category, p_template_id, p_message_body, p_recipient_mobile,
    'queued', p_idempotency_key, auth.uid()
  )
  returning resident_messages.message_id into v_message_id;

  return query select v_message_id, true, 'queued'::text;
end;
$$ language plpgsql security definer;

-- Called AFTER the provider call completes (success or failure) to record
-- the real outcome on the row reserve_resident_message() created. Failed
-- sends are costed at 0 - no charge is incurred for a message the provider
-- never actually delivered to itself.
create or replace function finalize_resident_message(
  p_message_id bigint,
  p_status text,
  p_provider text,
  p_provider_message_id text,
  p_failure_reason text
) returns void as $$
declare
  v_channel text;
  v_category text;
  v_cost numeric;
begin
  perform comms_require_role(array['owner', 'operations_manager', 'finance_manager']);

  select channel, category into v_channel, v_category
    from resident_messages where message_id = p_message_id;

  v_cost := case when p_status = 'failed' then 0
                 else comms_estimate_cost(v_channel, coalesce(v_category, 'custom')) end;

  update resident_messages
     set status = p_status, provider = p_provider, provider_message_id = p_provider_message_id,
         failure_reason = p_failure_reason, estimated_cost = v_cost,
         sent_at = case when p_status in ('sent', 'delivered', 'read') then now() else sent_at end
   where message_id = p_message_id;
end;
$$ language plpgsql security definer;

create or replace function get_resident_messages(p_resident_id bigint) returns setof resident_messages as $$
begin
  perform comms_require_role(array['owner', 'operations_manager', 'finance_manager']);
  return query select * from resident_messages where resident_id = p_resident_id order by created_at desc;
end;
$$ language plpgsql stable security definer;

-- ----------------------------------------------------------------------------
-- Broadcasts
-- ----------------------------------------------------------------------------

create or replace function create_message_broadcast(
  p_channel text,
  p_template_id bigint,
  p_message_body text,
  p_target_group_label text,
  p_recipient_count int,
  p_idempotency_key text default null,
  p_target_criteria jsonb default null
) returns bigint as $$
declare
  v_broadcast_id bigint;
  v_existing bigint;
begin
  perform comms_require_role(array['owner', 'operations_manager', 'finance_manager']);

  if p_idempotency_key is not null then
    select broadcast_id into v_existing from message_broadcasts where idempotency_key = p_idempotency_key;
    if v_existing is not null then
      return v_existing; -- a resubmitted "Send" click reuses the same broadcast, never creates a second one
    end if;
  end if;

  insert into message_broadcasts (
    channel, template_id, message_body, target_group_label, target_criteria,
    recipient_count, status, idempotency_key, created_by
  ) values (
    p_channel, p_template_id, p_message_body, p_target_group_label, p_target_criteria,
    p_recipient_count, 'sending', p_idempotency_key, auth.uid()
  )
  returning broadcast_id into v_broadcast_id;

  return v_broadcast_id;
end;
$$ language plpgsql security definer;

-- Atomically checks permissions + the monthly limit and inserts a 'queued'
-- placeholder row for one broadcast recipient - the broadcast-level
-- analogue of reserve_resident_message() above. The caller must only invoke
-- the provider when is_new = true. A recipient who fails the category
-- permission check or the monthly limit is inserted directly as 'cancelled'
-- (not raised) so one recipient's cap-out never aborts the rest of the
-- broadcast - matching the existing skippedCount handling already in
-- app/actions/communications.ts.
create or replace function reserve_broadcast_message(
  p_broadcast_id bigint,
  p_resident_id bigint,
  p_booking_id bigint,
  p_channel text,
  p_template_id bigint,
  p_message_body text,
  p_recipient_mobile text,
  p_override boolean default false
) returns table(message_id bigint, is_new boolean) as $$
declare
  v_role text;
  v_category text;
  v_message_id bigint;
begin
  v_role := comms_current_role();
  if v_role is null or not (v_role = any(array['owner', 'operations_manager', 'finance_manager'])) then
    raise exception 'Not authorized to send communications';
  end if;

  -- Already reserved by an earlier attempt at this same broadcast (resumed
  -- after partial failure, or a resubmitted "Send" click) - never reserve
  -- (and therefore never send to) the same recipient twice for one broadcast.
  select bm.message_id into v_message_id
    from broadcast_messages bm
   where bm.broadcast_id = p_broadcast_id and bm.resident_id = p_resident_id;
  if v_message_id is not null then
    return query select v_message_id, false;
    return;
  end if;

  if p_template_id is not null then
    select category into v_category from message_templates where template_id = p_template_id;
  end if;

  if v_category is not null and not comms_can_send_category(v_role, v_category) then
    insert into broadcast_messages (
      broadcast_id, resident_id, booking_id, channel, category, template_id, message_body, recipient_mobile,
      status, failure_reason
    ) values (
      p_broadcast_id, p_resident_id, p_booking_id, p_channel, v_category, p_template_id, p_message_body, p_recipient_mobile,
      'cancelled', format('Not authorized to send messages in category %s', v_category)
    )
    returning broadcast_messages.message_id into v_message_id;
    return query select v_message_id, false;
    return;
  end if;

  if not comms_monthly_limit_ok(p_resident_id, v_category, p_override, v_role) then
    insert into broadcast_messages (
      broadcast_id, resident_id, booking_id, channel, category, template_id, message_body, recipient_mobile,
      status, failure_reason
    ) values (
      p_broadcast_id, p_resident_id, p_booking_id, p_channel, v_category, p_template_id, p_message_body, p_recipient_mobile,
      'cancelled', 'Monthly message limit reached for this resident'
    )
    returning broadcast_messages.message_id into v_message_id;
    return query select v_message_id, false;
    return;
  end if;

  insert into broadcast_messages (
    broadcast_id, resident_id, booking_id, channel, category, template_id, message_body, recipient_mobile,
    status
  ) values (
    p_broadcast_id, p_resident_id, p_booking_id, p_channel, v_category, p_template_id, p_message_body, p_recipient_mobile,
    'queued'
  )
  returning broadcast_messages.message_id into v_message_id;

  return query select v_message_id, true;
end;
$$ language plpgsql security definer;

-- Called AFTER the provider call completes, only for a recipient
-- reserve_broadcast_message() reported as is_new = true. Also usable to
-- resume finalizing a row still stuck in 'queued' from a prior crashed
-- attempt, via ON CONFLICT below. Failed sends are costed at 0.
create or replace function log_broadcast_message(
  p_broadcast_id bigint,
  p_resident_id bigint,
  p_booking_id bigint,
  p_channel text,
  p_template_id bigint,
  p_message_body text,
  p_recipient_mobile text,
  p_status text,
  p_provider text,
  p_provider_message_id text,
  p_failure_reason text
) returns bigint as $$
declare
  v_message_id bigint;
  v_category text;
  v_cost numeric;
begin
  perform comms_require_role(array['owner', 'operations_manager', 'finance_manager']);

  if p_template_id is not null then
    select category into v_category from message_templates where template_id = p_template_id;
  end if;

  v_cost := case when p_status = 'failed' then 0
                 else comms_estimate_cost(p_channel, coalesce(v_category, 'custom')) end;

  -- ON CONFLICT (broadcast_id, resident_id): if a broadcast is resumed/retried
  -- after a partial failure, re-processing the same resident updates their
  -- existing row instead of creating a second one for the same broadcast.
  insert into broadcast_messages (
    broadcast_id, resident_id, booking_id, channel, category, template_id, message_body, recipient_mobile,
    status, provider, provider_message_id, failure_reason, estimated_cost, sent_at
  ) values (
    p_broadcast_id, p_resident_id, p_booking_id, p_channel, v_category, p_template_id, p_message_body, p_recipient_mobile,
    p_status, p_provider, p_provider_message_id, p_failure_reason, v_cost,
    case when p_status in ('sent', 'delivered', 'read') then now() else null end
  )
  on conflict (broadcast_id, resident_id) do update
    set status = excluded.status, provider = excluded.provider, provider_message_id = excluded.provider_message_id,
        failure_reason = excluded.failure_reason, estimated_cost = excluded.estimated_cost, sent_at = excluded.sent_at
  returning message_id into v_message_id;

  return v_message_id;
end;
$$ language plpgsql security definer;

create or replace function update_broadcast_counts(
  p_broadcast_id bigint, p_sent_count int, p_delivered_count int, p_failed_count int, p_status text
) returns void as $$
begin
  perform comms_require_role(array['owner', 'operations_manager', 'finance_manager']);
  update message_broadcasts
     set sent_count = p_sent_count, delivered_count = p_delivered_count, failed_count = p_failed_count,
         status = p_status, completed_at = case when p_status = 'completed' then now() else completed_at end
   where broadcast_id = p_broadcast_id;
end;
$$ language plpgsql security definer;

create or replace function get_message_broadcasts() returns setof message_broadcasts as $$
begin
  perform comms_require_role(array['owner', 'operations_manager', 'finance_manager']);
  return query select * from message_broadcasts order by created_at desc;
end;
$$ language plpgsql stable security definer;

create or replace function get_broadcast_recipients(p_broadcast_id bigint) returns setof broadcast_messages as $$
begin
  perform comms_require_role(array['owner', 'operations_manager', 'finance_manager']);
  return query select * from broadcast_messages where broadcast_id = p_broadcast_id order by created_at;
end;
$$ language plpgsql stable security definer;

-- ----------------------------------------------------------------------------
-- Manual communication notes (pre-existing, separate from the send pipeline)
-- ----------------------------------------------------------------------------

create or replace function add_resident_communication(
  p_resident_id bigint, p_communication_type text, p_note text
) returns bigint as $$
declare
  v_id bigint;
begin
  perform comms_require_role(array['owner', 'operations_manager', 'finance_manager']);
  insert into resident_communications (resident_id, communication_type, note, created_by)
  values (p_resident_id, p_communication_type, p_note, auth.uid())
  returning communication_id into v_id;
  return v_id;
end;
$$ language plpgsql security definer;

create or replace function get_resident_communications(p_resident_id bigint)
returns table(
  communication_id bigint, communication_type text, note text,
  created_by_name text, created_at timestamptz
) as $$
  select c.communication_id, c.communication_type, c.note,
         coalesce(p.full_name, u.email), c.created_at
    from resident_communications c
    left join profiles p on p.id = c.created_by
    left join auth.users u on u.id = c.created_by
   where c.resident_id = p_resident_id
   order by c.created_at desc;
$$ language sql stable security definer;

-- ----------------------------------------------------------------------------
-- Usage & Cost (Part F) - Owner-only configuration + reporting
-- ----------------------------------------------------------------------------

create or replace function get_communication_settings() returns setof communication_settings as $$
begin
  perform comms_require_role(array['owner']);
  return query select * from communication_settings order by setting_key;
end;
$$ language plpgsql stable security definer;

create or replace function set_communication_setting(p_key text, p_value text) returns void as $$
begin
  perform comms_require_role(array['owner']);
  insert into communication_settings (setting_key, setting_value, updated_by, updated_at)
  values (p_key, p_value, auth.uid(), now())
  on conflict (setting_key) do update
    set setting_value = excluded.setting_value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end;
$$ language plpgsql security definer;

create or replace function get_communication_usage_summary(p_period_year int, p_period_month int)
returns table(
  whatsapp_sent int, sms_sent int, utility_count int, marketing_count int,
  failed_count int, estimated_cost numeric, residents_messaged int,
  avg_messages_per_resident numeric
) as $$
declare
  v_start date := make_date(p_period_year, p_period_month, 1);
  v_end date := (v_start + interval '1 month - 1 day')::date;
begin
  perform comms_require_role(array['owner']);

  return query
  with all_messages as (
    select channel, category, status, estimated_cost, resident_id from resident_messages
     where created_at::date between v_start and v_end
    union all
    select channel, category, status, estimated_cost, resident_id from broadcast_messages
     where created_at::date between v_start and v_end
  )
  select
    count(*) filter (where channel = 'whatsapp')::int,
    count(*) filter (where channel = 'sms')::int,
    count(*) filter (where channel = 'whatsapp' and coalesce(category, '') <> 'general_notice')::int,
    count(*) filter (where channel = 'whatsapp' and category = 'general_notice')::int,
    count(*) filter (where status = 'failed')::int,
    -- Excludes 'cancelled' rows (recipients skipped by the monthly-limit
    -- safeguard or a category permission check, never actually attempted)
    -- and 'failed' rows (costed at 0 by finalize_resident_message /
    -- log_broadcast_message) so the Owner-facing total only reflects
    -- messages that were genuinely sent to the provider.
    coalesce(sum(estimated_cost) filter (where status not in ('cancelled', 'failed')), 0),
    count(distinct resident_id)::int,
    case when count(distinct resident_id) > 0
      then round(count(*)::numeric / count(distinct resident_id), 2)
      else 0
    end
  from all_messages;
end;
$$ language plpgsql stable security definer;

-- Residents at/over the configured monthly threshold - flags the exact
-- scenario the safeguard exists to catch (a reminder loop hitting one
-- resident repeatedly), for the Owner's Usage & Cost page.
create or replace function get_residents_exceeding_communication_threshold(p_period_year int, p_period_month int)
returns table(resident_id bigint, message_count int) as $$
declare
  v_start date := make_date(p_period_year, p_period_month, 1);
  v_end date := (v_start + interval '1 month - 1 day')::date;
  v_limit int;
begin
  perform comms_require_role(array['owner']);

  select coalesce(setting_value::int, 5) into v_limit
    from communication_settings where setting_key = 'monthly_message_limit_per_resident';

  return query
  with all_messages as (
    select resident_id from resident_messages
     where created_at::date between v_start and v_end and status not in ('failed', 'cancelled')
    union all
    select resident_id from broadcast_messages
     where created_at::date between v_start and v_end and status not in ('failed', 'cancelled')
  )
  select resident_id, count(*)::int as message_count
    from all_messages
   group by resident_id
  having count(*) >= v_limit
   order by message_count desc;
end;
$$ language plpgsql stable security definer;

-- ----------------------------------------------------------------------------
-- Webhook idempotent recording (called from app/api/webhooks/whatsapp - a
-- server-only route using the same anon/publishable client, since there is
-- no service-role key anywhere in this app; the route validates Meta's
-- signature before ever calling this)
-- ----------------------------------------------------------------------------

create or replace function record_communication_webhook_event(
  p_provider text, p_provider_event_id text, p_payload jsonb
) returns boolean as $$
begin
  insert into communication_webhook_events (provider, provider_event_id, payload)
  values (p_provider, p_provider_event_id, p_payload)
  on conflict (provider, provider_event_id) do nothing;

  return found; -- false means this exact event was already recorded (safe duplicate)
end;
$$ language plpgsql security definer;

comment on function record_communication_webhook_event is
  'Every webhook event is recorded here BEFORE being applied - the unique '
  '(provider, provider_event_id) constraint is what makes replays/duplicate '
  'callbacks safe no-ops rather than double-applying a status update.';

create or replace function apply_whatsapp_delivery_status(
  p_provider_message_id text, p_status text, p_timestamp timestamptz
) returns void as $$
begin
  -- No role check: this is called only from the webhook route, which
  -- authenticates the CALLER (Meta) via HMAC signature verification before
  -- ever reaching this function - see app/api/webhooks/whatsapp/route.ts.
  -- There is no session/profile role to check against a webhook request.
  update resident_messages
     set status = case
           when p_status = 'delivered' and status not in ('read') then 'delivered'
           when p_status = 'read' then 'read'
           when p_status = 'failed' then 'failed'
           else status
         end,
         delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, p_timestamp) else delivered_at end,
         read_at = case when p_status = 'read' then coalesce(read_at, p_timestamp) else read_at end
   where provider_message_id = p_provider_message_id;

  update broadcast_messages
     set status = case
           when p_status = 'delivered' and status not in ('read') then 'delivered'
           when p_status = 'read' then 'read'
           when p_status = 'failed' then 'failed'
           else status
         end,
         delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, p_timestamp) else delivered_at end,
         read_at = case when p_status = 'read' then coalesce(read_at, p_timestamp) else read_at end
   where provider_message_id = p_provider_message_id;
end;
$$ language plpgsql security definer;

-- These two are the only functions in this migration callable with no
-- Supabase session at all: Meta's webhook POST carries no auth cookie, so
-- the calling Postgres role is `anon`, not `authenticated`. The real
-- authorization boundary for these is the HMAC signature check in
-- app/api/webhooks/whatsapp/route.ts BEFORE either is ever called - not a
-- Postgres role check, since there is no session role to check against an
-- unauthenticated webhook request. Scope is deliberately narrow: these can
-- only insert an opaque log row or flip a message's status field matched by
-- an already-Meta-assigned provider_message_id - never read/write anything
-- else, never touch amounts, resident PII, or auth.
grant execute on function record_communication_webhook_event(text, text, jsonb) to anon;
grant execute on function apply_whatsapp_delivery_status(text, text, timestamptz) to anon;

commit;
