-- ============================================================================
-- Communications module — Row Level Security
-- ============================================================================
--
-- Same design as 2026081205_accounting_rls.sql: every write to these tables
-- goes through a SECURITY DEFINER function (2026081211), each of which
-- already calls comms_require_role()/comms_check_send_allowed() itself - so
-- RLS here only needs to gate direct SELECT access (defense in depth against
-- a client calling PostgREST directly instead of an RPC) and explicitly
-- deny INSERT/UPDATE/DELETE for everyone, since only the SECURITY DEFINER
-- functions above are a supported write path.
-- ============================================================================

begin;

alter table message_templates enable row level security;
alter table resident_messages enable row level security;
alter table message_broadcasts enable row level security;
alter table broadcast_messages enable row level security;
alter table resident_communications enable row level security;
alter table communication_settings enable row level security;
alter table communication_webhook_events enable row level security;

do $$
declare
  v_table text;
  v_comms_tables text[] := array[
    'message_templates', 'resident_messages', 'message_broadcasts',
    'broadcast_messages', 'resident_communications'
  ];
begin
  foreach v_table in array v_comms_tables loop
    execute format(
      'drop policy if exists comms_read on %I; create policy comms_read on %I for select using (comms_current_role() in (''owner'',''operations_manager'',''finance_manager''));',
      v_table, v_table
    );
  end loop;
end;
$$;

-- Owner-only: pricing, budget, and per-resident message-limit configuration.
drop policy if exists comms_settings_read on communication_settings;
create policy comms_settings_read on communication_settings
  for select using (comms_current_role() = 'owner');

-- No read policy on communication_webhook_events for any client role - it's
-- an internal idempotency/audit log for the webhook route only, never
-- rendered in the UI, and it may contain raw provider payloads.

-- No direct INSERT/UPDATE/DELETE policies anywhere above: every write goes
-- through the SECURITY DEFINER functions in 2026081211_communications_functions.sql.

commit;
