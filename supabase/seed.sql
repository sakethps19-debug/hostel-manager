-- ============================================================================
-- TEST/UAT deterministic synthetic seed data.
--
-- Applied automatically by `supabase db reset` against a local dev database
-- (see supabase/config.toml [db.seed]), and applied manually (statement by
-- statement, via the Supabase MCP apply_migration tool) to the hosted
-- TEST/UAT project for this sprint. Never run this against production.
--
-- Obviously-fake names, mobile numbers, and email addresses throughout.
-- No real resident personal data is copied here. Login password for all
-- three seeded test users: TestPass123!
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Part 1: login-capable test users (owner / operations_manager /
-- finance_manager) + a compact but structurally representative 3-hostel bed
-- inventory (3 hostels x 2 floors x 4 rooms x 2/3/3/4-sharing = 66 beds).
-- ---------------------------------------------------------------------------
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'owner@test.hostelmanager.invalid', extensions.crypt('TestPass123!', extensions.gen_salt('bf')), now(), now(), now(), '{}', '{"full_name":"Test Owner"}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'ops@test.hostelmanager.invalid', extensions.crypt('TestPass123!', extensions.gen_salt('bf')), now(), now(), now(), '{}', '{"full_name":"Test Operations Manager"}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated',
   'finance@test.hostelmanager.invalid', extensions.crypt('TestPass123!', extensions.gen_salt('bf')), now(), now(), now(), '{}', '{"full_name":"Test Finance Manager"}', false, '', '', '', '')
on conflict (id) do nothing;

update profiles set role = 'owner', full_name = 'Test Owner', must_change_password = false
 where id = 'a0000000-0000-0000-0000-000000000001';
update profiles set role = 'operations_manager', full_name = 'Test Operations Manager', must_change_password = false
 where id = 'a0000000-0000-0000-0000-000000000002';
update profiles set role = 'finance_manager', full_name = 'Test Finance Manager', must_change_password = false
 where id = 'a0000000-0000-0000-0000-000000000003';

insert into hostels (name, address, is_active) values
  ('Hostel A', '12 Synthetic Test Lane, Hyderabad (TEST DATA)', true),
  ('Hostel B', '34 Synthetic Test Lane, Hyderabad (TEST DATA)', true),
  ('Hostel C', '56 Synthetic Test Lane, Hyderabad (TEST DATA)', true)
on conflict do nothing;

insert into floors (hostel_id, floor_number, floor_name)
select h.id, f.floor_number, 'Floor ' || f.floor_number
from hostels h
cross join (values (1),(2)) as f(floor_number)
where h.name in ('Hostel A','Hostel B','Hostel C')
on conflict do nothing;

insert into rooms (floor_id, room_number, sharing_type, status, standard_rate)
select fl.id,
       h.name_prefix || fl.floor_number::text || lpad(r.room_seq::text, 2, '0'),
       r.sharing_type,
       'active',
       (r.sharing_type * 2500)::numeric
from floors fl
join hostels ho on ho.id = fl.hostel_id
join (values ('Hostel A','A'), ('Hostel B','B'), ('Hostel C','C')) as h(name, name_prefix) on h.name = ho.name
cross join (values (1,2), (2,3), (3,4), (4,2)) as r(room_seq, sharing_type)
on conflict do nothing;

insert into beds (room_id, bed_number, status, bed_code)
select r.id, b.bed_number::text, 'active',
       (select name_prefix from (values ('Hostel A','A'), ('Hostel B','B'), ('Hostel C','C')) as h(name, name_prefix) where h.name = ho.name)
         || r.room_number || '-' || b.bed_number::text
from rooms r
join floors fl on fl.id = r.floor_id
join hostels ho on ho.id = fl.hostel_id
cross join lateral generate_series(1, r.sharing_type) as b(bed_number)
on conflict do nothing;

commit;

-- ---------------------------------------------------------------------------
-- Part 2: residents/bookings/payments/transfer/maintenance/vendor/payable/
-- asset/expense, driven through the real RPCs (impersonating the seeded
-- owner/ops/finance test users) so atomic payment/journal-posting logic is
-- genuinely exercised rather than bypassed via raw inserts. Covers: occupied
-- beds (with and without deposit), a future reservation, a notice-given/
-- vacating resident, a cleaning/maintenance bed, a resident with missing
-- profile info, full and partial rent payments, an overdue-rent resident,
-- transfer history, a vendor + payable, an asset, and an expense - each one
-- posting a correctly-balanced journal entry.
-- ---------------------------------------------------------------------------
begin;

create or replace function pg_temp.as_role(p_which text)
returns void language plpgsql as $$
declare
  v_id uuid;
