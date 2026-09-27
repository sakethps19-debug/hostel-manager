-- ============================================================================
-- Hostel A legacy resident import: open-ended bookings, edit-flow relief,
-- real ledger bug fix, and a controlled bulk-import path
-- ============================================================================
--
-- Context: importing ~108 real, currently-occupied Hostel A beds from an
-- external record. The source data has no ID proof, no end/checkout date
-- (residents are ongoing), and 6 of 108 residents have no mobile number on
-- file. None of that is fabricatable per the import's own ground rules, so
-- it surfaced three real gaps in the existing schema/functions - fixed here,
-- NOT by weakening create_booking/BookingForm.tsx (the actual "new resident"
-- creation path), which is untouched by this migration.
--
-- 1. bookings.end_date was NOT NULL - genuinely impossible to represent an
--    open-ended/ongoing stay. Made nullable; Postgres's daterange(..) and
--    LEAST()/GREATEST() both already treat a null upper bound as unbounded,
--    so the no_overlapping_bed_bookings exclusion constraint and
--    get_booking_ledger's rent-due math keep working correctly unmodified
--    (verified directly against this database, not assumed).
--
-- 2. get_rent_ledger_all() used `current_date between start_date and
--    end_date`, which is NULL (excluded) whenever end_date is null - EVERY
--    open-ended resident would silently vanish from the Overdue Rent and
--    Rent Calendar pages while still genuinely owing rent. This is a real,
--    pre-existing latent bug, independent of the schema change - it simply
--    had no null end_date to expose it before now. Fixed to treat a null
--    end_date as "still current."
--
-- 3. update_booking_details() hard-required mobile number, ID proof
--    type+number, and end date on every save - meaning NONE of the imported
--    residents could have any field edited (even an unrelated typo fix)
--    without first inventing data the source never provided. Relaxed to
--    validate format only when a value is present, matching the app's own
--    "Profile Completeness / Data Health" model of gradually-completed
--    records. create_booking (new bookings via the normal UI) is NOT
--    touched - it keeps requiring all of this for a fresh booking.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. bookings.end_date -> nullable
-- ----------------------------------------------------------------------------

alter table bookings alter column end_date drop not null;

alter table bookings drop constraint bookings_check;
alter table bookings add constraint bookings_check
  check (end_date is null or end_date >= start_date);

-- ----------------------------------------------------------------------------
-- 2. get_rent_ledger_all() - stop silently excluding open-ended bookings
-- ----------------------------------------------------------------------------

create or replace function get_rent_ledger_all()
returns table(
  booking_id bigint, resident_id bigint, full_name text, mobile_number text,
  hostel_name text, room_number text, bed_id bigint, bed_code text,
  monthly_rent numeric, months_elapsed integer, amount_due numeric,
  amount_paid numeric, balance_outstanding numeric, last_payment_date date,
  payment_status text, start_date date, end_date date
) as $$
declare
  r record;
  v_ledger record;
begin
  perform require_role(array['owner','finance_manager']);

  for r in
    select bk.id as booking_id, bk.resident_id, res.full_name, res.mobile_number,
           h.name as hostel_name, rm.room_number, b.id as bed_id, b.bed_code,
           bk.start_date, bk.end_date
    from bookings bk
    join residents res on res.id = bk.resident_id
    join beds b on b.id = bk.bed_id
    join rooms rm on rm.id = b.room_id
    join floors f on f.id = rm.floor_id
    join hostels h on h.id = f.hostel_id
    where bk.status in ('confirmed', 'checked_in')
      and current_date >= bk.start_date
      and (bk.end_date is null or current_date <= bk.end_date)
  loop
    select * into v_ledger from get_booking_ledger(r.booking_id);

    booking_id := r.booking_id;
    resident_id := r.resident_id;
    full_name := r.full_name;
    mobile_number := r.mobile_number;
    hostel_name := r.hostel_name;
    room_number := r.room_number;
    bed_id := r.bed_id;
    bed_code := r.bed_code;
    monthly_rent := v_ledger.monthly_rent;
    months_elapsed := v_ledger.months_elapsed;
    amount_due := v_ledger.amount_due;
    amount_paid := v_ledger.amount_paid;
    balance_outstanding := v_ledger.balance_outstanding;
    last_payment_date := v_ledger.last_payment_date;
    payment_status := v_ledger.payment_status;
    start_date := r.start_date;
    end_date := r.end_date;

    return next;
  end loop;
