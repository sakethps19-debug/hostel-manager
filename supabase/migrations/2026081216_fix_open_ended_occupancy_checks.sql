-- ============================================================================
-- Fix systemic "is this bed currently occupied" bug across 9 functions
-- ============================================================================
--
-- All 9 functions below used the pattern:
--   current_date between bk.start_date and bk.end_date
-- which evaluates to NULL (excluded) whenever end_date is null - a
-- pre-existing latent bug in every one of them, invisible until this
-- session's Hostel A legacy import created the first bookings with a
-- genuinely null end_date (open-ended/ongoing stays). Discovered by
-- systematically searching every function in the public schema for this
-- exact substring (`prosrc ilike '%between%start_date%end_date%'`), then
-- individually confirming each one against its real body rather than
-- assuming - two matches (get_general_ledger, get_journal_entries) turned
-- out to be false positives, matching on unrelated p_start_date/p_end_date
-- report-range parameters, and are correctly left untouched.
--
-- Fixed pattern, applied identically everywhere:
--   current_date >= start_date and (end_date is null or current_date <= end_date)
--
-- Every function below is reproduced with its EXACT prior body, changing
-- only this one condition (each occurrence, including the 3 separate ones
-- inside get_rent_dashboard_summary and the 2 inside get_hostel_dashboard).
-- Nothing else about their logic, columns, or role checks changes.
-- ============================================================================

begin;

create or replace function get_hostel_bed_grid(p_hostel_name text)
returns table(bed_id bigint, bed_code text, bed_number text, room_number text, floor_number integer, floor_name text, sharing_type integer, monthly_rent numeric, bed_status text, occupant_name text, notice_given_at date, is_future_booking boolean)
language sql
security definer
set search_path to 'public'
as $$
  select
    b.id as bed_id,
    b.bed_code,
    b.bed_number,
    r.room_number,
    f.floor_number,
    f.floor_name,
    r.sharing_type,
    coalesce(
      r.standard_rate,
      (
        select p.monthly_rent
        from pricing p
        where p.hostel_id = h.id
          and p.sharing_type = r.sharing_type
          and p.effective_from <= current_date
          and (p.effective_to is null or p.effective_to >= current_date)
        order by p.effective_from desc
        limit 1
      ), 0
    ) as monthly_rent,
    b.status as bed_status,
    res.full_name as occupant_name,
    cur.notice_given_at,
    (fut.id is not null) as is_future_booking
  from hostels h
  join floors f on f.hostel_id = h.id
  join rooms r on r.floor_id = f.id
  join beds b on b.room_id = r.id
  left join lateral (
    select * from bookings bk
    where bk.bed_id = b.id
      and bk.status in ('confirmed','checked_in')
      and current_date >= bk.start_date and (bk.end_date is null or current_date <= bk.end_date)
    limit 1
  ) cur on true
  left join residents res on res.id = cur.resident_id
  left join lateral (
    select * from bookings bk2
    where bk2.bed_id = b.id
      and bk2.status in ('confirmed','checked_in')
      and bk2.start_date > current_date
    order by bk2.start_date asc
    limit 1
  ) fut on cur.id is null
  where h.name = p_hostel_name
    and r.status = 'active'
  order by f.floor_number, r.room_number, b.bed_number;
$$;