begin
  v_id := case p_which
    when 'owner' then 'a0000000-0000-0000-0000-000000000001'::uuid
    when 'ops' then 'a0000000-0000-0000-0000-000000000002'::uuid
    when 'finance' then 'a0000000-0000-0000-0000-000000000003'::uuid
  end;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_id::text, 'role', 'authenticated')::text, true);
  execute 'set role authenticated';
end;
$$;

do $$
declare
  v_booking1 bigint; v_resident1 bigint;
  v_booking2 bigint; v_resident2 bigint;
  v_booking3 bigint; v_resident3 bigint;
  v_booking4 bigint; v_resident4 bigint;
  v_booking5 bigint; v_resident5 bigint;
  v_booking6 bigint; v_resident6 bigint; v_booking6_new bigint;
  v_booking7 bigint; v_resident7 bigint;
  v_booking9 bigint; v_resident9 bigint;
  v_booking10 bigint; v_resident10 bigint;
  v_vendor_id bigint;
  v_bed_a101_1 bigint := (select id from beds where bed_code = 'AA101-1');
  v_bed_a102_1 bigint := (select id from beds where bed_code = 'AA102-1');
  v_bed_a103_1 bigint := (select id from beds where bed_code = 'AA103-1');
  v_bed_a104_1 bigint := (select id from beds where bed_code = 'AA104-1');
  v_bed_a201_1 bigint := (select id from beds where bed_code = 'AA201-1');
  v_bed_a202_1 bigint := (select id from beds where bed_code = 'AA202-1');
  v_bed_a203_1 bigint := (select id from beds where bed_code = 'AA203-1');
  v_bed_a204_1 bigint := (select id from beds where bed_code = 'AA204-1');
  v_bed_b101_1 bigint := (select id from beds where bed_code = 'BB101-1');
  v_bed_b102_1 bigint := (select id from beds where bed_code = 'BB102-1');
  v_bed_c101_1 bigint := (select id from beds where bed_code = 'CC101-1');
