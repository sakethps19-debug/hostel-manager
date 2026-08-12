-- ============================================================================
-- Accounting module — seed data
-- Chart of Accounts, asset categories, expense-category→account mapping,
-- payment-mode→cash/bank mapping, default settings, feature flag row.
-- Idempotent: every insert is ON CONFLICT DO NOTHING / DO UPDATE.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Chart of Accounts (section 3 of the spec, coded numerically by type)
-- ----------------------------------------------------------------------------

insert into accounting_accounts (code, name, account_type, account_subtype, normal_balance, is_contra, is_system)
values
  -- ASSETS — current
  ('1110', 'Cash',                                   'asset', 'current_asset', 'debit', false, true),
  ('1120', 'Bank',                                    'asset', 'current_asset', 'debit', false, true),
  ('1130', 'UPI / Payment Clearing',                   'asset', 'current_asset', 'debit', false, true),
  ('1140', 'Accounts Receivable - Rent',                'asset', 'current_asset', 'debit', false, true),
  ('1150', 'Accounts Receivable - Other Charges',        'asset', 'current_asset', 'debit', false, true),
  ('1160', 'Advances / Prepaid Expenses',                 'asset', 'current_asset', 'debit', false, true),
  ('1170', 'Security Deposits Given',                      'asset', 'current_asset', 'debit', false, true),
  ('1190', 'Other Current Assets',                          'asset', 'current_asset', 'debit', false, true),
  -- ASSETS — fixed
  ('1210', 'Furniture & Fixtures',                           'asset', 'fixed_asset', 'debit', false, true),
  ('1211', 'Beds / Cots',                                     'asset', 'fixed_asset', 'debit', false, true),
  ('1212', 'Mattresses',                                       'asset', 'fixed_asset', 'debit', false, true),
  ('1213', 'Electrical Equipment',                              'asset', 'fixed_asset', 'debit', false, true),
  ('1214', 'Geysers',                                            'asset', 'fixed_asset', 'debit', false, true),
  ('1215', 'Refrigerators',                                       'asset', 'fixed_asset', 'debit', false, true),
  ('1216', 'Washing Machines',                                     'asset', 'fixed_asset', 'debit', false, true),
  ('1217', 'Air Conditioners',                                      'asset', 'fixed_asset', 'debit', false, true),
  ('1218', 'TVs',                                                    'asset', 'fixed_asset', 'debit', false, true),
  ('1219', 'CCTV / Security Equipment',                                'asset', 'fixed_asset', 'debit', false, true),
  ('1220', 'Wi-Fi / Networking Equipment',                              'asset', 'fixed_asset', 'debit', false, true),
  ('1221', 'Appliances',                                                 'asset', 'fixed_asset', 'debit', false, true),
  ('1222', 'Computers / Electronics',                                     'asset', 'fixed_asset', 'debit', false, true),
  ('1229', 'Other Fixed Assets',                                           'asset', 'fixed_asset', 'debit', false, true),
  ('1290', 'Accumulated Depreciation',                                      'asset', 'fixed_asset', 'credit', true, true),
  -- LIABILITIES — current
  ('2110', 'Accounts Payable - Vendors',       'liability', 'current_liability', 'credit', false, true),
  ('2120', 'Salary Payable',                    'liability', 'current_liability', 'credit', false, true),
  ('2130', 'Utilities Payable',                  'liability', 'current_liability', 'credit', false, true),
  ('2140', 'Rent / Lease Payable',                'liability', 'current_liability', 'credit', false, true),
  ('2150', 'Other Expenses Payable',               'liability', 'current_liability', 'credit', false, true),
  ('2160', 'Security Deposits Received from Residents', 'liability', 'current_liability', 'credit', false, true),
  ('2170', 'Advance Rent Received',                 'liability', 'current_liability', 'credit', false, true),
  ('2190', 'Other Current Liabilities',               'liability', 'current_liability', 'credit', false, true),
  -- EQUITY
  ('3100', 'Owner Capital',                'equity', null, 'credit', false, true),
  ('3110', 'Owner Drawings',                'equity', null, 'debit', true, true),
  ('3120', 'Retained Earnings',              'equity', null, 'credit', false, true),
  ('3190', 'Opening Balance Equity',          'equity', null, 'credit', false, true),
  -- INCOME
  ('4100', 'Rent Revenue',              'income', null, 'credit', false, true),
  ('4110', 'Other Resident Charges',     'income', null, 'credit', false, true),
  ('4120', 'Late Fee Revenue',            'income', null, 'credit', false, true),
  ('4190', 'Other Operating Income',       'income', null, 'credit', false, true),
  ('4195', 'Gain on Asset Disposal',        'income', null, 'credit', false, true),
  -- EXPENSES
  ('5100', 'Electricity',                'expense', null, 'debit', false, true),
  ('5110', 'Water',                       'expense', null, 'debit', false, true),
  ('5120', 'Internet',                     'expense', null, 'debit', false, true),
  ('5130', 'Housekeeping',                  'expense', null, 'debit', false, true),
  ('5140', 'Salaries / Wages',               'expense', null, 'debit', false, true),
  ('5150', 'Repairs & Maintenance',           'expense', null, 'debit', false, true),
  ('5160', 'Pest Control',                     'expense', null, 'debit', false, true),
  ('5170', 'Supplies / Consumables',            'expense', null, 'debit', false, true),
  ('5180', 'Rent / Lease',                       'expense', null, 'debit', false, true),
  ('5190', 'Professional Fees',                   'expense', null, 'debit', false, true),
  ('5200', 'Taxes / Government Charges',           'expense', null, 'debit', false, true),
  ('5210', 'Depreciation Expense',                  'expense', null, 'debit', false, true),
  ('5290', 'Other Operating Expenses',               'expense', null, 'debit', false, true),
  ('5295', 'Loss on Asset Disposal',                   'expense', null, 'debit', false, true)
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- Asset categories — extends the existing 7 client-side categories
-- (Furniture, Electrical Appliance, Electronics, Kitchen Equipment,
--  Fire Safety, Plumbing Fixture, Other) with the finer-grained set from
-- section 4/7 of the spec, each mapped to a GL fixed-asset account.
-- Existing asset rows keep whatever `category` string they already have —
-- this table is additive, not a replacement/rename of that column.
-- Default useful lives are a starting configurable assumption, not a
-- statutory rate — see accounting_settings and the completion report.
-- ----------------------------------------------------------------------------