create or replace function get_hostel_dashboard()
returns table(hostel_id bigint, hostel_name text, floors bigint, rooms bigint, total_beds bigint, occupied_beds bigint, vacant_beds bigint, vacating_soon_beds bigint, reserved_beds bigint, maintenance_beds bigint)
language sql
security definer
set search_path to 'public'
as $$
  with hostel_stats as (
    select
      h.id as hostel_id,
      h.name as hostel_name,

      count(distinct f.id) as floors,

      count(distinct r.id)
        filter (where r.status = 'active') as rooms,

      count(distinct b.id)
        filter (where b.status = 'active' and r.status = 'active') as total_beds,

      count(distinct b.id)
        filter (where b.status = 'active' and r.status = 'active' and bk.id is not null) as occupied_beds,

      count(distinct b.id)
        filter (where b.status = 'active' and r.status = 'active' and bk.id is not null and bk.notice_given_at is not null) as vacating_soon_beds,

      count(distinct b.id)
        filter (where r.status = 'active' and b.status <> 'active') as maintenance_beds

    from hostels h
    left join floors f on f.hostel_id = h.id
    left join rooms r on r.floor_id = f.id
    left join beds b on b.room_id = r.id
    left join bookings bk
      on bk.bed_id = b.id
      and bk.status in ('confirmed', 'checked_in')
      and current_date >= bk.start_date and (bk.end_date is null or current_date <= bk.end_date)
    where h.is_active = true
    group by h.id, h.name
  )
  select
    hs.hostel_id,
    hs.hostel_name,
    hs.floors,
    hs.rooms,
    hs.total_beds,
    hs.occupied_beds,
    (hs.total_beds - hs.occupied_beds) as vacant_beds,
    hs.vacating_soon_beds,
    (
      select count(*) from beds b2
      join rooms r2 on r2.id = b2.room_id
      join floors f2 on f2.id = r2.floor_id
      where f2.hostel_id = hs.hostel_id
        and b2.status = 'active' and r2.status = 'active'
        and not exists (
          select 1 from bookings bk3
          where bk3.bed_id = b2.id and bk3.status in ('confirmed','checked_in')
            and current_date >= bk3.start_date and (bk3.end_date is null or current_date <= bk3.end_date)
        )
        and exists (
          select 1 from bookings bk4
          where bk4.bed_id = b2.id and bk4.status in ('confirmed','checked_in')
            and bk4.start_date > current_date
        )
    ) as reserved_beds,
    hs.maintenance_beds
  from hostel_stats hs
  order by hs.hostel_name;
$$;

create or replace function get_hostel_rooms(p_hostel_name text)
returns table(floor_number integer, floor_name text, room_number text, sharing_type integer, monthly_rent numeric, total_beds bigint, occupied_beds bigint, vacant_beds bigint)
language sql
security definer
set search_path to 'public'
as $$
  select
    f.floor_number,
    f.floor_name,
    r.room_number,
    r.sharing_type,

    coalesce(
      r.standard_rate,
      (
        select p.monthly_rent
        from pricing p
        where p.hostel_id = h.id
          and p.sharing_type = r.sharing_type
          and p.effective_from <= current_date
          and (
            p.effective_to is null
            or p.effective_to >= current_date
          )
        order by p.effective_from desc
        limit 1
      ),
      0
    ) as monthly_rent,

    count(distinct b.id)
      filter (
        where b.status = 'active'
      ) as total_beds,

    count(distinct b.id)
      filter (
        where b.status = 'active'
          and bk.id is not null
      ) as occupied_beds,

    count(distinct b.id)
      filter (
        where b.status = 'active'
          and bk.id is null
      ) as vacant_beds

  from hostels h
  join floors f on f.hostel_id = h.id
  join rooms r on r.floor_id = f.id
  left join beds b on b.room_id = r.id
  left join bookings bk
    on bk.bed_id = b.id
    and bk.status in ('confirmed', 'checked_in')
    and current_date >= bk.start_date and (bk.end_date is null or current_date <= bk.end_date)

  where h.name = p_hostel_name
    and h.is_active = true
    and r.status = 'active'

  group by
    h.id, f.floor_number, f.floor_name, r.id, r.room_number, r.sharing_type

  order by
    f.floor_number, r.room_number;
$$;

