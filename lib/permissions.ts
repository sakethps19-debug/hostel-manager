export type Role = "owner" | "operations_manager" | "finance_manager";

const PERMISSIONS = {
  manageBookings: ["owner", "operations_manager"],
  manageResidents: ["owner", "operations_manager"],
  manageMaintenance: ["owner", "operations_manager"],
  manageOperationalRecords: ["owner", "operations_manager"],
  manageDocuments: ["owner", "operations_manager"],
  managePayments: ["owner", "finance_manager"],
  manageExpenses: ["owner", "finance_manager"],
  viewFinancialReports: ["owner", "finance_manager"],
  viewAuditLog: ["owner"],
  manageUsers: ["owner"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(
  role: string | null,
  permission: Permission
): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}

export function roleLabel(role: string | null): string {
  if (role === "owner") return "Owner";
  if (role === "operations_manager") return "Operations Manager";
  if (role === "finance_manager") return "Finance Manager";
  return "Unknown";
}
