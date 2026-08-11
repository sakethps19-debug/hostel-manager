import { hasPermission } from "@/lib/permissions";

export const TEMPLATE_CATEGORIES = [
  "rent_reminder",
  "rent_overdue",
  "payment_received",
  "booking_confirmation",
  "checkin_reminder",
  "checkout_reminder",
  "deposit_pending",
  "deposit_refund",
  "document_pending",
  "maintenance_notice",
  "general_notice",
  "emergency_notice",
  "custom",
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  rent_reminder: "Rent Reminder",
  rent_overdue: "Rent Overdue",
  payment_received: "Payment Received",
  booking_confirmation: "Booking Confirmation",
  checkin_reminder: "Check-in Reminder",
  checkout_reminder: "Check-out Reminder",
  deposit_pending: "Deposit Pending",
  deposit_refund: "Deposit Refund",
  document_pending: "Document Pending",
  maintenance_notice: "Maintenance Notice",
  general_notice: "General Notice",
  emergency_notice: "Emergency Notice",
  custom: "Custom",
};

// Finance Manager sends finance-related communication only; Operations
// Manager sends operational communication only - neither role gets
// unrelated categories merely because messaging exists. Owner always has
// every category via manageMessageTemplates/full access below.
const FINANCE_CATEGORIES: readonly TemplateCategory[] = [
  "rent_reminder",
  "rent_overdue",
  "payment_received",
  "deposit_pending",
  "deposit_refund",
];

const OPERATIONAL_CATEGORIES: readonly TemplateCategory[] = [
  "booking_confirmation",
  "checkin_reminder",
  "checkout_reminder",
  "document_pending",
  "maintenance_notice",
  "general_notice",
  "emergency_notice",
];

export function canSendTemplateCategory(
  role: string | null,
  category: string
): boolean {
  if (hasPermission(role, "manageMessageTemplates")) return true;
  if (
    hasPermission(role, "sendFinanceMessages") &&
    FINANCE_CATEGORIES.includes(category as TemplateCategory)
  ) {
    return true;
  }
  if (
    hasPermission(role, "sendOperationalMessages") &&
    OPERATIONAL_CATEGORIES.includes(category as TemplateCategory)
  ) {
    return true;
  }
  return false;
}
