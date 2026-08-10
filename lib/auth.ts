import { redirect } from "next/navigation";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { hasPermission, Permission } from "@/lib/permissions";

export async function getMyRole(): Promise<string | null> {
  return callRpcServer<string | null>("get_my_role");
}

export async function requirePermission(permission: Permission) {
  const role = await getMyRole();

  if (!hasPermission(role, permission)) {
    redirect("/");
  }
}
