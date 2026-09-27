import { callRpcServer } from "@/lib/supabase/callRpcServer";
import type {
  AccountRow,
  TrialBalanceRow,
  GeneralLedgerRow,
  LedgerPnlRow,
  LedgerPnlSummary,
  BalanceSheetRow,
  CashFlowRow,
  NetWorthRow,
  BalanceSnapshotRow,
  ReceivableRow,
  ReceivableAgeingRow,
  PayableRow,
  PayableAgeingRow,
  ForecastRow,
  CashForecastRow,
  WorkingCapitalRow,
  ReconciliationFlagRow,
  AssetCategoryRow,
} from "./types";

export async function getChartOfAccounts(): Promise<AccountRow[]> {
  return callRpcServer<AccountRow[]>("get_chart_of_accounts");
}

export async function getAssetCategories(): Promise<AssetCategoryRow[]> {
  return callRpcServer<AssetCategoryRow[]>("get_asset_categories");
}

export async function getTrialBalance(asOfDate: string, hostelName: string | null = null): Promise<TrialBalanceRow[]> {
  return callRpcServer<TrialBalanceRow[]>("get_trial_balance", {
    p_as_of_date: asOfDate,
    p_hostel_name: hostelName,
  });
}

export async function getGeneralLedger(
  accountCode: string,
  startDate: string,
  endDate: string,
  hostelName: string | null = null
): Promise<GeneralLedgerRow[]> {
  return callRpcServer<GeneralLedgerRow[]>("get_general_ledger", {
    p_account_code: accountCode,
    p_start_date: startDate,
    p_end_date: endDate,
    p_hostel_name: hostelName,
  });
}

export async function getLedgerPnl(year: number, month: number, hostelName: string | null = null): Promise<LedgerPnlRow[]> {
  return callRpcServer<LedgerPnlRow[]>("get_ledger_pnl", {
    p_period_year: year,
    p_period_month: month,
    p_hostel_name: hostelName,
  });
}

export async function getLedgerPnlSummary(
  year: number,
  month: number,
  hostelName: string | null = null
): Promise<LedgerPnlSummary | null> {
  const rows = await callRpcServer<LedgerPnlSummary[]>("get_ledger_pnl_summary", {
    p_period_year: year,
    p_period_month: month,
    p_hostel_name: hostelName,
  });
  return rows.length > 0 ? rows[0] : null;
}

export async function getBalanceSheet(asOfDate: string, hostelName: string | null = null): Promise<BalanceSheetRow[]> {
  return callRpcServer<BalanceSheetRow[]>("get_balance_sheet", {
    p_as_of_date: asOfDate,
    p_hostel_name: hostelName,
  });
}

export async function verifyBalanceSheetBalances(asOfDate: string, hostelName: string | null = null): Promise<boolean> {
  return callRpcServer<boolean>("verify_balance_sheet_balances", {
    p_as_of_date: asOfDate,
    p_hostel_name: hostelName,
  });
}

export async function getCashFlowStatement(
  year: number,
  month: number,
  hostelName: string | null = null
): Promise<CashFlowRow[]> {
  return callRpcServer<CashFlowRow[]>("get_cash_flow_statement", {
    p_period_year: year,
    p_period_month: month,
    p_hostel_name: hostelName,
  });
}

export async function getCashBalanceAsOf(asOfDate: string, hostelName: string | null = null): Promise<number> {
  return callRpcServer<number>("get_cash_balance_as_of", {
    p_as_of_date: asOfDate,
    p_hostel_name: hostelName,
  });
}

export async function getNetWorth(asOfDate: string, hostelName: string | null = null): Promise<NetWorthRow | null> {
  const rows = await callRpcServer<NetWorthRow[]>("get_net_worth", {
    p_as_of_date: asOfDate,
    p_hostel_name: hostelName,
  });
  return rows.length > 0 ? rows[0] : null;
}

export async function getBalanceSnapshots(
  hostelName: string | null,
  fromDate: string,
  toDate: string
): Promise<BalanceSnapshotRow[]> {
  return callRpcServer<BalanceSnapshotRow[]>("get_balance_snapshots", {
    p_hostel_name: hostelName,
    p_from_date: fromDate,
    p_to_date: toDate,
  });
}

export async function getAccountsReceivable(hostelName: string | null = null): Promise<ReceivableRow[]> {
  return callRpcServer<ReceivableRow[]>("get_accounts_receivable", { p_hostel_name: hostelName });
}

export async function getReceivableAgeing(
  asOfDate: string,
  hostelName: string | null = null
): Promise<ReceivableAgeingRow[]> {
  return callRpcServer<ReceivableAgeingRow[]>("get_receivable_ageing", {
    p_as_of_date: asOfDate,
    p_hostel_name: hostelName,
  });
}

export async function getPayables(hostelName: string | null = null): Promise<PayableRow[]> {
  return callRpcServer<PayableRow[]>("get_payables", { p_hostel_name: hostelName });
}

export async function getPayableAgeing(asOfDate: string, hostelName: string | null = null): Promise<PayableAgeingRow[]> {
  return callRpcServer<PayableAgeingRow[]>("get_payable_ageing", {
    p_as_of_date: asOfDate,
    p_hostel_name: hostelName,
  });
}

export async function getFutureRentForecast(
  asOfDate: string,
  horizonMonths: number,
  hostelName: string | null = null
): Promise<ForecastRow[]> {
  return callRpcServer<ForecastRow[]>("get_future_rent_forecast", {
    p_as_of_date: asOfDate,
    p_horizon_months: horizonMonths,
    p_hostel_name: hostelName,
  });
}

export async function getFutureExpenseForecast(
  asOfDate: string,
  horizonMonths: number,
  hostelName: string | null = null
): Promise<ForecastRow[]> {
  return callRpcServer<ForecastRow[]>("get_future_expense_forecast", {
    p_as_of_date: asOfDate,
    p_horizon_months: horizonMonths,
    p_hostel_name: hostelName,
  });
}

export async function getCashForecast(
  asOfDate: string,
  horizonMonths: number,
  hostelName: string | null = null
): Promise<CashForecastRow[]> {
  return callRpcServer<CashForecastRow[]>("get_cash_forecast", {
    p_as_of_date: asOfDate,
    p_horizon_months: horizonMonths,
    p_hostel_name: hostelName,
  });
}

export async function getWorkingCapital(
  asOfDate: string,
  hostelName: string | null = null
): Promise<WorkingCapitalRow | null> {
  const rows = await callRpcServer<WorkingCapitalRow[]>("get_working_capital", {
    p_as_of_date: asOfDate,
    p_hostel_name: hostelName,
  });
  return rows.length > 0 ? rows[0] : null;
}

export async function getReconciliationFlags(includeResolved: boolean): Promise<ReconciliationFlagRow[]> {
  return callRpcServer<ReconciliationFlagRow[]>("get_reconciliation_flags", { p_include_resolved: includeResolved });
}