create or replace function get_resident_details(p_bed_id bigint)
returns table(resident_id bigint, booking_id bigint, full_name text, mobile_number text, email text, emergency_contact text, id_proof_type text, id_proof_number text, home_address text, work_college_address text, notes text, start_date date, end_date date, monthly_rent numeric, security_deposit numeric, booking_status text, bed_number text, bed_code text, room_number text, floor_number integer, hostel_name text, notice_given_at date, expected_vacate_date date, notice_notes text)
language sql
security definer
set search_path to 'public'
as $$
  select
    res.id as resident_id,
    bk.id as booking_id,
    res.full_name,
    res.mobile_number,
    res.email,
    case when get_my_role() = 'finance_manager' then null else res.emergency_contact end,
    res.id_proof_type,
    case when get_my_role() = 'finance_manager' then mask_id_proof_number(res.id_proof_number) else res.id_proof_number end,
    case when get_my_role() = 'finance_manager' then null else res.home_address end,
    case when get_my_role() = 'finance_manager' then null else res.work_college_address end,
    case when get_my_role() = 'finance_manager' then null else res.notes end,
    bk.start_date,
    bk.end_date,
    bk.monthly_rent,
    bk.security_deposit,
    bk.status as booking_status,
    b.bed_number,
    b.bed_code,
    r.room_number,
    f.floor_number,
    h.name as hostel_name,
    bk.notice_given_at,
    bk.expected_vacate_date,
    bk.notice_notes
  from bookings bk
  join residents res on res.id = bk.resident_id
  join beds b on b.id = bk.bed_id
  join rooms r on r.id = b.room_id
  join floors f on f.id = r.floor_id
  join hostels h on h.id = f.hostel_id
  where bk.bed_id = p_bed_id
    and bk.status in ('confirmed', 'checked_in')
    and current_date >= bk.start_date and (bk.end_date is null or current_date <= bk.end_date)
  order by bk.start_date desc
  limit 1;
$$;

create or replace function get_room_beds(p_hostel_name text, p_room_number text)
returns table(bed_id bigint, bed_number text, bed_code text, bed_status text, occupant_name text, booking_start date, booking_end date, monthly_rent numeric, notice_given_at date, expected_vacate_date date, is_future_booking boolean, future_start_date date)
language sql
security definer
set search_path to 'public'
as $$
  select
    b.id as bed_id,
    b.bed_number,
    b.bed_code,
    b.status as bed_status,
    res.full_name as occupant_name,
    cur.start_date as booking_start,
    cur.end_date as booking_end,
    cur.monthly_rent,
    cur.notice_given_at,
    cur.expected_vacate_date,
    (fut.id is not null) as is_future_booking,
    fut.start_date as future_start_date
  from hostels h
  join floors f on f.hostel_id = h.id
  join rooms r on r.floor_id = f.id
  join beds b on b.room_id = r.id
  left join lateral (
    select *
    from bookings bk
    where bk.bed_id = b.id
      and bk.status in ('confirmed', 'checked_in')
      and current_date >= bk.start_date and (bk.end_date is null or current_date <= bk.end_date)
    limit 1
  ) cur on true
  left join residents res on res.id = cur.resident_id
  left join lateral (
    select *
    from bookings bk2
    where bk2.bed_id = b.id
      and bk2.status in ('confirmed', 'checked_in')
      and bk2.start_date > current_date
    order by bk2.start_date asc
    limit 1
  ) fut on cur.id is null
  where h.name = p_hostel_name
    and r.room_number = p_room_number
  order by b.bed_number;
$$;

create or replace function get_available_beds(p_hostel_name text default null::text)
returns table(bed_id bigint, bed_number text, bed_code text, hostel_name text, floor_number integer, floor_name text, room_number text, sharing_type integer, monthly_rent numeric)
language sql
security definer
set search_path to 'public'
as $$
  select
    b.id as bed_id,
    b.bed_number,
    b.bed_code,
    h.name as hostel_name,
    f.floor_number,
    f.floor_name,
    r.room_number,
    r.sharing_type,
    coalesce(
      r.standard_rate,
      (
        select p.monthly_rent
        from pricing p
        where p.hostel_id = h.id
          and p.sharing_type = r.sharing_type
          and p.effective_from <= current_date
          and (
            p.effective_to is null
            or p.effective_to >= current_date
          )
        order by p.effective_from desc
        limit 1
      ),
      0
    ) as monthly_rent
  from hostels h
  join floors f on f.hostel_id = h.id
  join rooms r on r.floor_id = f.id
  join beds b on b.room_id = r.id
  left join bookings bk
    on bk.bed_id = b.id
    and bk.status in ('confirmed', 'checked_in')
    and current_date >= bk.start_date and (bk.end_date is null or current_date <= bk.end_date)
  where h.is_active = true
    and r.status = 'active'
    and b.status = 'active'
    and bk.id is null
    and (p_hostel_name is null or h.name = p_hostel_name)
  order by h.name, f.floor_number, r.room_number, b.bed_number;
