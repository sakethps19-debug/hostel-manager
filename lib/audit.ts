import { callRpcClient } from "./supabase/callRpcClient";

export async function logAuditEvent(
  action: string,
  entityType: string,
  entityId: number | null,
  details: Record<string, unknown> = {}
) {
  try {
    await callRpcClient("log_audit_event", {
      p_action: action,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_details: details,
    });
  } catch {
    // Best-effort - the primary action already succeeded, never block on this.
  }
}