end;
$$ language plpgsql security definer set search_path to 'public';

-- ----------------------------------------------------------------------------
-- 3. update_booking_details() - edit-flow relief (create_booking untouched)
-- ----------------------------------------------------------------------------

create or replace function update_booking_details(
  p_booking_id bigint, p_full_name text, p_mobile_number text, p_email text,
  p_emergency_contact text, p_id_proof_type text, p_id_proof_number text,
  p_home_address text, p_work_college_address text, p_notes text,
  p_start_date date, p_end_date date, p_monthly_rent numeric, p_security_deposit numeric
) returns void as $$
declare
  v_resident_id bigint;
  v_bed_id bigint;
begin
  perform require_role(array['owner','operations_manager']);

  if p_full_name is null or trim(p_full_name) = '' then
    raise exception 'Resident name is required';
  end if;

  -- Format-validated only when present - unlike create_booking, editing an
  -- existing resident must not force a mobile number to be invented just to
  -- save an unrelated change.
  if p_mobile_number is not null and trim(p_mobile_number) !~ '^[0-9]{10}$' then
    raise exception 'Mobile number must contain exactly 10 digits';
  end if;

  if p_id_proof_type is not null and trim(p_id_proof_type) <> '' and p_id_proof_type not in (
    'Aadhaar Card', 'PAN Card', 'Voter ID', 'Driving License', 'Other'
  ) then
    raise exception 'Invalid ID proof type';
  end if;

  if p_start_date is null then
    raise exception 'Start date is required';
  end if;

  if p_end_date is not null and p_end_date < p_start_date then
    raise exception 'End date cannot be before start date';
  end if;

  if p_monthly_rent is null or p_monthly_rent < 0 then
    raise exception 'Monthly rent must be valid';
  end if;

  if p_security_deposit is not null and p_security_deposit < 0 then
    raise exception 'Security deposit cannot be negative';
  end if;

  select resident_id, bed_id into v_resident_id, v_bed_id
  from bookings where id = p_booking_id;

  if not found then
    raise exception 'Booking not found';
  end if;

  if exists (
    select 1
    from bookings b
    where b.bed_id = v_bed_id
      and b.id <> p_booking_id
      and b.status in ('confirmed', 'checked_in')
      and daterange(b.start_date, coalesce(b.end_date, 'infinity'::date), '[]')
          && daterange(p_start_date, coalesce(p_end_date, 'infinity'::date), '[]')
  ) then
    raise exception
      'This bed is already booked for part of the selected period';
  end if;

  update residents
  set
    full_name = trim(p_full_name),
    mobile_number = nullif(trim(p_mobile_number), ''),
    email = nullif(trim(p_email), ''),
    emergency_contact = nullif(trim(p_emergency_contact), ''),
    id_proof_type = nullif(trim(p_id_proof_type), ''),
    id_proof_number = nullif(trim(p_id_proof_number), ''),
    home_address = nullif(trim(p_home_address), ''),
    work_college_address = nullif(trim(p_work_college_address), ''),
    notes = nullif(trim(p_notes), '')
  where id = v_resident_id;

  update bookings
  set
    start_date = p_start_date,
    end_date = p_end_date,
    monthly_rent = p_monthly_rent,
    security_deposit = p_security_deposit
  where id = p_booking_id;

end;
$$ language plpgsql security definer set search_path to 'public';

-- ----------------------------------------------------------------------------
-- 4. Legacy import audit trail
-- ----------------------------------------------------------------------------

