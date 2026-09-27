-- P0 Security Hardening Sprint: RPC authorization audit remediation (4/5).
-- See 2026081223_rpc_audit_guard_batch1.sql for full rationale.
begin;

CREATE OR REPLACE FUNCTION public.start_bed_cleaning(p_bed_id integer)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  UPDATE beds SET status = 'cleaning' WHERE id = p_bed_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_monthly_finance_closes()
 RETURNS TABLE(close_id bigint, month integer, year integer, rent_revenue numeric, other_revenue numeric, operating_expenses numeric, net_surplus numeric, outstanding_rent_total numeric, deposits_held_total numeric, notes text, closed_by_name text, closed_at timestamp with time zone, reopened_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner']);
  SELECT
    c.id, c.month, c.year, c.rent_revenue, c.other_revenue,
    c.operating_expenses, c.net_surplus, c.outstanding_rent_total,
    c.deposits_held_total, c.notes, p.full_name, c.closed_at, c.reopened_at
  FROM monthly_finance_closes c
  LEFT JOIN profiles p ON p.id = c.closed_by
  ORDER BY c.year DESC, c.month DESC, c.closed_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_upcoming_vacancies(p_days integer DEFAULT 30)
 RETURNS TABLE(booking_id bigint, bed_id bigint, bed_number text, bed_code text, hostel_name text, floor_number integer, room_number text, resident_id bigint, full_name text, mobile_number text, end_date date, days_left integer, monthly_rent numeric, is_notice_given boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
  select
    bk.id as booking_id,
    b.id as bed_id,
    b.bed_number,
    b.bed_code,
    h.name as hostel_name,
    f.floor_number,
    r.room_number,
    res.id as resident_id,
    res.full_name,
    res.mobile_number,
    coalesce(bk.expected_vacate_date, bk.end_date) as end_date,
    (coalesce(bk.expected_vacate_date, bk.end_date) - current_date) as days_left,
    bk.monthly_rent,
    (bk.notice_given_at is not null) as is_notice_given
  from bookings bk
  join beds b
    on b.id = bk.bed_id
  join rooms r
    on r.id = b.room_id
  join floors f
    on f.id = r.floor_id
  join hostels h
    on h.id = f.hostel_id
  join residents res
    on res.id = bk.resident_id
  where bk.status in ('confirmed', 'checked_in')
    and coalesce(bk.expected_vacate_date, bk.end_date) >= current_date
    and coalesce(bk.expected_vacate_date, bk.end_date) <= current_date + p_days
  order by coalesce(bk.expected_vacate_date, bk.end_date) asc;
$function$;

CREATE OR REPLACE FUNCTION public.add_recurring_expense_template(p_hostel_name text, p_category text, p_amount numeric, p_vendor text, p_payment_mode text, p_reference_number text, p_notes text, p_day_of_month integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id bigint;
BEGIN
  perform accounting_require_role(array['owner','finance_manager']);
  INSERT INTO recurring_expense_templates (
    hostel_name, category, amount, vendor, payment_mode,
    reference_number, notes, day_of_month, created_by
  )
  VALUES (
    p_hostel_name, p_category, p_amount, p_vendor, p_payment_mode,
    p_reference_number, p_notes, p_day_of_month, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_recurring_expense_template(p_template_id bigint, p_hostel_name text, p_category text, p_amount numeric, p_vendor text, p_payment_mode text, p_reference_number text, p_notes text, p_day_of_month integer)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select accounting_require_role(array['owner','finance_manager']);
  UPDATE recurring_expense_templates
  SET hostel_name = p_hostel_name,
      category = p_category,
      amount = p_amount,
      vendor = p_vendor,
      payment_mode = p_payment_mode,
      reference_number = p_reference_number,
      notes = p_notes,
      day_of_month = p_day_of_month,
      updated_at = now()
  WHERE id = p_template_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_hostel_dashboard()
 RETURNS TABLE(hostel_id bigint, hostel_name text, floors bigint, rooms bigint, total_beds bigint, occupied_beds bigint, vacant_beds bigint, vacating_soon_beds bigint, reserved_beds bigint, maintenance_beds bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.get_resident_tags(p_resident_id integer)
 RETURNS TABLE(tag_id bigint, tag_label text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  SELECT id, tag_label
  FROM resident_tags
  WHERE resident_id = p_resident_id
  ORDER BY created_at;
$function$;

CREATE OR REPLACE FUNCTION public.get_booking_details(p_booking_id bigint)
 RETURNS TABLE(booking_id bigint, resident_id bigint, full_name text, mobile_number text, email text, emergency_contact text, id_proof_type text, id_proof_number text, home_address text, work_college_address text, notes text, hostel_name text, floor_number integer, room_number text, bed_number text, bed_code text, start_date date, end_date date, monthly_rent numeric, security_deposit numeric, booking_status text, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
  select
    bk.id,
    res.id,
    res.full_name,
    res.mobile_number,
    res.email,
    case when get_my_role() = 'finance_manager' then null else res.emergency_contact end,
    res.id_proof_type,
    case when get_my_role() = 'finance_manager' then mask_id_proof_number(res.id_proof_number) else res.id_proof_number end,
    case when get_my_role() = 'finance_manager' then null else res.home_address end,
    case when get_my_role() = 'finance_manager' then null else res.work_college_address end,
    case when get_my_role() = 'finance_manager' then null else res.notes end,
    h.name,
    f.floor_number,
    r.room_number,
    b.bed_number,
    b.bed_code,
    bk.start_date,
    bk.end_date,
    bk.monthly_rent,
    bk.security_deposit,
    bk.status,
    bk.created_at
  from bookings bk
  join residents res on res.id = bk.resident_id
  join beds b on b.id = bk.bed_id
  join rooms r on r.id = b.room_id
  join floors f on f.id = r.floor_id
  join hostels h on h.id = f.hostel_id
  where bk.id = p_booking_id
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_active_maintenance()
 RETURNS TABLE(maintenance_id bigint, bed_id bigint, bed_code text, bed_number text, room_number text, hostel_name text, reason text, start_date date, expected_completion_date date, cost numeric, notes text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  select
    bm.id as maintenance_id,
    bm.bed_id,
    b.bed_code,
    b.bed_number,
    r.room_number,
    h.name as hostel_name,
    bm.reason,
    bm.start_date,
    bm.expected_completion_date,
    bm.cost,
    bm.notes
  from bed_maintenance bm
  join beds b on b.id = bm.bed_id
  join rooms r on r.id = b.room_id
  join floors f on f.id = r.floor_id
  join hostels h on h.id = f.hostel_id
  where bm.status = 'open'
  order by bm.start_date asc;
$function$;

CREATE OR REPLACE FUNCTION public.get_all_payments_report(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
 RETURNS TABLE(payment_id integer, receipt_number text, payment_date date, payment_type text, amount numeric, payment_mode text, reference_number text, status text, resident_name text, mobile_number text, hostel_name text, room_number text, bed_code text, bed_number text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','finance_manager']);
  SELECT
    p.id,
    p.receipt_number,
    p.payment_date,
    p.payment_type,
    p.amount,
    p.payment_mode,
    p.reference_number,
    p.status,
    res.full_name,
    res.mobile_number,
    h.name,
    r.room_number,
    bd.bed_code,
    bd.bed_number
  FROM payments p
  JOIN bookings b ON b.id = p.booking_id
  JOIN residents res ON res.id = b.resident_id
  JOIN beds bd ON bd.id = b.bed_id
  JOIN rooms r ON r.id = bd.room_id
  JOIN floors f ON f.id = r.floor_id
  JOIN hostels h ON h.id = f.hostel_id
  WHERE (p_start_date IS NULL OR p.payment_date >= p_start_date)
    AND (p_end_date IS NULL OR p.payment_date <= p_end_date)
  ORDER BY p.payment_date DESC, p.id DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_booking_referrals()
 RETURNS TABLE(booking_id integer, bed_id integer, referral_source_id bigint, referral_source_name text, source_type text, commission_amount numeric, notes text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','finance_manager']);
  SELECT br.booking_id, b.bed_id, br.referral_source_id, rs.name, rs.source_type,
         br.commission_amount, br.notes
  FROM booking_referrals br
  JOIN referral_sources rs ON rs.id = br.referral_source_id
  JOIN bookings b ON b.id = br.booking_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_referral_performance()
 RETURNS TABLE(referral_source_id bigint, name text, source_type text, bookings_count bigint, active_bookings_count bigint, total_monthly_rent_value numeric, total_commission numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','finance_manager']);
  SELECT
    rs.id,
    rs.name,
    rs.source_type,
    count(br.booking_id),
    count(br.booking_id) FILTER (WHERE b.status IN ('confirmed', 'checked_in')),
    coalesce(sum(b.monthly_rent) FILTER (WHERE b.status IN ('confirmed', 'checked_in')), 0),
    coalesce(sum(br.commission_amount), 0)
  FROM referral_sources rs
  LEFT JOIN booking_referrals br ON br.referral_source_id = rs.id
  LEFT JOIN bookings b ON b.id = br.booking_id
  GROUP BY rs.id, rs.name, rs.source_type
  ORDER BY count(br.booking_id) DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_housekeeping_tasks()
 RETURNS TABLE(task_id bigint, hostel_name text, room_number text, bed_code text, bed_id integer, task_type text, description text, status text, assigned_to text, due_date date, completed_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  SELECT id, hostel_name, room_number, bed_code, bed_id, task_type,
         description, status, assigned_to, due_date, completed_at, created_at
  FROM housekeeping_tasks
  ORDER BY
    CASE status WHEN 'Pending' THEN 0 WHEN 'In Progress' THEN 1 ELSE 2 END,
    due_date NULLS LAST,
    created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.add_housekeeping_task(p_hostel_name text, p_room_number text, p_bed_code text, p_bed_id integer, p_task_type text, p_description text, p_assigned_to text, p_due_date date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id bigint;
BEGIN
  perform require_role(array['owner','operations_manager']);
  INSERT INTO housekeeping_tasks (
    hostel_name, room_number, bed_code, bed_id, task_type,
    description, assigned_to, due_date, created_by
  )
  VALUES (
    p_hostel_name, p_room_number, p_bed_code, p_bed_id, p_task_type,
    p_description, p_assigned_to, p_due_date, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_housekeeping_task_status(p_task_id bigint, p_status text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  UPDATE housekeeping_tasks
  SET status = p_status,
      completed_at = CASE WHEN p_status = 'Done' THEN now() ELSE NULL END
  WHERE id = p_task_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_complaint_escalations()
 RETURNS TABLE(escalation_id bigint, complaint_id integer, escalated_to text, reason text, escalated_by_name text, escalated_at timestamp with time zone, resolved_at timestamp with time zone, resolution_notes text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  SELECT
    ce.id, ce.complaint_id, ce.escalated_to, ce.reason,
    p.full_name, ce.escalated_at, ce.resolved_at, ce.resolution_notes
  FROM complaint_escalations ce
  LEFT JOIN profiles p ON p.id = ce.escalated_by
  ORDER BY ce.escalated_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.escalate_complaint(p_complaint_id integer, p_escalated_to text, p_reason text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id bigint;
BEGIN
  perform require_role(array['owner','operations_manager']);
  INSERT INTO complaint_escalations (complaint_id, escalated_to, reason, escalated_by)
  VALUES (p_complaint_id, p_escalated_to, p_reason, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_referral_source(p_name text, p_contact_number text, p_source_type text, p_notes text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id bigint;
BEGIN
  perform require_role(array['owner','operations_manager']);
  INSERT INTO referral_sources (name, contact_number, source_type, notes)
  VALUES (trim(p_name), p_contact_number, p_source_type, p_notes)
  ON CONFLICT (name) DO UPDATE SET
    contact_number = EXCLUDED.contact_number,
    source_type = EXCLUDED.source_type,
    notes = EXCLUDED.notes
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_audit_event(p_action text, p_entity_type text, p_entity_id bigint DEFAULT NULL::bigint, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
  v_user_name text;
  v_user_role text;
begin
  perform require_role(array['owner','operations_manager','finance_manager']);
  v_user_id := auth.uid();

  select full_name, role into v_user_name, v_user_role
  from profiles where id = v_user_id;

  insert into audit_log (action, entity_type, entity_id, details, user_id, user_name, user_role)
  values (p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb), v_user_id, v_user_name, v_user_role);
end;
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

  v_effective_end := least(current_date, v_end);

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

commit;
