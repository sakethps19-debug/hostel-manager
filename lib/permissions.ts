export type Role = "owner" | "operations_manager" | "finance_manager";

const PERMISSIONS = {
  manageBookings: ["owner", "operations_manager"],
  manageResidents: ["owner", "operations_manager"],
  manageMaintenance: ["owner", "operations_manager"],
  // Asset Register serves both operational (condition/location) and finance
  // (cost/depreciation) needs - finance_manager couldn't reach the page at
  // all before this, since it was gated behind manageMaintenance only.
  viewAssetRegister: ["owner", "operations_manager", "finance_manager"],
  manageOperationalRecords: ["owner", "operations_manager"],
  manageDocuments: ["owner", "operations_manager"],
  managePayments: ["owner", "finance_manager"],
  manageExpenses: ["owner", "finance_manager"],
  viewFinancialReports: ["owner", "finance_manager"],
  viewAuditLog: ["owner"],
  manageUsers: ["owner"],
  manageRates: ["owner"],
  sendOperationalMessages: ["owner", "operations_manager"],
  sendFinanceMessages: ["owner", "finance_manager"],
  manageMessageTemplates: ["owner"],
  manageChartOfAccounts: ["owner"],
  manageAccountingPeriod: ["owner"],
  manageOpeningBalances: ["owner"],
  manageJournalEntries: ["owner", "finance_manager"],
  manageAssetFinance: ["owner", "finance_manager"],
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