$$;

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
    where bk.status = 'checked_in' and l.balance_outstanding > 0
    group by f.hostel_id
  ),
  deposits as (
    select f.hostel_id, sum(d.deposit_balance) as deposits_held_total
    from bookings bk
    join beds b on b.id = bk.bed_id
    join rooms r on r.id = b.room_id
    join floors f on f.id = r.floor_id
    cross join lateral get_deposit_summary(bk.id) d
    where bk.status = 'checked_in' and d.deposit_balance > 0
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

create or replace function get_rent_dashboard_summary()
returns table(rent_due_this_month numeric, rent_collected_this_month numeric, outstanding_total numeric, overdue_residents_count bigint, security_deposit_agreed_total numeric)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_due_this_month numeric;
  v_collected_this_month numeric;
  v_outstanding numeric := 0;
  v_overdue_count bigint := 0;
  v_deposit_total numeric;
  r record;
  v_ledger record;
begin
  select coalesce(sum(monthly_rent), 0)
  into v_due_this_month
  from bookings
  where status in ('confirmed', 'checked_in')
    and current_date >= start_date and (end_date is null or current_date <= end_date);

  select coalesce(sum(amount), 0)
  into v_collected_this_month
  from payments
  where payment_type = 'Monthly Rent'
    and status = 'active'
    and date_trunc('month', payment_date) = date_trunc('month', current_date);

  select coalesce(sum(security_deposit), 0)
  into v_deposit_total
  from bookings
  where status in ('confirmed', 'checked_in')
    and current_date >= start_date and (end_date is null or current_date <= end_date);

  for r in
    select id from bookings
    where status in ('confirmed', 'checked_in')
      and current_date >= start_date and (end_date is null or current_date <= end_date)
  loop
    select * into v_ledger from get_booking_ledger(r.id);
    v_outstanding := v_outstanding + greatest(v_ledger.balance_outstanding, 0);
    if v_ledger.payment_status = 'Overdue' then
      v_overdue_count := v_overdue_count + 1;
    end if;
  end loop;

  return query select v_due_this_month, v_collected_this_month, v_outstanding, v_overdue_count, v_deposit_total;
end;
$$;

create or replace function get_waitlist_matches()
returns table(waitlist_id bigint, full_name text, mobile_number text, bed_id bigint, bed_code text, bed_number text, hostel_name text, room_number text, sharing_type integer, monthly_rent numeric)
language sql
security definer
set search_path to 'public'
as $$
  select
    w.id as waitlist_id,
    w.full_name,
    w.mobile_number,
    b.id as bed_id,
    b.bed_code,
    b.bed_number,
    h.name as hostel_name,
    r.room_number,
    r.sharing_type,
    pr.monthly_rent
  from waitlist w
  join beds b on b.status = 'active'
  join rooms r on r.id = b.room_id
  join floors f on f.id = r.floor_id
  join hostels h on h.id = f.hostel_id
  left join lateral (
    select p.monthly_rent
    from pricing p
    where p.hostel_id = h.id
      and p.sharing_type = r.sharing_type
      and p.effective_from <= current_date
      and (p.effective_to is null or p.effective_to >= current_date)
    order by p.effective_from desc
    limit 1
  ) pr on true
  where w.status = 'waiting'
    and h.is_active = true
    and r.status = 'active'
    and (w.preferred_hostel is null or w.preferred_hostel = h.name)
    and (w.preferred_sharing is null or w.preferred_sharing = r.sharing_type)
    and (w.preferred_floor is null or w.preferred_floor = f.floor_number)
    and not exists (
      select 1 from bookings bk
      where bk.bed_id = b.id
        and bk.status in ('confirmed', 'checked_in')
        and current_date >= bk.start_date and (bk.end_date is null or current_date <= bk.end_date)
    )
    and (w.budget is null or coalesce(pr.monthly_rent, 0) <= w.budget)
  order by w.created_at asc;
$$;

commit;
