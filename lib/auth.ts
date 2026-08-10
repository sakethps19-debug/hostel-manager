import { redirect } from "next/navigation";
import { callRpcServer } from "@/lib/supabase/callRpcServer";

export async function getMyRole(): Promise<string | null> {
  return callRpcServer<string | null>("get_my_role");
}

export async function requireRole(allowedRoles: string[]) {
  const role = await getMyRole();

  if (!role || !allowedRoles.includes(role)) {
    redirect("/");
  }
}
