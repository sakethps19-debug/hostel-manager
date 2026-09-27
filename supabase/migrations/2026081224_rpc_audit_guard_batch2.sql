-- P0 Security Hardening Sprint: RPC authorization audit remediation (2/5).
-- See 2026081223_rpc_audit_guard_batch1.sql for full rationale.
begin;

CREATE OR REPLACE FUNCTION public.get_deposit_summary(p_booking_id bigint)
 RETURNS TABLE(deposit_agreed numeric, deposit_received numeric, deposit_refunded numeric, deposit_balance numeric, deposit_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_agreed numeric;
  v_received numeric;
  v_refunded numeric;
  v_status text;
begin
  perform require_role(array['owner','operations_manager','finance_manager']);
  select coalesce(bk.security_deposit, 0) into v_agreed
  from bookings bk where bk.id = p_booking_id;

  select coalesce(sum(p.amount), 0) into v_received
  from payments p
  where p.booking_id = p_booking_id and p.payment_type = 'Security Deposit' and p.status = 'active';

  select coalesce(sum(p.amount), 0) into v_refunded
  from payments p
  where p.booking_id = p_booking_id and p.payment_type = 'Deposit Refund' and p.status = 'active';

  if v_agreed = 0 then
    v_status := 'Not Applicable';
  elsif v_received = 0 then
    v_status := 'Deposit Expected';
  elsif v_refunded >= v_received and v_received > 0 then
    v_status := 'Refunded';
  elsif v_refunded > 0 then
    v_status := 'Partially Refunded';
  elsif v_received < v_agreed then
    v_status := 'Partially Received';
  else
    v_status := 'Held';
  end if;

  return query select v_agreed, v_received, v_refunded, (v_received - v_refunded), v_status;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_asset_condition(p_asset_id bigint, p_condition text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform require_role(array['owner','operations_manager','finance_manager']);
  update assets set condition = p_condition where asset_id = p_asset_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_booking_no_show(p_booking_id integer, p_no_show_date date, p_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  perform require_role(array['owner','operations_manager']);
  UPDATE bookings
  SET
    status = 'no_show',
    no_show_date = COALESCE(p_no_show_date, (now() AT TIME ZONE 'Asia/Kolkata')::date),
    no_show_notes = p_notes
  WHERE id = p_booking_id
    AND status = 'confirmed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % is not a confirmed future reservation.', p_booking_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_resident_tag(p_resident_id integer, p_tag_label text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tag_id bigint;
BEGIN
  perform require_role(array['owner','operations_manager']);
  INSERT INTO resident_tags (resident_id, tag_label, created_by)
  VALUES (p_resident_id, trim(p_tag_label), auth.uid())
  ON CONFLICT (resident_id, tag_label) DO UPDATE SET tag_label = EXCLUDED.tag_label
  RETURNING id INTO v_tag_id;

  RETURN v_tag_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_resident_tag(p_tag_id bigint)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  DELETE FROM resident_tags WHERE id = p_tag_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_emergency_directory()
 RETURNS TABLE(resident_id integer, full_name text, hostel_name text, floor_number integer, floor_name text, room_number text, bed_code text, bed_number text, mobile_number text, emergency_contact_name text, emergency_contact_mobile text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  SELECT
    res.id,
    res.full_name,
    h.name,
    f.floor_number,
    f.floor_name,
    r.room_number,
    bd.bed_code,
    bd.bed_number,
    res.mobile_number,
    res.emergency_contact_name,
    COALESCE(res.emergency_contact_mobile, res.emergency_contact)
  FROM bookings b
  JOIN residents res ON res.id = b.resident_id
  JOIN beds bd ON bd.id = b.bed_id
  JOIN rooms r ON r.id = bd.room_id
  JOIN floors f ON f.id = r.floor_id
  JOIN hostels h ON h.id = f.hostel_id
  WHERE b.status IN ('confirmed', 'checked_in')
  ORDER BY h.name, f.floor_number, r.room_number, bd.bed_number;
$function$;

CREATE OR REPLACE FUNCTION public.get_resident_document_expiries(p_resident_id integer)
 RETURNS TABLE(document_type text, expiry_date date, notes text, status text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  SELECT document_type, expiry_date, notes, status
  FROM resident_document_expiries
  WHERE resident_id = p_resident_id;
$function$;

CREATE OR REPLACE FUNCTION public.set_document_expiry(p_resident_id integer, p_document_type text, p_expiry_date date, p_notes text, p_status text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  INSERT INTO resident_document_expiries (resident_id, document_type, expiry_date, notes, status, updated_by, updated_at)
  VALUES (p_resident_id, p_document_type, p_expiry_date, p_notes, p_status, auth.uid(), now())
  ON CONFLICT (resident_id, document_type)
  DO UPDATE SET
    expiry_date = EXCLUDED.expiry_date,
    notes = EXCLUDED.notes,
    status = EXCLUDED.status,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();
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
          and p.effective_from <= current_date
          and (p.effective_to is null or p.effective_to >= current_date)
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

CREATE OR REPLACE FUNCTION public.get_enquiries()
 RETURNS TABLE(enquiry_id bigint, full_name text, mobile_number text, preferred_hostel text, preferred_sharing integer, budget numeric, expected_joining_date date, source text, notes text, status text, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  select
    e.id as enquiry_id, e.full_name, e.mobile_number, e.preferred_hostel, e.preferred_sharing,
    e.budget, e.expected_joining_date, e.source, e.notes, e.status, e.created_at
  from enquiries e
  order by
    case e.status
      when 'New' then 1
      when 'Follow-up' then 2
      when 'Visit Scheduled' then 3
      when 'Contacted' then 4
      when 'Converted' then 5
      when 'Lost' then 6
      else 7
    end,
    e.created_at desc;
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
$function$;

CREATE OR REPLACE FUNCTION public.get_rent_history(p_booking_id bigint)
 RETURNS TABLE(revision_id bigint, previous_rent numeric, new_rent numeric, effective_date date, reason text, notes text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
  select rr.id as revision_id, rr.previous_rent, rr.new_rent, rr.effective_date, rr.reason, rr.notes
  from rent_revisions rr
  where rr.booking_id = p_booking_id
  order by rr.effective_date desc;
$function$;

CREATE OR REPLACE FUNCTION public.get_todays_checkins()
 RETURNS TABLE(booking_id integer, bed_id integer, bed_number text, bed_code text, hostel_name text, floor_number integer, room_number text, resident_id integer, full_name text, mobile_number text, start_date date, monthly_rent numeric, booking_status text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
  SELECT
    b.id, bd.id, bd.bed_number, bd.bed_code, h.name, f.floor_number,
    r.room_number, res.id, res.full_name, res.mobile_number,
    b.start_date, b.monthly_rent, b.status
  FROM bookings b
  JOIN residents res ON res.id = b.resident_id
  JOIN beds bd ON bd.id = b.bed_id
  JOIN rooms r ON r.id = bd.room_id
  JOIN floors f ON f.id = r.floor_id
  JOIN hostels h ON h.id = f.hostel_id
  WHERE b.start_date = (now() AT TIME ZONE 'Asia/Kolkata')::date
    AND b.status IN ('confirmed', 'checked_in')
  ORDER BY h.name, r.room_number, bd.bed_number;
$function$;

CREATE OR REPLACE FUNCTION public.get_expiring_documents()
 RETURNS TABLE(resident_id integer, full_name text, hostel_name text, room_number text, bed_id integer, bed_code text, bed_number text, document_type text, expiry_date date)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  SELECT
    res.id, res.full_name, h.name, r.room_number, bd.id, bd.bed_code, bd.bed_number,
    e.document_type, e.expiry_date
  FROM resident_document_expiries e
  JOIN residents res ON res.id = e.resident_id
  JOIN bookings b ON b.resident_id = res.id AND b.status IN ('confirmed', 'checked_in')
  JOIN beds bd ON bd.id = b.bed_id
  JOIN rooms r ON r.id = bd.room_id
  JOIN floors f ON f.id = r.floor_id
  JOIN hostels h ON h.id = f.hostel_id
  WHERE e.expiry_date IS NOT NULL
    AND e.expiry_date <= (now() AT TIME ZONE 'Asia/Kolkata')::date + INTERVAL '30 days'
  ORDER BY e.expiry_date;
$function$;

CREATE OR REPLACE FUNCTION public.get_pending_police_verification_count()
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
  SELECT count(*)::int
  FROM resident_document_expiries e
  JOIN bookings b ON b.resident_id = e.resident_id AND b.status IN ('confirmed', 'checked_in')
  WHERE e.document_type = 'Police Verification'
    AND e.status IN ('Pending', 'Submitted');
$function$;

CREATE OR REPLACE FUNCTION public.capture_daily_occupancy_snapshot_if_missing()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
  INSERT INTO occupancy_snapshots (
    snapshot_date, hostel_name, total_beds, occupied_beds,
    vacant_beds, reserved_beds, maintenance_beds, occupancy_percent
  )
  SELECT
    (now() AT TIME ZONE 'Asia/Kolkata')::date,
    hostel_name,
    total_beds,
    occupied_beds,
    vacant_beds,
    reserved_beds,
    maintenance_beds,
    CASE WHEN total_beds = 0 THEN 0
         ELSE round((occupied_beds::numeric / total_beds) * 100, 1)
    END
  FROM get_hostel_dashboard()
  ON CONFLICT (snapshot_date, hostel_name) DO NOTHING;
$function$;

CREATE OR REPLACE FUNCTION public.get_occupancy_snapshots(p_hostel_name text, p_days integer)
 RETURNS TABLE(snapshot_date date, hostel_name text, total_beds integer, occupied_beds integer, vacant_beds integer, reserved_beds integer, maintenance_beds integer, occupancy_percent numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
  SELECT snapshot_date, hostel_name, total_beds, occupied_beds,
         vacant_beds, reserved_beds, maintenance_beds, occupancy_percent
  FROM occupancy_snapshots
  WHERE (p_hostel_name IS NULL OR hostel_name = p_hostel_name)
    AND snapshot_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date - (p_days || ' days')::interval
  ORDER BY snapshot_date DESC, hostel_name;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_complaint_escalation(p_escalation_id bigint, p_resolution_notes text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  UPDATE complaint_escalations
  SET resolved_at = now(),
      resolution_notes = p_resolution_notes
  WHERE id = p_escalation_id;
$function$;

CREATE OR REPLACE FUNCTION public.set_recurring_expense_template_active(p_template_id bigint, p_is_active boolean)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select accounting_require_role(array['owner','finance_manager']);
  UPDATE recurring_expense_templates
  SET is_active = p_is_active,
      updated_at = now()
  WHERE id = p_template_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_expense_approval_requests()
 RETURNS TABLE(request_id bigint, hostel_name text, category text, amount numeric, vendor text, justification text, status text, requested_by_name text, requested_at timestamp with time zone, reviewed_by_name text, reviewed_at timestamp with time zone, review_notes text, resulting_expense_recorded boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select accounting_require_role(array['owner','finance_manager']);
  SELECT
    r.id, r.hostel_name, r.category, r.amount, r.vendor, r.justification,
    r.status, req.full_name, r.requested_at, rev.full_name, r.reviewed_at,
    r.review_notes, r.resulting_expense_recorded
  FROM expense_approval_requests r
  LEFT JOIN profiles req ON req.id = r.requested_by
  LEFT JOIN profiles rev ON rev.id = r.reviewed_by
  ORDER BY
    CASE r.status WHEN 'Pending' THEN 0 ELSE 1 END,
    r.requested_at DESC;
$function$;

commit;