begin
  -- 1. Occupied, deposit, full rent payment (Hostel A)
  perform pg_temp.as_role('ops');
  select booking_id, resident_id into v_booking1, v_resident1
  from create_booking(v_bed_a101_1, 'Test Resident One', '9000000001', 'resident.one@test.hostelmanager.invalid',
    '9000000101', 'Aadhaar Card', '000000000001', 'Test Address 1, Synthetic City', 'Test College 1',
    'Synthetic test resident - full payment scenario', '2026-08-01', '2027-07-31', 5000, 10000);
  perform pg_temp.as_role('finance');
  perform record_payment(v_booking1, 5000, current_date, '2026-09-01', 'Monthly Rent', 'Cash', 'TESTRCPT-001', 'Full rent for Sep 2026', 'seed-payment-001');

  -- 2. Occupied, deposit, partial rent payment (Hostel A)
  perform pg_temp.as_role('ops');
  select booking_id, resident_id into v_booking2, v_resident2
  from create_booking(v_bed_a102_1, 'Test Resident Two', '9000000002', 'resident.two@test.hostelmanager.invalid',
    '9000000102', 'Voter ID', '000000000002', 'Test Address 2, Synthetic City', 'Test College 2',
    'Synthetic test resident - partial payment scenario', '2026-08-01', '2027-07-31', 7500, 15000);
  perform pg_temp.as_role('finance');
  perform record_payment(v_booking2, 3000, current_date, '2026-09-01', 'Monthly Rent', 'UPI', 'TESTRCPT-002', 'Partial rent for Sep 2026', 'seed-payment-002');

  -- 3. Occupied, no deposit, overdue rent (no payment recorded) (Hostel A)
  perform pg_temp.as_role('ops');
  select booking_id, resident_id into v_booking3, v_resident3
  from create_booking(v_bed_a103_1, 'Test Resident Three', '9000000003', 'resident.three@test.hostelmanager.invalid',
    '9000000103', 'Aadhaar Card', '000000000003', 'Test Address 3, Synthetic City', 'Test College 3',
    'Synthetic test resident - overdue rent scenario', '2026-07-01', '2027-07-31', 10000, 0);

  -- 4. Occupied, missing profile info (minimal optional fields) (Hostel A)
  perform pg_temp.as_role('ops');
  select booking_id, resident_id into v_booking4, v_resident4
  from create_booking(v_bed_a104_1, 'Test Resident Four', '9000000004', null,
    null, 'Aadhaar Card', '000000000004', null, null,
    null, '2026-09-01', '2027-07-31', 5000, 0);

  -- 5. Occupied then notice given (vacating soon) (Hostel A)
  perform pg_temp.as_role('ops');
  select booking_id, resident_id into v_booking5, v_resident5
  from create_booking(v_bed_a201_1, 'Test Resident Five', '9000000005', 'resident.five@test.hostelmanager.invalid',
    '9000000105', 'PAN Card', 'ABCDE0005F', 'Test Address 5, Synthetic City', 'Test Employer 5',
    'Synthetic test resident - notice/vacating scenario', '2026-06-01', '2027-07-31', 5000, 10000);
  perform give_notice(v_booking5, '2026-10-10', 'Synthetic test notice - relocating');

  -- 6. Transfer history: booking created then transferred to a new bed (Hostel A)
  perform pg_temp.as_role('ops');
  select booking_id, resident_id into v_booking6, v_resident6
  from create_booking(v_bed_a202_1, 'Test Resident Six', '9000000006', 'resident.six@test.hostelmanager.invalid',
    '9000000106', 'Aadhaar Card', '000000000006', 'Test Address 6, Synthetic City', 'Test College 6',
    'Synthetic test resident - transfer scenario', '2026-05-01', '2027-07-31', 7500, 15000);
  perform pg_temp.as_role('owner');
  select new_booking_id into v_booking6_new
  from transfer_resident(v_booking6, v_bed_a203_1, '2026-09-15', 'Synthetic test transfer - upgraded room', 'Moved to bigger room', 10000, 20000, null);

  -- 7. Future reservation / future booking (Hostel A)
  perform pg_temp.as_role('ops');
  select booking_id, resident_id into v_booking7, v_resident7
  from create_booking(v_bed_a204_1, 'Test Resident Seven', '9000000007', 'resident.seven@test.hostelmanager.invalid',
    '9000000107', 'Driving License', 'DL0000000007', 'Test Address 7, Synthetic City', 'Test College 7',
    'Synthetic test resident - future reservation scenario', '2026-10-15', '2027-07-31', 5000, 10000);

  -- 8. Cleaning/maintenance bed, no resident (Hostel B)
  perform pg_temp.as_role('ops');
  perform start_maintenance(v_bed_b101_1, 'Synthetic test - deep cleaning before next occupancy', current_date, '2026-10-05', 'Routine test-data maintenance record', 1500);

  -- 9. Occupied, deposit, full rent payment (Hostel B)
  perform pg_temp.as_role('ops');
  select booking_id, resident_id into v_booking9, v_resident9
  from create_booking(v_bed_b102_1, 'Test Resident Eight', '9000000008', 'resident.eight@test.hostelmanager.invalid',
    '9000000108', 'Aadhaar Card', '000000000008', 'Test Address 8, Synthetic City', 'Test College 8',
    'Synthetic test resident - Hostel B full payment scenario', '2026-08-15', '2027-07-31', 7500, 15000);
  perform pg_temp.as_role('finance');
  perform record_payment(v_booking9, 7500, current_date, '2026-09-01', 'Monthly Rent', 'Bank Transfer', 'TESTRCPT-009', 'Full rent for Sep 2026', 'seed-payment-009');

  -- 10. Occupied, deposit, partial rent payment (Hostel C)
  perform pg_temp.as_role('ops');
  select booking_id, resident_id into v_booking10, v_resident10
  from create_booking(v_bed_c101_1, 'Test Resident Nine', '9000000009', 'resident.nine@test.hostelmanager.invalid',
    '9000000109', 'Voter ID', '000000000009', 'Test Address 9, Synthetic City', 'Test College 9',
    'Synthetic test resident - Hostel C partial payment scenario', '2026-08-20', '2027-07-31', 5000, 10000);
  perform pg_temp.as_role('finance');
  perform record_payment(v_booking10, 2000, current_date, '2026-09-01', 'Monthly Rent', 'Cash', 'TESTRCPT-010', 'Partial rent for Sep 2026', 'seed-payment-010');

  -- Vendor + payable (finance)
  perform pg_temp.as_role('finance');
  select add_vendor('Fake Facilities Vendor Pvt Ltd', 'Maintenance', 'Test Vendor Contact', '9000099999',
    'vendor@test.hostelmanager.invalid', 'Test Vendor Address, Synthetic City', null, 'Synthetic test vendor') into v_vendor_id;
  perform add_payable(v_vendor_id, 'Fake Facilities Vendor Pvt Ltd', 'Hostel A', 'Repairs & Maintenance', 'TESTINV-001',
    '2026-09-05', '2026-10-05', 6000, 'Synthetic test payable - plumbing invoice', null);

  -- Asset (owner)
  perform pg_temp.as_role('owner');
  perform add_asset('Split AC Unit - Room A101', 'Air Conditioner', 'Hostel A', 'A101', null,
    '2026-01-15', 32000, 'Good', '2028-01-15', 'Synthetic test asset', null, 'Bank Transfer');

  -- Expense (finance)
  perform pg_temp.as_role('finance');
  perform record_expense('Hostel A', '2026-09-10', 'Repairs & Maintenance', 4500, 'Fake Facilities Vendor Pvt Ltd',
    'Cash', null, 'Synthetic test expense - plumbing repair');

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

commit;
