export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

export type AccountRow = {
  account_id: number;
  code: string;
  name: string;
  account_type: AccountType;
  account_subtype: string | null;
  normal_balance: "debit" | "credit";
  parent_account_id: number | null;
  is_contra: boolean;
  is_system: boolean;
  is_active: boolean;
  description: string | null;
};

export type TrialBalanceRow = {
  account_code: string;
  account_name: string;
  account_type: AccountType;
  debit_balance: number;
  credit_balance: number;
};

export type GeneralLedgerRow = {
  journal_entry_line_id: number;
  journal_entry_id: number;
  entry_date: string;
  source_type: string;
  source_id: number | null;
  narration: string;
  memo: string | null;
  debit: number;
  credit: number;
  running_balance: number;
};

export type LedgerPnlRow = {
  account_code: string;
  account_name: string;
  account_type: "income" | "expense";
  amount: number;
};

export type LedgerPnlSummary = {
  total_revenue: number;
  total_expenses: number;
  net_surplus: number;
};

export type BalanceSheetRow = {
  section: "asset" | "liability" | "equity";
  account_code: string;
  account_name: string;
  amount: number;
};

export type CashFlowRow = {
  category: "Operating" | "Investing" | "Financing";
  line_item: string;
  amount: number;
};

export type NetWorthRow = {
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
};

export type BalanceSnapshotRow = {
  snapshot_id: number;
  snapshot_date: string;
  hostel_name: string | null;
  cash_bank: number;
  receivables: number;
  other_current_assets: number;
  net_fixed_assets: number;
  total_assets: number;
  payables: number;
  deposits_held: number;
  other_liabilities: number;
  total_liabilities: number;
  owner_equity: number;
  net_worth: number;
};

export type ReceivableRow = {
  booking_id: number;
  resident_id: number | null;
  hostel_name: string | null;
  outstanding: number;
  last_activity_date: string;
};

export type ReceivableAgeingRow = {
  booking_id: number;
  resident_id: number | null;
  hostel_name: string | null;
  outstanding: number;
  oldest_due_date: string | null;
  days_overdue: number;
  ageing_bucket: "Current" | "0-7 days" | "8-30 days" | "31-60 days" | "60+ days" | "Unknown";
};

export type PayableRow = {
  payable_id: number;
  vendor_id: number | null;
  vendor_name: string;
  hostel_name: string | null;
  category: string;
  invoice_number: string | null;
  invoice_date: string;
  due_date: string;
  amount: number;
  amount_paid: number;
  status: "due" | "partially_paid" | "paid" | "overdue" | "cancelled";
  notes: string | null;
  attachment_path: string | null;
};

export type PayableAgeingRow = {
  payable_id: number;
  vendor_id: number | null;
  vendor_name: string;
  hostel_name: string | null;
  invoice_number: string | null;
  due_date: string;
  outstanding: number;
  ageing_bucket: "Not Yet Due" | "0-7 overdue" | "8-30" | "31-60" | "60+";
};

export type ForecastRow = {
  period_year: number;
  period_month: number;
  expected_amount: number;
};

export type CashForecastRow = {
  period_year: number;
  period_month: number;
  opening_cash: number;
  expected_inflow: number;
  expected_outflow: number;
  projected_closing_cash: number;
};

export type WorkingCapitalRow = {
  current_assets: number;
  current_liabilities: number;
  working_capital: number;
  accounts_receivable: number;
  accounts_payable: number;
  cash: number;
  deposits_held: number;
  other_current_liabilities: number;
};

export type ReconciliationFlagRow = {
  flag_id: number;
  flag_type: string;
  description: string;
  related_source_type: string | null;
  related_source_id: number | null;
  amount_variance: number | null;
  detected_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
};

export type AssetCategoryRow = {
  category_id: number;
  name: string;
  code_prefix: string;
  default_gl_account_id: number | null;
  default_useful_life_months: number | null;
  default_depreciation_method: "straight_line" | "none";
  default_residual_pct: number;
  is_active: boolean;
};
