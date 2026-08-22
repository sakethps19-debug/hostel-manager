-- ============================================================================
-- Asset categories — add hostel-specific bedroom linens that were missing
-- from the original 21-category seed (bed sheets, pillows), per Owner
-- feedback that the Add Asset category list should map to what a hostel
-- actually stocks, not generic office/appliance categories.
-- ============================================================================

begin;

insert into asset_categories (name, code_prefix, default_gl_account_id, default_useful_life_months, default_residual_pct)
select v.name, v.code_prefix, a.account_id, v.useful_life_months, v.residual_pct
from (values
  ('Bed Sheets', 'BEDSHEET', '1210', 24, 0.0),
  ('Pillows',    'PILLOW',   '1210', 24, 0.0)
) as v(name, code_prefix, account_code, useful_life_months, residual_pct)
join accounting_accounts a on a.code = v.account_code
on conflict (name) do nothing;

commit;
