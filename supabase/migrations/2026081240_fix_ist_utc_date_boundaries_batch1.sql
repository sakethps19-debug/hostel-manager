-- ============================================================================
-- IST/UTC date-boundary fix (1/2).
--
-- The database's session timezone is UTC (confirmed live: `show timezone`
-- = UTC), so bare `current_date` evaluates in UTC, not India Standard
-- Time. IST is UTC+5:30, so there is a ~5.5 hour window every night
-- (roughly 18:30-23:59 UTC, i.e. 00:00-05:29 IST the next calendar day)
-- where UTC's "today" is already YESTERDAY in India. Every function below
-- used bare `current_date` for "is this booking active today" / "record
-- today's date" logic that flips at midnight - during that window they
-- silently used the wrong calendar day. The rest of the codebase already
-- has an established, correct convention for this
-- ((now() AT TIME ZONE 'Asia/Kolkata')::date, used throughout
-- get_today_snapshot, get_todays_checkins, capture_daily_occupancy_
-- snapshot_if_missing, etc.) - these functions were simply inconsistent
-- with it. Every bare current_date reference (case-insensitive, including
-- inside DEFAULT parameter clauses) is replaced with that same expression;
-- no other logic changes.
--
-- Functions in this batch: cancel_booking, finalize_settlement,
-- finalize_settlement_and_vacate, get_available_beds,
-- get_available_beds_for_period, get_booking_ledger,
-- get_future_booking_for_bed, get_hostel_bed_grid,
-- get_hostel_metrics_snapshot, get_hostel_rooms, get_operational_alerts,
-- get_rent_dashboard_summary, get_rent_ledger_all.
-- ============================================================================
begin;

CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id bigint, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_start date;
  v_status text;
