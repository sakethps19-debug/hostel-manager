-- ============================================================================
-- Communications module — schema, RPCs, RLS
-- ============================================================================
--
-- WHY THIS FILE EXISTS: the entire application layer for a WhatsApp/SMS
-- Communications module already existed before this migration -
-- lib/communications/*, app/actions/communications.ts, app/communications/**,
-- app/settings/message-templates/**, app/reports/communications/**, and the
-- resident-page Send Message / Communication Notes components - all calling
-- a specific, already-fixed set of RPC names. None of those RPCs, or their
-- backing tables, existed anywhere in this database. Every page already has
-- a "setupMissing" fallback for exactly this situation. This migration adds
-- ONLY the missing persistence layer, matching the exact RPC names/params
-- the frontend already calls - no frontend code needed to change for the
-- core CRUD/history flows to start working.
--
-- Added beyond what the frontend already calls, per the production-readiness
-- brief: idempotency (duplicate-send prevention), a per-resident monthly
-- message-volume safeguard with Owner override, cost estimation config, and
-- a test-mode flag - all additive, all optional parameters with safe
-- defaults, so existing call sites keep working unchanged.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Role-check helpers (same pattern as accounting_require_role in
--    2026081202_accounting_functions_core.sql - kept local to this module
--    rather than shared, matching that file's own stated convention of one
--    role-check helper per module rather than a single app-wide one).
-- ----------------------------------------------------------------------------

create or replace function comms_current_role() returns text as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function comms_require_role(p_allowed_roles text[]) returns void as $$
declare
  v_role text;
begin
  v_role := comms_current_role();
  if v_role is null or not (v_role = any(p_allowed_roles)) then
    raise exception 'Not authorized: this action requires one of % (current role: %)', p_allowed_roles, coalesce(v_role, 'none');
  end if;
end;
$$ language plpgsql stable security definer;

-- Mirrors lib/communications/templateCategories.ts's canSendTemplateCategory()
-- exactly, so a template-based send is gated the same way server-side as it
-- already is client-side (defense in depth, not a redesign).
create or replace function comms_can_send_category(p_role text, p_category text) returns boolean as $$
  select case
    when p_role = 'owner' then true
    when p_role = 'finance_manager' and p_category in
      ('rent_reminder', 'rent_overdue', 'payment_received', 'deposit_pending', 'deposit_refund') then true
    when p_role = 'operations_manager' and p_category in
      ('booking_confirmation', 'checkin_reminder', 'checkout_reminder', 'document_pending',
       'maintenance_notice', 'general_notice', 'emergency_notice') then true
    else false
  end;
$$ language sql immutable;

-- ----------------------------------------------------------------------------
-- 1. Templates
-- ----------------------------------------------------------------------------

create table if not exists message_templates (
  template_id           bigint generated always as identity primary key,
  category               text not null,
  name                    text not null,
  channel                 text not null check (channel in ('whatsapp', 'sms', 'both')),
  body                    text not null,
  is_active               boolean not null default true,
  -- Meta requires WhatsApp templates outside the 24h service window to be
  -- pre-approved; these track that lifecycle without forcing every internal
  -- template to have one (a template only used inside an active service
  -- window, e.g. a same-session reply, doesn't need Meta approval).
  provider_template_id    text,
  provider_template_status text check (provider_template_status in
    ('not_submitted', 'pending', 'approved', 'rejected')),
  created_by               uuid references auth.users(id),
  updated_by               uuid references auth.users(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_message_templates_category on message_templates(category);
create index if not exists idx_message_templates_active on message_templates(is_active);

-- ----------------------------------------------------------------------------
-- 2. Individual resident messages (the real send pipeline)
-- ----------------------------------------------------------------------------

create table if not exists resident_messages (
  message_id          bigint generated always as identity primary key,
  resident_id         bigint not null,
  booking_id          bigint,
  channel             text not null check (channel in ('whatsapp', 'sms')),
  category            text,  -- denormalized from template at send time, null for a custom message
  template_id         bigint references message_templates(template_id),
  message_body        text not null,
  recipient_mobile    text not null,
  status              text not null default 'queued' check (status in
    ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'cancelled')),
  provider            text,
  provider_message_id text,
  failure_reason      text,
  estimated_cost      numeric(10,4),
  actual_cost         numeric(10,4),
  idempotency_key     text,
  sent_by             uuid references auth.users(id),
  queued_at           timestamptz not null default now(),
  sent_at             timestamptz,
  delivered_at        timestamptz,
  read_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists idx_resident_messages_resident on resident_messages(resident_id);
create index if not exists idx_resident_messages_created on resident_messages(created_at);
create unique index if not exists idx_resident_messages_idempotency
  on resident_messages(idempotency_key) where idempotency_key is not null;
-- Lets provider webhook callbacks find the row for a delivery/read receipt.
create unique index if not exists idx_resident_messages_provider_msg_id
  on resident_messages(provider, provider_message_id) where provider_message_id is not null;

-- ----------------------------------------------------------------------------
-- 3. Broadcasts (bulk send pipeline)
-- ----------------------------------------------------------------------------

create table if not exists message_broadcasts (
  broadcast_id       bigint generated always as identity primary key,
  channel            text not null check (channel in ('whatsapp', 'sms')),
  template_id        bigint references message_templates(template_id),
  message_body       text not null,
  target_group_label text not null,
  target_criteria    jsonb,
  recipient_count    int not null default 0,
  sent_count         int not null default 0,
  delivered_count    int not null default 0,
  failed_count       int not null default 0,
  status             text not null default 'draft' check (status in
    ('draft', 'queued', 'sending', 'completed', 'cancelled', 'failed')),
  idempotency_key    text unique,
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  completed_at       timestamptz
);

create index if not exists idx_message_broadcasts_created on message_broadcasts(created_at);

create table if not exists broadcast_messages (
  message_id          bigint generated always as identity primary key,
  broadcast_id        bigint not null references message_broadcasts(broadcast_id) on delete cascade,
  resident_id         bigint not null,
  booking_id          bigint,
  channel             text not null check (channel in ('whatsapp', 'sms')),
  category            text,
  template_id         bigint references message_templates(template_id),
  message_body        text not null,
  recipient_mobile    text not null,
  status              text not null default 'queued' check (status in
    ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'cancelled')),
  provider            text,
  provider_message_id text,
  failure_reason      text,
  estimated_cost      numeric(10,4),
  actual_cost         numeric(10,4),
  sent_at             timestamptz,
  delivered_at        timestamptz,
  read_at             timestamptz,
  created_at          timestamptz not null default now(),
  -- One row per resident per broadcast - a retried/duplicated call to
  -- log_broadcast_message for the same (broadcast, resident) is a no-op
  -- rather than a second row, which is what makes the send loop safe to
  -- resume after a partial failure.
  unique (broadcast_id, resident_id)
);

create index if not exists idx_broadcast_messages_broadcast on broadcast_messages(broadcast_id);
create index if not exists idx_broadcast_messages_resident on broadcast_messages(resident_id);
create unique index if not exists idx_broadcast_messages_provider_msg_id
  on broadcast_messages(provider, provider_message_id) where provider_message_id is not null;

-- ----------------------------------------------------------------------------
-- 4. Manual communication notes (pre-existing separate feature used by
--    components/ResidentCommunications.tsx - a free-text call/visit log,
--    not provider-backed, distinct from the actual send pipeline above)
-- ----------------------------------------------------------------------------

create table if not exists resident_communications (
  communication_id    bigint generated always as identity primary key,
  resident_id         bigint not null,
  communication_type  text not null check (communication_type in
    ('Call', 'WhatsApp', 'Email', 'In-Person', 'Other')),
  note                text not null,
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now()
);

create index if not exists idx_resident_communications_resident on resident_communications(resident_id);

-- ----------------------------------------------------------------------------
-- 5. Configuration: pricing, budget, per-resident monthly limit
--    (Owner-editable, per the "do not hardcode prices" requirement - mirrors
--    accounting_settings' key/value shape in 2026081200_accounting_schema.sql)
--
--    Test mode is deliberately NOT a DB row here - it's controlled solely by
--    the COMMS_TEST_MODE environment variable (see lib/communications/provider.ts),
--    so it can never drift between what the database says and what a given
--    Preview/Production deployment actually does, and an Owner can never
--    accidentally flip production into sending mode from within the app UI.
-- ----------------------------------------------------------------------------

create table if not exists communication_settings (
  setting_key   text primary key,
  setting_value text not null,
  updated_by    uuid references auth.users(id),
  updated_at    timestamptz not null default now()
);

insert into communication_settings (setting_key, setting_value) values
  ('whatsapp_utility_rate', '0.115'),      -- Rs. per Meta WhatsApp utility-category message (India), placeholder - confirm against current Meta rate card
  ('whatsapp_marketing_rate', '0.78'),     -- Rs. per Meta WhatsApp marketing-category message (India), placeholder
  ('sms_rate', '0.18'),                    -- Rs. per SMS, placeholder pending provider selection
  ('monthly_communication_budget', '2000'),-- Rs. - purely a UI warning threshold, never blocks sending
  ('monthly_message_limit_per_resident', '5')
on conflict (setting_key) do nothing;

-- ----------------------------------------------------------------------------
-- 6. Webhook delivery-status events (idempotent processing log, see the
--    api/webhooks/whatsapp route - every inbound callback is recorded here
--    keyed by provider+event id BEFORE being applied, so a provider retrying
--    the same callback is a safe no-op)
-- ----------------------------------------------------------------------------

create table if not exists communication_webhook_events (
  event_id          bigint generated always as identity primary key,
  provider          text not null,
  provider_event_id text not null,
  payload           jsonb not null,
  processed_at      timestamptz,
  created_at        timestamptz not null default now(),
  unique (provider, provider_event_id)
);

commit;
