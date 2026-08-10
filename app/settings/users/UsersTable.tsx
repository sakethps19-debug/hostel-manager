"use client";

import { useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";
import { roleLabel } from "@/lib/permissions";

type UserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  last_sign_in_at: string | null;
};

const ROLES = ["owner", "operations_manager", "finance_manager"];

function formatDateTime(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function UsersTable({ users }: { users: UserRow[] }) {
  const [rows, setRows] = useState(users);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleRoleChange(userId: string, role: string) {
    setErrorMessage("");
    setBusyId(userId);

    try {
      await callRpcClient("admin_set_user_role", {
        p_user_id: userId,
        p_role: role,
      });

      await logAuditEvent("user_role_changed", "profile", null, {
        user_id: userId,
        role,
      });

      setRows((prev) =>
        prev.map((r) => (r.id === userId ? { ...r, role } : r))
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to change role."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleActiveToggle(userId: string, isActive: boolean) {
    setErrorMessage("");
    setBusyId(userId);

    try {
      await callRpcClient("admin_set_user_active", {
        p_user_id: userId,
        p_is_active: isActive,
      });

      await logAuditEvent(
        isActive ? "user_reactivated" : "user_deactivated",
        "profile",
        null,
        { user_id: userId }
      );

      setRows((prev) =>
        prev.map((r) => (r.id === userId ? { ...r, is_active: isActive } : r))
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update status."
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mt-8">
      {errorMessage && (
        <p className="mb-3 text-sm font-medium text-red-600">
          {errorMessage}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last Sign-in</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold">
                  {user.full_name || "-"}
                </td>
                <td className="px-4 py-3">{user.email || "-"}</td>
                <td className="px-4 py-3">
                  <select
                    value={user.role}
                    disabled={busyId === user.id}
                    onChange={(e) =>
                      handleRoleChange(user.id, e.target.value)
                    }
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      user.is_active
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {user.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                  {formatDateTime(user.last_sign_in_at)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                  {formatDateTime(user.created_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() =>
                      handleActiveToggle(user.id, !user.is_active)
                    }
                    disabled={busyId === user.id}
                    className={`rounded-lg border px-4 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                      user.is_active
                        ? "border-red-200 text-red-600 hover:bg-red-50"
                        : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    }`}
                  >
                    {user.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
