-- ============================================================================
-- Vacant-bed double count.
--
-- get_hostel_dashboard computed vacant_beds as (total_beds - occupied_beds),
-- where total_beds only requires bed.status='active' and occupied_beds only
-- requires a CURRENT booking. A bed with no current booking but a
-- CONFIRMED FUTURE booking (i.e. legitimately "reserved", earmarked for an
-- incoming resident) is active and has no current booking, so it was
-- counted in vacant_beds AND separately reported again as reserved_beds -
-- the same physical bed shown as both "vacant" and "reserved"
-- simultaneously. A prospective walk-in resident would appear to have more
-- available beds than actually exist.
--
-- No production impact today (0 beds currently have a future booking,
-- verified via get_hostel_dashboard() itself: reserved_beds = 0 for all
-- three hostels), but the bug is real and would misreport the instant any
-- bed is booked ahead of its move-in date - a normal, expected workflow.
--
-- Fix: reserved_beds is now computed once, per-bed, in the same CTE as
-- total/occupied/maintenance (instead of a separate correlated subquery
-- duplicating the join), and vacant_beds subtracts it:
-- vacant_beds = total_beds - occupied_beds - reserved_beds. Maintenance/
-- held/cleaning beds were already correctly excluded from total_beds (any
-- bed.status other than 'active' is not counted at all), so this is the
-- only overlap that existed. capture_daily_occupancy_snapshot_if_missing
-- sources directly from get_hostel_dashboard(), so occupancy-history/
-- snapshots inherit the fix automatically - one canonical aggregation.
--
-- Verified live via a rolled-back transaction on real Hostel A data: before
-- the fix, adding a future-dated confirmed booking for a known-vacant bed
-- (A3013) left vacant_beds unchanged at 8 (double-counted). After the fix,
-- total_beds stayed 116, occupied_beds stayed 108 (future booking, not
-- current), vacant_beds correctly dropped to 7, reserved_beds correctly
-- rose to 1 - 108 + 7 + 1 + 0 = 116, no overlap.
-- ============================================================================
begin;

create or replace function get_hostel_dashboard()
returns table(hostel_id bigint, hostel_name text, floors bigint, rooms bigint, total_beds bigint, occupied_beds bigint, vacant_beds bigint, vacating_soon_beds bigint, reserved_beds bigint, maintenance_beds bigint)
language sql security definer set search_path to 'public' as $$
  select require_role(array['owner','operations_manager','finance_manager']);
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
        filter (where r.status = 'active' and b.status <> 'active') as maintenance_beds,

      count(distinct b.id)
        filter (
          where b.status = 'active' and r.status = 'active' and bk.id is null
            and exists (
              select 1 from bookings bkf
               where bkf.bed_id = b.id
                 and bkf.status in ('confirmed', 'checked_in')
                 and bkf.start_date > current_date
            )
        ) as reserved_beds

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
    (hs.total_beds - hs.occupied_beds - hs.reserved_beds) as vacant_beds,
    hs.vacating_soon_beds,
    hs.reserved_beds,
    hs.maintenance_beds
  from hostel_stats hs
  order by hs.hostel_name;
$$;

commit;
