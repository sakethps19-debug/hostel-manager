-- ============================================================================
-- Accounting / Asset Register / Financial Statements module — schema
-- ============================================================================
--
-- SCOPE NOTE (read before applying):
-- This repository has no prior SQL migrations checked in — every existing
-- table/RPC (residents, bookings, payments, expenses, vendors, assets,
-- maintenance, etc.) lives only in the live Supabase project and was never
-- committed here. This migration is therefore written defensively:
--   * every new object uses IF NOT EXISTS / OR REPLACE so it's safe to re-run
--   * every ALTER on a pre-existing table (assets, bed_maintenance) uses
--     ADD COLUMN IF NOT EXISTS with a note on the assumption being made
--   * nothing here drops, renames, or rewrites existing columns/rows
--   * no RLS policy narrows access more than the app's own permission checks
--     already assume (requirePermission/hasPermission), but see
--     2026081205_accounting_rls.sql for the actual policies
--
-- Apply this file, then the others in this directory, IN FILENAME ORDER,
-- against the Supabase project's SQL editor (or `supabase db push`).
-- This has NOT been run against a live database — review before applying.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Assumptions about pre-existing tables (documented, not enforced)
-- ----------------------------------------------------------------------------
-- assets(asset_id pk, name, category, hostel_name, room_number, bed_code,
--        bed_id, purchase_date, purchase_cost, condition, warranty_expiry,
--        notes, created_at)               -- confirmed via app/settings/assets
-- bed_maintenance(maintenance_id pk, bed_id, reason, start_date,
--        expected_completion_date, actual_completion_date, notes, cost,
--        status)                          -- confirmed via maintenance RPCs
-- vendors(vendor_id pk, name, category, contact_person, contact_number,
--        email, address, gst_number, notes, is_active, created_at)
-- profiles(id uuid pk references auth.users, role text, must_change_password)
-- monthly_finance_closes(close_id pk, month, year, ... , closed_at, reopened_at)
--
-- If any assumed table/column name differs from the live schema, the
-- corresponding ALTER/FK statement below will fail loudly (not silently) —
-- fix the mismatch before re-running the rest of the file.

-- ----------------------------------------------------------------------------
-- 1. Chart of Accounts
-- ----------------------------------------------------------------------------

create table if not exists accounting_accounts (
  account_id        bigint generated always as identity primary key,
  code              text not null unique,
  name              text not null,
  account_type      text not null check (account_type in ('asset','liability','equity','income','expense')),
  account_subtype   text,
  normal_balance    text not null check (normal_balance in ('debit','credit')),
  parent_account_id bigint references accounting_accounts(account_id),
  is_contra         boolean not null default false,
  is_system         boolean not null default false, -- seeded/protected; UI should block deletion
  is_active         boolean not null default true,
  description       text,
  created_at        timestamptz not null default now()
);

comment on table accounting_accounts is
  'Chart of Accounts. is_system rows are seeded by this migration and referenced by '
  'name from posting functions below — do not delete/repurpose their codes.';

-- ----------------------------------------------------------------------------
-- 2. Journal Entries / Journal Entry Lines (the general ledger)
-- ----------------------------------------------------------------------------

create table if not exists accounting_journal_entries (
  journal_entry_id           bigint generated always as identity primary key,
  entry_date                 date not null,
  hostel_name                text,                 -- null = consolidated/common, matches existing p_hostel_name convention
  period_month                int not null check (period_month between 1 and 12),
  period_year                 int not null,
  source_type                text not null,        -- 'rent_accrual','payment','deposit','expense','payable_invoice',
                                                     -- 'payable_payment','asset_purchase','depreciation','asset_disposal',
                                                     -- 'owner_capital','owner_drawing','opening_balance','manual','reconciliation_catchup'
  source_id                  bigint,                -- id in the source table; null for manual/opening entries
  narration                  text not null,
  status                     text not null default 'posted' check (status in ('posted','reversed')),
  reverses_journal_entry_id  bigint references accounting_journal_entries(journal_entry_id),
  reversed_by_journal_entry_id bigint references accounting_journal_entries(journal_entry_id),
  created_by                 uuid references auth.users(id),
  created_at                 timestamptz not null default now()
);

