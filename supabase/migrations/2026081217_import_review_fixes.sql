-- ============================================================================
-- Fixes found by an independent review of the Hostel A legacy import
-- ============================================================================
--
-- 1. get_hostel_metrics_snapshot()'s outstanding_rent_total/deposits_held_total
--    CTEs filtered `bk.status = 'checked_in'` only - a pre-existing detail,
--    unchanged by the prior migration's fix to this function (which only
--    touched the separate occupied_beds CTE's null-end_date bug). Since
--    nothing in this app has ever set a booking to 'checked_in' (confirmed
--    by searching the whole repo for any write path - there is none;
--    create_booking always inserts 'confirmed', and every other occupancy
--    function in this same file already treats 'confirmed' and
--    'checked_in' as equally "active"), these two totals have always
--    under-reported as 0 for every hostel, not just Hostel A. Fixed to
--    match the in ('confirmed','checked_in') convention used by every
--    sibling function in this file and this migration.
--
--    NOT changed here: the 'checked_in'-only gating on the Transfer flow
--    (transfer/page.tsx) and Complaints filing (complaints/new/page.tsx)
--    is a separate, pre-existing, whole-app product question (should a
--    resident need an explicit "check-in" step that doesn't currently
--    exist anywhere in the UI?) - outside the scope of an import fix and
--    left for a deliberate product decision rather than guessed at here.
--
-- 2. import_legacy_resident_booking() had no validation on p_security_deposit
--    (unlike update_booking_details, which rejects a negative value) -
--    added the same guard for consistency and defense against a data-entry
--    typo in a future import run.
--
-- 3. legacy_import_rows had no uniqueness constraint on
--    (batch_id, source_row_number) - a future import run reusing a source
--    row number against the wrong bed (operator error) would silently
--    create a second resident/booking from the same original record with
--    no signal in the audit trail. Added as a safeguard for future runs;
--    harmless now since the 108 existing rows are already unique on this
--    pair (one row per source Excel row, verified by the exact 108 count
--    already confirmed against source data).
-- ============================================================================

begin;

create or replace function get_hostel_metrics_snapshot()
returns table(hostel_name text, total_beds bigint, occupied_beds bigint, occupancy_pct numeric, outstanding_rent_total numeric, deposits_held_total numeric)
language sql
security definer
set search_path to 'public'
as $$
  with bed_counts as (
    select
      h.id as hostel_id,
      h.name as hostel_name,
      count(distinct b.id) as total_beds,
      count(distinct b.id) filter (
        where exists (
          select 1 from bookings bk
          where bk.bed_id = b.id
            and bk.status in ('confirmed', 'checked_in')
            and current_date >= bk.start_date and (bk.end_date is null or current_date <= bk.end_date)
        )
      ) as occupied_beds
    from hostels h
    join floors f on f.hostel_id = h.id
    join rooms r on r.floor_id = f.id
    join beds b on b.room_id = r.id
    where h.is_active = true and r.status = 'active' and b.status = 'active'
    group by h.id, h.name
  ),
  outstanding as (
    select f.hostel_id, sum(l.balance_outstanding) as outstanding_rent_total
    from bookings bk
    join beds b on b.id = bk.bed_id
    join rooms r on r.id = b.room_id
    join floors f on f.id = r.floor_id
    cross join lateral get_booking_ledger(bk.id) l
    where bk.status in ('confirmed', 'checked_in') and l.balance_outstanding > 0
    group by f.hostel_id
  ),
  deposits as (
    select f.hostel_id, sum(d.deposit_balance) as deposits_held_total
    from bookings bk
    join beds b on b.id = bk.bed_id
    join rooms r on r.id = b.room_id
    join floors f on f.id = r.floor_id
    cross join lateral get_deposit_summary(bk.id) d
    where bk.status in ('confirmed', 'checked_in') and d.deposit_balance > 0
    group by f.hostel_id
  )
  select
    bc.hostel_name,
    bc.total_beds,
    bc.occupied_beds,
    round(100.0 * bc.occupied_beds / nullif(bc.total_beds, 0), 1) as occupancy_pct,
    coalesce(o.outstanding_rent_total, 0) as outstanding_rent_total,
    coalesce(d.deposits_held_total, 0) as deposits_held_total
  from bed_counts bc
  left join outstanding o on o.hostel_id = bc.hostel_id
  left join deposits d on d.hostel_id = bc.hostel_id
  cross join (select require_role(array['owner','finance_manager'])) as guard
  order by bc.hostel_name;
$$;

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

  if p_security_deposit is not null and p_security_deposit < 0 then
    raise exception 'Security deposit cannot be negative (row %)', p_source_row_number;
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

alter table legacy_import_rows
  add constraint legacy_import_rows_batch_source_row_unique unique (batch_id, source_row_number);

commit;