begin
  perform require_role(array['owner','operations_manager']);

  select start_date, status into v_start, v_status
  from bookings
  where id = p_booking_id;

  if v_status is null then
    raise exception 'Booking % not found', p_booking_id;
  end if;

  if v_status <> 'confirmed' then
    raise exception 'Only a confirmed (not yet checked-in) booking can be cancelled this way. Current status: %', v_status;
  end if;

  if v_start <= (now() AT TIME ZONE 'Asia/Kolkata')::date then
    raise exception 'This booking has already started and cannot be cancelled as a reservation. Use Vacate / Final Settlement instead.';
  end if;

  update bookings
  set status = 'cancelled',
      cancellation_reason = p_reason
  where id = p_booking_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_settlement(p_booking_id bigint, p_other_charges numeric, p_deductions jsonb, p_notes text)
 RETURNS TABLE(settlement_id bigint, refund_amount numeric, final_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ledger record;
  v_deposit_received numeric;
  v_deposit_refunded numeric;
  v_deposit_held numeric;
  v_deductions_total numeric := 0;
  v_refund numeric;
  v_final numeric;
  v_settlement_id bigint;
  v_other_charges numeric;
  v_item jsonb;
  v_existing_settlement_id bigint;
  v_resident_id bigint;
  v_receipt text;
  v_outstanding_rent numeric;
begin
  perform require_role(array['owner','operations_manager']);

  select id into v_existing_settlement_id from settlements where booking_id = p_booking_id;
  if v_existing_settlement_id is not null then
    raise exception 'This booking already has a settlement recorded';
  end if;

  select * into v_ledger from get_booking_ledger(p_booking_id);
  v_outstanding_rent := greatest(v_ledger.balance_outstanding, 0);

  select coalesce(sum(p.amount), 0) into v_deposit_received
  from payments p
  where p.booking_id = p_booking_id and p.payment_type = 'Security Deposit' and p.status = 'active';

  select coalesce(sum(p.amount), 0) into v_deposit_refunded
  from payments p
  where p.booking_id = p_booking_id and p.payment_type = 'Deposit Refund' and p.status = 'active';

  v_deposit_held := v_deposit_received - v_deposit_refunded;

  v_other_charges := coalesce(p_other_charges, 0);

  if p_deductions is not null then
    for v_item in select * from jsonb_array_elements(p_deductions)
    loop
      v_deductions_total := v_deductions_total + coalesce((v_item->>'amount')::numeric, 0);
    end loop;
  end if;

  v_final := v_deposit_held - v_outstanding_rent - v_other_charges - v_deductions_total;
  v_refund := greatest(v_final, 0);

  insert into settlements (
    booking_id, outstanding_rent, other_charges, deposit_held,
    deductions_total, refund_amount, final_balance, notes
  )
  values (
    p_booking_id, v_outstanding_rent, v_other_charges, v_deposit_held,
    v_deductions_total, v_refund, v_final, nullif(trim(p_notes), '')
  )
  returning id into v_settlement_id;

  if p_deductions is not null then
    for v_item in select * from jsonb_array_elements(p_deductions)
    loop
      insert into settlement_deductions (settlement_id, category, amount, notes)
      values (
        v_settlement_id,
        v_item->>'category',
        coalesce((v_item->>'amount')::numeric, 0),
        nullif(trim(v_item->>'notes'), '')
      );
    end loop;
  end if;

  if v_refund > 0 then
    select resident_id into v_resident_id from bookings where id = p_booking_id;
    v_receipt := 'VNR-' || extract(year from (now() AT TIME ZONE 'Asia/Kolkata')::date)::text || '-' || lpad(nextval('payments_receipt_seq')::text, 4, '0');

    insert into payments (
      booking_id, resident_id, amount, payment_date, payment_type, payment_mode, notes, receipt_number
    )
    values (
      p_booking_id, v_resident_id, v_refund, (now() AT TIME ZONE 'Asia/Kolkata')::date, 'Deposit Refund', 'Cash',
      'Auto-recorded from final settlement', v_receipt
    );
  end if;

  return query select v_settlement_id, v_refund, v_final;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_settlement_and_vacate(p_booking_id bigint, p_other_charges numeric, p_deductions jsonb, p_notes text)
 RETURNS TABLE(settlement_id bigint, refund_amount numeric, final_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ledger record;
  v_deposit_received numeric;
  v_deposit_refunded numeric;
  v_deposit_held numeric;
  v_deductions_total numeric := 0;
  v_refund numeric;
  v_final numeric;
  v_settlement_id bigint;
  v_other_charges numeric;
  v_item jsonb;
  v_existing_settlement_id bigint;
  v_resident_id bigint;
  v_receipt text;
  v_outstanding_rent numeric;
begin
  perform require_role(array['owner','operations_manager']);

  select id into v_existing_settlement_id from settlements where booking_id = p_booking_id;
  if v_existing_settlement_id is not null then
    raise exception 'This booking already has a settlement recorded';
  end if;

  select * into v_ledger from get_booking_ledger(p_booking_id);
  v_outstanding_rent := greatest(v_ledger.balance_outstanding, 0);

  select coalesce(sum(p.amount), 0) into v_deposit_received
  from payments p
  where p.booking_id = p_booking_id and p.payment_type = 'Security Deposit' and p.status = 'active';

  select coalesce(sum(p.amount), 0) into v_deposit_refunded
  from payments p
  where p.booking_id = p_booking_id and p.payment_type = 'Deposit Refund' and p.status = 'active';

  v_deposit_held := v_deposit_received - v_deposit_refunded;

  v_other_charges := coalesce(p_other_charges, 0);

  if p_deductions is not null then
    for v_item in select * from jsonb_array_elements(p_deductions)
    loop
      v_deductions_total := v_deductions_total + coalesce((v_item->>'amount')::numeric, 0);
    end loop;
  end if;

  v_final := v_deposit_held - v_outstanding_rent - v_other_charges - v_deductions_total;
  v_refund := greatest(v_final, 0);

  insert into settlements (
    booking_id, outstanding_rent, other_charges, deposit_held,
    deductions_total, refund_amount, final_balance, notes
  )
  values (
    p_booking_id, v_outstanding_rent, v_other_charges, v_deposit_held,
    v_deductions_total, v_refund, v_final, nullif(trim(p_notes), '')
  )
  returning id into v_settlement_id;

  if p_deductions is not null then
    for v_item in select * from jsonb_array_elements(p_deductions)
    loop
      insert into settlement_deductions (settlement_id, category, amount, notes)
      values (
        v_settlement_id,
        v_item->>'category',
        coalesce((v_item->>'amount')::numeric, 0),
        nullif(trim(v_item->>'notes'), '')
      );
    end loop;
  end if;

  if v_refund > 0 then
    select resident_id into v_resident_id from bookings where id = p_booking_id;
    v_receipt := 'VNR-' || extract(year from (now() AT TIME ZONE 'Asia/Kolkata')::date)::text || '-' || lpad(nextval('payments_receipt_seq')::text, 4, '0');

    insert into payments (
      booking_id, resident_id, amount, payment_date, payment_type, payment_mode, notes, receipt_number
    )
    values (
      p_booking_id, v_resident_id, v_refund, (now() AT TIME ZONE 'Asia/Kolkata')::date, 'Deposit Refund', 'Cash',
      'Auto-recorded from final settlement', v_receipt
    );
  end if;

  update bookings
  set
    status = 'completed',
    end_date = least(end_date, (now() AT TIME ZONE 'Asia/Kolkata')::date)
  where id = p_booking_id
    and status in ('confirmed', 'checked_in');

  if not found then
    raise exception 'Active booking not found';
  end if;

  return query select v_settlement_id, v_refund, v_final;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_available_beds(p_hostel_name text DEFAULT NULL::text)
 RETURNS TABLE(bed_id bigint, bed_number text, bed_code text, hostel_name text, floor_number integer, floor_name text, room_number text, sharing_type integer, monthly_rent numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
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
          and p.effective_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date
          and (
            p.effective_to is null
            or p.effective_to >= (now() AT TIME ZONE 'Asia/Kolkata')::date
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
    and (now() AT TIME ZONE 'Asia/Kolkata')::date >= bk.start_date and (bk.end_date is null or (now() AT TIME ZONE 'Asia/Kolkata')::date <= bk.end_date)
  where h.is_active = true
    and r.status = 'active'
    and b.status = 'active'
    and bk.id is null
    and (p_hostel_name is null or h.name = p_hostel_name)
  order by h.name, f.floor_number, r.room_number, b.bed_number;
$function$;

CREATE OR REPLACE FUNCTION public.get_available_beds_for_period(p_start_date date, p_end_date date)
 RETURNS TABLE(bed_id bigint, bed_number text, bed_code text, hostel_name text, floor_number integer, floor_name text, room_number text, sharing_type integer, monthly_rent numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
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
          and p.effective_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date
          and (p.effective_to is null or p.effective_to >= (now() AT TIME ZONE 'Asia/Kolkata')::date)
        order by p.effective_from desc
        limit 1
      ),
      0
    ) as monthly_rent
  from beds b
  join rooms r on r.id = b.room_id
  join floors f on f.id = r.floor_id
  join hostels h on h.id = f.hostel_id
  where b.status = 'active'
    and h.is_active = true
    and r.status = 'active'
    and not exists (
      select 1
      from bookings bk
      where bk.bed_id = b.id
        and bk.status in ('confirmed', 'checked_in')
        and daterange(bk.start_date, coalesce(bk.end_date, 'infinity'::date), '[]')
            && daterange(p_start_date, coalesce(p_end_date, 'infinity'::date), '[]')
    )
  order by h.name, f.floor_number, r.room_number, b.bed_number;
$function$;

CREATE OR REPLACE FUNCTION public.get_booking_ledger(p_booking_id bigint)
 RETURNS TABLE(booking_id bigint, monthly_rent numeric, months_elapsed integer, amount_due numeric, amount_paid numeric, balance_outstanding numeric, last_payment_date date, payment_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_start date;
  v_end date;
  v_rent numeric;
  v_effective_end date;
  v_months integer;
  v_paid numeric;
  v_last date;
  v_status text;
  v_start_index integer;
  v_end_index integer;
  v_amount_due numeric := 0;
  v_prev_boundary integer;
  v_rev_index integer;
  v_seg_months integer;
  v_rev record;
begin
  perform require_role(array['owner','operations_manager','finance_manager']);
  select b.start_date, b.end_date, b.monthly_rent
  into v_start, v_end, v_rent
  from bookings b where b.id = p_booking_id;

  if not found then
    raise exception 'Booking not found';
  end if;

  v_effective_end := least((now() AT TIME ZONE 'Asia/Kolkata')::date, v_end);

  v_months := (extract(year from v_effective_end)::int - extract(year from v_start)::int) * 12
            + (extract(month from v_effective_end)::int - extract(month from v_start)::int) + 1;

  if v_months < 0 then
    v_months := 0;
  end if;

  v_start_index := extract(year from v_start)::int * 12 + extract(month from v_start)::int;
  v_end_index := extract(year from v_effective_end)::int * 12 + extract(month from v_effective_end)::int;
  v_prev_boundary := v_start_index;

  for v_rev in
    select rr.effective_date, rr.previous_rent
    from rent_revisions rr
    where rr.booking_id = p_booking_id
    order by rr.effective_date asc
  loop
    v_rev_index := extract(year from v_rev.effective_date)::int * 12 + extract(month from v_rev.effective_date)::int;

    if v_rev_index > v_prev_boundary then
      v_seg_months := least(v_rev_index, v_end_index + 1) - v_prev_boundary;

      if v_seg_months > 0 then
        v_amount_due := v_amount_due + (v_seg_months * v_rev.previous_rent);
      end if;

      v_prev_boundary := v_rev_index;
    end if;
  end loop;

  if v_prev_boundary <= v_end_index then
    v_amount_due := v_amount_due + ((v_end_index - v_prev_boundary + 1) * v_rent);
  end if;

  if v_months = 0 then
    v_amount_due := 0;
  end if;

  select coalesce(sum(p.amount), 0), max(p.payment_date)
  into v_paid, v_last
  from payments p
  where p.booking_id = p_booking_id
    and p.payment_type = 'Monthly Rent'
    and p.status = 'active';

  if v_paid > v_amount_due then
    v_status := 'Advance Paid';
  elsif v_paid >= v_amount_due and v_months > 0 then
    v_status := 'Paid';
  elsif v_paid > 0 then
    v_status := 'Partially Paid';
  elsif v_months > 0 then
    v_status := 'Overdue';
  else
    v_status := 'Due';
  end if;

  return query select
    p_booking_id,
    v_rent,
    v_months,
    v_amount_due::numeric,
    v_paid::numeric,
    (v_amount_due - v_paid)::numeric,
    v_last,
    v_status;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_future_booking_for_bed(p_bed_id bigint)
 RETURNS TABLE(booking_id bigint, full_name text, mobile_number text, start_date date, end_date date, monthly_rent numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
  select b.id as booking_id, r.full_name, r.mobile_number, b.start_date, b.end_date, b.monthly_rent
  from bookings b
  join residents r on r.id = b.resident_id
  where b.bed_id = p_bed_id
    and b.status = 'confirmed'
    and b.start_date > (now() AT TIME ZONE 'Asia/Kolkata')::date
  order by b.start_date asc
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_hostel_bed_grid(p_hostel_name text)
 RETURNS TABLE(bed_id bigint, bed_code text, bed_number text, room_number text, floor_number integer, floor_name text, sharing_type integer, monthly_rent numeric, bed_status text, occupant_name text, notice_given_at date, is_future_booking boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
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
          and p.effective_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date
          and (p.effective_to is null or p.effective_to >= (now() AT TIME ZONE 'Asia/Kolkata')::date)
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
      and (now() AT TIME ZONE 'Asia/Kolkata')::date >= bk.start_date and (bk.end_date is null or (now() AT TIME ZONE 'Asia/Kolkata')::date <= bk.end_date)
    limit 1
  ) cur on true
  left join residents res on res.id = cur.resident_id
  left join lateral (
    select * from bookings bk2
    where bk2.bed_id = b.id
      and bk2.status in ('confirmed','checked_in')
      and bk2.start_date > (now() AT TIME ZONE 'Asia/Kolkata')::date
    order by bk2.start_date asc
    limit 1
  ) fut on cur.id is null
  where h.name = p_hostel_name
    and r.status = 'active'
  order by f.floor_number, r.room_number, b.bed_number;
$function$;

CREATE OR REPLACE FUNCTION public.get_hostel_metrics_snapshot()
 RETURNS TABLE(hostel_name text, total_beds bigint, occupied_beds bigint, occupancy_pct numeric, outstanding_rent_total numeric, deposits_held_total numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            and (now() AT TIME ZONE 'Asia/Kolkata')::date >= bk.start_date and (bk.end_date is null or (now() AT TIME ZONE 'Asia/Kolkata')::date <= bk.end_date)
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
$function$;

CREATE OR REPLACE FUNCTION public.get_hostel_rooms(p_hostel_name text)
 RETURNS TABLE(floor_number integer, floor_name text, room_number text, sharing_type integer, monthly_rent numeric, total_beds bigint, occupied_beds bigint, vacant_beds bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
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
          and p.effective_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date
          and (
            p.effective_to is null
            or p.effective_to >= (now() AT TIME ZONE 'Asia/Kolkata')::date
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
    and (now() AT TIME ZONE 'Asia/Kolkata')::date >= bk.start_date and (bk.end_date is null or (now() AT TIME ZONE 'Asia/Kolkata')::date <= bk.end_date)

  where h.name = p_hostel_name
    and h.is_active = true
    and r.status = 'active'

  group by
    h.id, f.floor_number, f.floor_name, r.id, r.room_number, r.sharing_type

  order by
    f.floor_number, r.room_number;
$function$;

CREATE OR REPLACE FUNCTION public.get_operational_alerts()
 RETURNS TABLE(overdue_rent_count bigint, vacating_7_days_count bigint, vacating_30_days_count bigint, deposit_pending_count bigint, missing_id_proof_count bigint, maintenance_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
  select
    (
      select count(*)
      from bookings b
      cross join lateral get_booking_ledger(b.id) l
      where b.status in ('confirmed', 'checked_in') and l.balance_outstanding > 0
    ) as overdue_rent_count,
    (
      select count(*)
      from bookings b
      where b.status in ('confirmed', 'checked_in')
        and coalesce(b.expected_vacate_date, b.end_date) between (now() AT TIME ZONE 'Asia/Kolkata')::date and (now() AT TIME ZONE 'Asia/Kolkata')::date + 7
    ) as vacating_7_days_count,
    (
      select count(*)
      from bookings b
      where b.status in ('confirmed', 'checked_in')
        and coalesce(b.expected_vacate_date, b.end_date) between (now() AT TIME ZONE 'Asia/Kolkata')::date and (now() AT TIME ZONE 'Asia/Kolkata')::date + 30
    ) as vacating_30_days_count,
    (
      select count(*)
      from bookings b
      cross join lateral get_deposit_summary(b.id) d
      where b.status in ('confirmed', 'checked_in') and d.deposit_balance > 0
    ) as deposit_pending_count,
    (
      select count(*)
      from bookings b
      join residents r on r.id = b.resident_id
      where b.status in ('confirmed', 'checked_in')
        and (r.id_proof_number is null or trim(r.id_proof_number) = '')
    ) as missing_id_proof_count,
    (
      select count(*) from bed_maintenance where status = 'open'
    ) as maintenance_count;
$function$;

CREATE OR REPLACE FUNCTION public.get_rent_dashboard_summary()
 RETURNS TABLE(rent_due_this_month numeric, rent_collected_this_month numeric, outstanding_total numeric, overdue_residents_count bigint, security_deposit_agreed_total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_due_this_month numeric;
  v_collected_this_month numeric;
  v_outstanding numeric := 0;
  v_overdue_count bigint := 0;
  v_deposit_total numeric;
  r record;
  v_ledger record;
begin
  perform require_role(array['owner','operations_manager','finance_manager']);
  select coalesce(sum(monthly_rent), 0)
  into v_due_this_month
  from bookings
  where status in ('confirmed', 'checked_in')
    and (now() AT TIME ZONE 'Asia/Kolkata')::date >= start_date and (end_date is null or (now() AT TIME ZONE 'Asia/Kolkata')::date <= end_date);

  select coalesce(sum(amount), 0)
  into v_collected_this_month
  from payments
  where payment_type = 'Monthly Rent'
    and status = 'active'
    and date_trunc('month', payment_date) = date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')::date);

  select coalesce(sum(security_deposit), 0)
  into v_deposit_total
  from bookings
  where status in ('confirmed', 'checked_in')
    and (now() AT TIME ZONE 'Asia/Kolkata')::date >= start_date and (end_date is null or (now() AT TIME ZONE 'Asia/Kolkata')::date <= end_date);

  for r in
    select id from bookings
    where status in ('confirmed', 'checked_in')
      and (now() AT TIME ZONE 'Asia/Kolkata')::date >= start_date and (end_date is null or (now() AT TIME ZONE 'Asia/Kolkata')::date <= end_date)
  loop
    select * into v_ledger from get_booking_ledger(r.id);
    v_outstanding := v_outstanding + greatest(v_ledger.balance_outstanding, 0);
    if v_ledger.payment_status = 'Overdue' then
      v_overdue_count := v_overdue_count + 1;
    end if;
  end loop;

  return query select v_due_this_month, v_collected_this_month, v_outstanding, v_overdue_count, v_deposit_total;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_rent_ledger_all()
 RETURNS TABLE(booking_id bigint, resident_id bigint, full_name text, mobile_number text, hostel_name text, room_number text, bed_id bigint, bed_code text, monthly_rent numeric, months_elapsed integer, amount_due numeric, amount_paid numeric, balance_outstanding numeric, last_payment_date date, payment_status text, start_date date, end_date date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      and (now() AT TIME ZONE 'Asia/Kolkata')::date >= bk.start_date
      and (bk.end_date is null or (now() AT TIME ZONE 'Asia/Kolkata')::date <= bk.end_date)
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
$function$;

commit;