insert into asset_categories (name, code_prefix, default_gl_account_id, default_useful_life_months, default_residual_pct)
select v.name, v.code_prefix, a.account_id, v.useful_life_months, v.residual_pct
from (values
  ('Cot / Bed Frame',        'BED',     '1211', 96,  5.0),
  ('Mattress',                'MAT',     '1212', 60,  0.0),
  ('Locker',                   'LOCK',    '1210', 96,  5.0),
  ('Cupboard',                  'CUPB',    '1210', 96,  5.0),
  ('Table',                      'TBL',     '1210', 96,  5.0),
  ('Chair',                       'CHR',     '1210', 96,  5.0),
  ('Fan',                           'FAN',     '1213', 60,  5.0),
  ('Geyser',                         'GEYSER',  '1214', 60,  5.0),
  ('Washing Machine',                 'WM',      '1216', 84,  5.0),
  ('Refrigerator / Fridge',            'FRIDGE',  '1215', 96,  5.0),
  ('Air Conditioner',                   'AC',      '1217', 84,  5.0),
  ('TV',                                  'TV',      '1218', 60,  5.0),
  ('CCTV Camera',                          'CCTV',    '1219', 60,  5.0),
  ('Router',                                 'ROUTER',  '1220', 36,  0.0),
  ('Inverter / UPS',                          'UPS',     '1213', 60,  5.0),
  ('Water Purifier',                            'WP',      '1221', 60,  5.0),
  ('Kitchen Equipment',                           'KITCHEN', '1221', 60,  5.0),
  ('Other Appliances',                              'APPL',    '1221', 60,  5.0),
  ('Furniture',                                       'FURN',    '1210', 96,  5.0),
  ('Electronics',                                       'ELEC',    '1222', 60,  5.0),
  ('Other Assets',                                        'OTHER',   '1229', 60,  0.0)
) as v(name, code_prefix, account_code, useful_life_months, residual_pct)
join accounting_accounts a on a.code = v.account_code
on conflict (name) do nothing;

-- ----------------------------------------------------------------------------
-- Expense category -> GL account mapping
-- (matches CATEGORIES array duplicated across app/expenses/new/NewExpenseForm.tsx,
--  RecurringExpensesView.tsx, ExpenseApprovalsView.tsx, BudgetVsActualView.tsx)
-- ----------------------------------------------------------------------------

create table if not exists accounting_expense_category_map (
  category   text primary key,
  account_id bigint not null references accounting_accounts(account_id)
);

insert into accounting_expense_category_map (category, account_id)
select v.category, a.account_id
from (values
  ('Electricity',              '5100'),
  ('Water',                     '5110'),
  ('Housekeeping',               '5130'),
  ('Repairs & Maintenance',        '5150'),
  ('Wi-Fi',                          '5120'),
  ('Salaries',                        '5140'),
  ('Supplies',                          '5170'),
  ('Rent / Lease',                       '5180'),
  ('Taxes / Charges',                      '5200'),
  ('Other',                                  '5290')
) as v(category, account_code)
join accounting_accounts a on a.code = v.account_code
on conflict (category) do nothing;

-- ----------------------------------------------------------------------------
-- Payment mode -> cash/bank account mapping
-- (matches PAYMENT_MODES = ["Cash","UPI","Bank Transfer","Other"] reused
--  verbatim across payments, expenses, petty cash, recurring templates)
-- ----------------------------------------------------------------------------

create table if not exists accounting_payment_mode_map (
  payment_mode text primary key,
  account_id   bigint not null references accounting_accounts(account_id)
);

insert into accounting_payment_mode_map (payment_mode, account_id)
select v.payment_mode, a.account_id
from (values
  ('Cash',          '1110'),
  ('UPI',            '1120'),
  ('Bank Transfer',   '1120'),
  ('Other',             '1110')
) as v(payment_mode, account_code)
join accounting_accounts a on a.code = v.account_code
on conflict (payment_mode) do nothing;

-- ----------------------------------------------------------------------------
-- Default accounting settings
-- ----------------------------------------------------------------------------

insert into accounting_settings (setting_key, setting_value) values
  ('capitalization_threshold', '5000'),        -- Rs. — asset purchases at/above this are capitalized; below, expensed. Configurable, see completion report.
  ('default_depreciation_method', 'straight_line'),
  ('financial_year_start_month', '4')          -- April, per Indian FY convention already used elsewhere in the app (formatFiscalYear)
on conflict (setting_key) do nothing;

commit;

-- ----------------------------------------------------------------------------
-- Feature flag row (matches the pattern of the existing "enable_expenses"
-- flag — gates the whole accounting module tree behind isFeatureEnabled()).
-- Run separately if get_feature_flags/set_feature_flag are backed by a table
-- your Supabase project already has under a different name than assumed here;
-- adjust the table/column names to match, then insert this row via that path.
-- ----------------------------------------------------------------------------

-- insert into feature_flags (key, enabled, description) values
--   ('enable_accounting', true, 'Accounting, Asset Register finance module, and Financial Statements')
-- on conflict (key) do nothing;