create index if not exists idx_je_period on accounting_journal_entries(period_year, period_month);
create index if not exists idx_je_hostel on accounting_journal_entries(hostel_name);
create index if not exists idx_je_source on accounting_journal_entries(source_type, source_id);
create index if not exists idx_je_date on accounting_journal_entries(entry_date);

create table if not exists accounting_journal_entry_lines (
  journal_entry_line_id bigint generated always as identity primary key,
  journal_entry_id      bigint not null references accounting_journal_entries(journal_entry_id) on delete cascade,
  account_id            bigint not null references accounting_accounts(account_id),
  debit                 numeric(14,2) not null default 0 check (debit >= 0),
  credit                numeric(14,2) not null default 0 check (credit >= 0),
  -- dimensions for sub-ledgers / drill-down (all nullable; populate what's relevant)
  hostel_name            text,
  resident_id            bigint,
  booking_id             bigint,
  vendor_id              bigint,
  asset_id               bigint,
  memo                   text,
  constraint one_sided_line check (
    (debit > 0 and credit = 0) or (credit > 0 and debit = 0)
  )
);

create index if not exists idx_jel_entry on accounting_journal_entry_lines(journal_entry_id);
create index if not exists idx_jel_account on accounting_journal_entry_lines(account_id);
create index if not exists idx_jel_resident on accounting_journal_entry_lines(resident_id) where resident_id is not null;
create index if not exists idx_jel_booking on accounting_journal_entry_lines(booking_id) where booking_id is not null;
create index if not exists idx_jel_vendor on accounting_journal_entry_lines(vendor_id) where vendor_id is not null;
create index if not exists idx_jel_asset on accounting_journal_entry_lines(asset_id) where asset_id is not null;

comment on table accounting_journal_entry_lines is
  'Each line is one-sided (either debit>0 xor credit>0). A deferred constraint '
  'trigger (accounting_enforce_balanced_entry) verifies sum(debit)=sum(credit) '
  'per journal_entry_id at transaction commit — see 2026081202.';

-- Every journal entry must balance. Enforced with a deferred constraint
-- trigger (checked once per statement/transaction, not per row) so a
-- multi-line INSERT can build up an entry line-by-line before the check runs.
create or replace function accounting_check_entry_balance() returns trigger as $$
declare
  v_journal_entry_id bigint;
  v_debit numeric(14,2);
  v_credit numeric(14,2);
begin
  v_journal_entry_id := coalesce(new.journal_entry_id, old.journal_entry_id);

  select coalesce(sum(debit),0), coalesce(sum(credit),0)
    into v_debit, v_credit
    from accounting_journal_entry_lines
   where journal_entry_id = v_journal_entry_id;

  if v_debit <> v_credit then
    raise exception 'Journal entry % does not balance: debit=% credit=%',
      v_journal_entry_id, v_debit, v_credit;
  end if;

  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_accounting_check_entry_balance on accounting_journal_entry_lines;
create constraint trigger trg_accounting_check_entry_balance
  after insert or update or delete on accounting_journal_entry_lines
  deferrable initially deferred
  for each row execute function accounting_check_entry_balance();

-- ----------------------------------------------------------------------------
-- 3. Accounting period locking (new, additive — does not touch the existing
--    monthly_finance_closes checkpoint table, which stays exactly as-is and
--    keeps working unchanged; this is the layer that actually enforces
--    immutability once a period is locked, which the old table explicitly
--    does not do)
-- ----------------------------------------------------------------------------

create table if not exists accounting_period_locks (
  period_month int not null check (period_month between 1 and 12),
  period_year  int not null,
  is_locked    boolean not null default false,
  locked_by    uuid references auth.users(id),
  locked_at    timestamptz,
  unlocked_by  uuid references auth.users(id),
  unlocked_at  timestamptz,
  primary key (period_year, period_month)
);

create or replace function accounting_reject_posting_in_locked_period() returns trigger as $$
declare
  v_locked boolean;
begin
  select is_locked into v_locked
    from accounting_period_locks
   where period_year = new.period_year and period_month = new.period_month;

  if coalesce(v_locked, false) then
    raise exception 'Accounting period %-% is locked. Reopen it before posting.',
      new.period_year, new.period_month;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_reject_posting_in_locked_period on accounting_journal_entries;
create trigger trg_reject_posting_in_locked_period
  before insert on accounting_journal_entries
  for each row execute function accounting_reject_posting_in_locked_period();

-- ----------------------------------------------------------------------------
-- 4. Asset Register extension (additive columns on the existing `assets`
--    table — every existing column/RPC stays exactly as it is today)
-- ----------------------------------------------------------------------------

alter table assets add column if not exists asset_code text;
alter table assets add column if not exists description text;
alter table assets add column if not exists floor_number int;
alter table assets add column if not exists location_notes text;
alter table assets add column if not exists vendor_id bigint references vendors(vendor_id);
alter table assets add column if not exists invoice_number text;
alter table assets add column if not exists payment_mode text;
alter table assets add column if not exists serial_number text;
alter table assets add column if not exists model text;
alter table assets add column if not exists brand text;
alter table assets add column if not exists warranty_start_date date;
alter table assets add column if not exists useful_life_months int;
alter table assets add column if not exists depreciation_method text default 'straight_line'
  check (depreciation_method in ('straight_line','none'));
alter table assets add column if not exists residual_value numeric(12,2) not null default 0;
alter table assets add column if not exists depreciation_start_date date;
alter table assets add column if not exists accumulated_depreciation numeric(12,2) not null default 0;
alter table assets add column if not exists status text not null default 'in_use'
  check (status in ('in_use','available','under_maintenance','damaged','retired','sold','lost','written_off'));
alter table assets add column if not exists last_service_date date;
alter table assets add column if not exists next_service_date date;
alter table assets add column if not exists capitalized boolean not null default true;
alter table assets add column if not exists gl_account_id bigint references accounting_accounts(account_id);
alter table assets add column if not exists created_by uuid references auth.users(id);

comment on column assets.status is
  'New operational/lifecycle status, separate from the pre-existing `condition` '
  'column (Good/Fair/Needs Repair/Disposed) which is left untouched for '
  'backward compatibility with app/settings/assets/AssetsTable.tsx.';

comment on column assets.accumulated_depreciation is
  'Denormalized cache kept in sync by post_depreciation_run() / '
  'post_asset_disposal_journal(). Source of truth is the Accumulated '
  'Depreciation account balance dimensioned by asset_id in the ledger — '
  'reconcile_asset_register_vs_ledger() flags any drift.';

create unique index if not exists idx_assets_asset_code on assets(asset_code) where asset_code is not null;

create table if not exists asset_categories (
  category_id                 bigint generated always as identity primary key,
  name                         text not null unique,
  code_prefix                  text not null unique, -- short token used in asset_code, e.g. 'BED','MAT','GEYSER','WM'
  default_gl_account_id        bigint references accounting_accounts(account_id),
  default_useful_life_months   int,
  default_depreciation_method  text default 'straight_line' check (default_depreciation_method in ('straight_line','none')),
  default_residual_pct         numeric(5,2) not null default 0, -- percent of cost, e.g. 5.00 = 5%
  is_active                    boolean not null default true
);

create table if not exists asset_transfers (
  transfer_id      bigint generated always as identity primary key,
  asset_id         bigint not null references assets(asset_id),
  from_hostel_name text,
  from_room_number text,
  from_bed_code    text,
  to_hostel_name   text,
  to_room_number   text,
  to_bed_code      text,
  transfer_date    date not null default current_date,
  transferred_by   uuid references auth.users(id),
  reason           text,
  notes            text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_asset_transfers_asset on asset_transfers(asset_id);

create table if not exists asset_disposals (
  disposal_id            bigint generated always as identity primary key,
  asset_id               bigint not null references assets(asset_id) unique, -- one disposal per asset
  disposal_date           date not null,
  sale_proceeds            numeric(12,2) not null default 0,
  buyer                    text,
  reason                   text,
  book_value_at_disposal   numeric(12,2) not null,
  gain_loss                numeric(12,2) not null, -- sale_proceeds - book_value_at_disposal
  journal_entry_id         bigint references accounting_journal_entries(journal_entry_id),
  created_by               uuid references auth.users(id),
  created_at               timestamptz not null default now()
);

create table if not exists asset_documents (
  document_id   bigint generated always as identity primary key,
  asset_id      bigint not null references assets(asset_id),
  document_type text not null check (document_type in
    ('purchase_invoice','warranty','service_invoice','photograph','disposal_document','other')),
  storage_path  text not null,
  notes         text,
  uploaded_by   uuid references auth.users(id),
  uploaded_at   timestamptz not null default now()
);

create index if not exists idx_asset_documents_asset on asset_documents(asset_id);

create table if not exists asset_depreciation_entries (
  depreciation_entry_id      bigint generated always as identity primary key,
  asset_id                   bigint not null references assets(asset_id),
  period_month               int not null check (period_month between 1 and 12),
  period_year                int not null,
  depreciation_amount        numeric(12,2) not null,
  accumulated_depreciation_after numeric(12,2) not null,
  net_book_value_after       numeric(12,2) not null,
  journal_entry_id           bigint references accounting_journal_entries(journal_entry_id),
  created_at                 timestamptz not null default now(),
  unique (asset_id, period_year, period_month)
);

comment on table asset_depreciation_entries is
  'One row per asset per period a depreciation run has processed it. The '
  'unique constraint is what prevents post_depreciation_run() from ever '
  'double-posting the same asset/period.';

-- Link maintenance records to an asset, additive column on the existing table.
alter table bed_maintenance add column if not exists asset_id bigint references assets(asset_id);

-- ----------------------------------------------------------------------------
-- 5. Accounts Payable (genuine unpaid-invoice tracking — new concept; the
--    pre-existing `expenses` table records already-paid transactions and is
--    left untouched, see 2026081203 for how the two connect)
-- ----------------------------------------------------------------------------

create table if not exists accounting_payables (
  payable_id       bigint generated always as identity primary key,
  vendor_id        bigint references vendors(vendor_id),
  vendor_name      text not null, -- denormalized snapshot, kept even if vendor_id is null (ad-hoc payee)
  hostel_name      text,
  category         text not null,
  invoice_number   text,
  invoice_date     date not null,
  due_date         date not null,
  amount           numeric(12,2) not null check (amount > 0),
  amount_paid      numeric(12,2) not null default 0,
  status           text not null default 'due' check (status in ('due','partially_paid','paid','overdue','cancelled')),
  notes            text,
  attachment_path  text,
  accrual_journal_entry_id bigint references accounting_journal_entries(journal_entry_id),
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now()
);

create index if not exists idx_payables_vendor on accounting_payables(vendor_id);
create index if not exists idx_payables_status on accounting_payables(status);
create index if not exists idx_payables_due_date on accounting_payables(due_date);

create table if not exists accounting_payable_payments (
  payable_payment_id bigint generated always as identity primary key,
  payable_id         bigint not null references accounting_payables(payable_id),
  payment_date        date not null,
  amount               numeric(12,2) not null check (amount > 0),
  payment_mode         text not null,
  reference_number     text,
  notes                text,
  journal_entry_id     bigint references accounting_journal_entries(journal_entry_id),
  created_by           uuid references auth.users(id),
  created_at           timestamptz not null default now()
);

create index if not exists idx_payable_payments_payable on accounting_payable_payments(payable_id);

-- ----------------------------------------------------------------------------
-- 6. Rent accrual tracking (prevents double-accrual; the ledger itself is
--    the AR balance — this table is only a idempotency/audit guard)
-- ----------------------------------------------------------------------------

create table if not exists accounting_rent_accruals (
  rent_accrual_id  bigint generated always as identity primary key,
  booking_id       bigint not null,
  resident_id      bigint,
  hostel_name      text,
  period_month     int not null check (period_month between 1 and 12),
  period_year      int not null,
  amount           numeric(12,2) not null,
  due_date         date not null,
  journal_entry_id bigint references accounting_journal_entries(journal_entry_id),
  created_at       timestamptz not null default now(),
  unique (booking_id, period_year, period_month)
);

create index if not exists idx_rent_accruals_booking on accounting_rent_accruals(booking_id);

-- ----------------------------------------------------------------------------
-- 7. Opening balances
-- ----------------------------------------------------------------------------

create table if not exists accounting_opening_balance_batches (
  batch_id     bigint generated always as identity primary key,
  as_of_date   date not null,
  status       text not null default 'draft' check (status in ('draft','posted')),
  journal_entry_id bigint references accounting_journal_entries(journal_entry_id),
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  posted_at    timestamptz
);

create table if not exists accounting_opening_balance_lines (
  line_id      bigint generated always as identity primary key,
  batch_id     bigint not null references accounting_opening_balance_batches(batch_id) on delete cascade,
  account_id   bigint not null references accounting_accounts(account_id),
  hostel_name  text,
  resident_id  bigint,
  booking_id   bigint,
  vendor_id    bigint,
  asset_id     bigint,
  debit        numeric(14,2) not null default 0 check (debit >= 0),
  credit       numeric(14,2) not null default 0 check (credit >= 0),
  notes        text,
  constraint one_sided_ob_line check (
    (debit > 0 and credit = 0) or (credit > 0 and debit = 0)
  )
);

create index if not exists idx_ob_lines_batch on accounting_opening_balance_lines(batch_id);

-- ----------------------------------------------------------------------------
-- 8. Period-end balance snapshots (for Net Worth trend, mirrors the existing
--    get_occupancy_snapshots pattern used for occupancy history)
-- ----------------------------------------------------------------------------

create table if not exists accounting_balance_snapshots (
  snapshot_id         bigint generated always as identity primary key,
  snapshot_date        date not null,
  hostel_name          text, -- null = consolidated
  cash_bank             numeric(14,2) not null,
  receivables           numeric(14,2) not null,
  other_current_assets  numeric(14,2) not null,
  net_fixed_assets      numeric(14,2) not null,
  total_assets          numeric(14,2) not null,
  payables               numeric(14,2) not null,
  deposits_held           numeric(14,2) not null,
  other_liabilities       numeric(14,2) not null,
  total_liabilities       numeric(14,2) not null,
  owner_equity            numeric(14,2) not null,
  net_worth                numeric(14,2) not null,
  created_at               timestamptz not null default now(),
  unique (snapshot_date, hostel_name)
);

-- ----------------------------------------------------------------------------
-- 9. Reconciliation exception log
-- ----------------------------------------------------------------------------

create table if not exists accounting_reconciliation_flags (
  flag_id            bigint generated always as identity primary key,
  flag_type           text not null, -- 'unjournaled_payment','unjournaled_expense','unjournaled_asset',
                                      -- 'asset_register_vs_ledger','deposit_liability_mismatch',
                                      -- 'ar_vs_resident_ledger','ap_vs_vendor_balance','trial_balance_unbalanced'
  description          text not null,
  related_source_type  text,
  related_source_id    bigint,
  amount_variance       numeric(14,2),
  detected_at            timestamptz not null default now(),
  resolved_at             timestamptz,
  resolved_by             uuid references auth.users(id),
  resolution_notes        text
);

create index if not exists idx_reconciliation_flags_open on accounting_reconciliation_flags(flag_type) where resolved_at is null;

-- ----------------------------------------------------------------------------
-- 10. Owner capital / drawings (a genuinely new concept — no existing table
--    records these events today)
-- ----------------------------------------------------------------------------

create table if not exists accounting_owner_transactions (
  owner_transaction_id bigint generated always as identity primary key,
  transaction_type       text not null check (transaction_type in ('capital_introduced','drawing')),
  amount                   numeric(12,2) not null check (amount > 0),
  transaction_date         date not null,
  cash_account_code         text not null default '1120', -- 'Cash' (1110) or 'Bank' (1120)
  hostel_name               text,
  notes                     text,
  journal_entry_id           bigint references accounting_journal_entries(journal_entry_id),
  created_by                 uuid references auth.users(id),
  created_at                 timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 11. Accounting configuration
-- ----------------------------------------------------------------------------

create table if not exists accounting_settings (
  setting_key   text primary key,
  setting_value text not null,
  updated_by    uuid references auth.users(id),
  updated_at    timestamptz not null default now()
);

commit;