create table if not exists legacy_import_batches (
  batch_id    bigint generated always as identity primary key,
  source      text not null,
  hostel_name text not null,
  imported_by uuid references auth.users(id),
  imported_at timestamptz not null default now(),
  total_rows  int,
  notes       text
);

create table if not exists legacy_import_rows (
  import_row_id     bigint generated always as identity primary key,
  batch_id          bigint not null references legacy_import_batches(batch_id),
  source_row_number int,
  room_no           int,
  bed_no            int,
  bed_id            bigint references beds(id),
  resident_id       bigint references residents(id),
  booking_id        bigint references bookings(id),
  outcome           text not null check (outcome in ('created', 'error')),
  detail            text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_legacy_import_rows_batch on legacy_import_rows(batch_id);

alter table legacy_import_batches enable row level security;
alter table legacy_import_rows enable row level security;

drop policy if exists legacy_import_batches_read on legacy_import_batches;
create policy legacy_import_batches_read on legacy_import_batches
  for select using (get_my_role() in ('owner', 'operations_manager'));

drop policy if exists legacy_import_rows_read on legacy_import_rows;
create policy legacy_import_rows_read on legacy_import_rows
  for select using (get_my_role() in ('owner', 'operations_manager'));

-- ----------------------------------------------------------------------------
-- 5. import_legacy_resident_booking() - the only place a null mobile,
--    null ID proof, or null end_date is ever inserted. create_booking is
--    completely unchanged and remains the only path for new bookings
--    created through the normal application UI.
-- ----------------------------------------------------------------------------

create or replace function import_legacy_resident_booking(
  p_batch_id bigint,
  p_bed_id bigint,
  p_full_name text,
  p_mobile_number text,
  p_monthly_rent numeric,
  p_security_deposit numeric,
  p_start_date date,
  p_source_row_number int,
  p_room_no int,
  p_bed_no int
) returns table(resident_id bigint, booking_id bigint) as $$
declare
  v_resident_id bigint;
  v_booking_id bigint;
begin
  perform require_role(array['owner', 'operations_manager']);

  if p_full_name is null or trim(p_full_name) = '' then
    raise exception 'Resident name is required (row %)', p_source_row_number;
  end if;

  if p_mobile_number is not null and trim(p_mobile_number) !~ '^[0-9]{10}$' then
    raise exception 'Invalid mobile number format (row %): %', p_source_row_number, p_mobile_number;
  end if;

  if p_start_date is null then
    raise exception 'Joining date is required (row %)', p_source_row_number;
  end if;

  if p_monthly_rent is null or p_monthly_rent < 0 then
    raise exception 'Monthly rent must be valid (row %)', p_source_row_number;
  end if;

  if exists (
    select 1 from bookings b
    where b.bed_id = p_bed_id and b.status in ('confirmed', 'checked_in')
  ) then
    raise exception 'Bed % already has an active booking (row %)', p_bed_id, p_source_row_number;
  end if;

  insert into residents (full_name, mobile_number, notes)
  values (
    trim(p_full_name),
    nullif(trim(p_mobile_number), ''),
    'Imported resident - source=hostel_a_excel_import'
  )
  returning id into v_resident_id;

  insert into bookings (
    resident_id, bed_id, start_date, end_date, monthly_rent, security_deposit, status
  ) values (
    v_resident_id, p_bed_id, p_start_date, null, p_monthly_rent, p_security_deposit, 'confirmed'
  )
  returning id into v_booking_id;

  insert into legacy_import_rows (
    batch_id, source_row_number, room_no, bed_no, bed_id, resident_id, booking_id, outcome
  ) values (
    p_batch_id, p_source_row_number, p_room_no, p_bed_no, p_bed_id, v_resident_id, v_booking_id, 'created'
  );

  return query select v_resident_id, v_booking_id;
end;
$$ language plpgsql security definer set search_path to 'public';

commit;
