-- P0 Security Hardening Sprint: RPC authorization audit remediation (3/5).
-- See 2026081223_rpc_audit_guard_batch1.sql for full rationale.
begin;

CREATE OR REPLACE FUNCTION public.review_expense_approval_request(p_request_id bigint, p_status text, p_review_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request record;
BEGIN
  perform accounting_require_role(array['owner','finance_manager']);
  SELECT * INTO v_request FROM expense_approval_requests WHERE id = p_request_id;

  IF v_request IS NULL THEN
    RAISE EXCEPTION 'Request % not found.', p_request_id;
  END IF;

  UPDATE expense_approval_requests
  SET status = p_status,
      review_notes = p_review_notes,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = p_request_id;

  IF p_status = 'Approved' THEN
    PERFORM record_expense(
      p_hostel_name := v_request.hostel_name,
      p_expense_date := (now() AT TIME ZONE 'Asia/Kolkata')::date,
      p_category := v_request.category,
      p_amount := v_request.amount,
      p_vendor := v_request.vendor,
      p_payment_mode := 'Bank Transfer',
      p_reference_number := NULL,
      p_notes := 'Approved via expense approval request #' || p_request_id
    );

    UPDATE expense_approval_requests
    SET resulting_expense_recorded = true
    WHERE id = p_request_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_purchase_requests()
 RETURNS TABLE(request_id bigint, hostel_name text, item_description text, quantity integer, estimated_cost numeric, vendor_id bigint, vendor_name text, urgency text, justification text, status text, requested_by_name text, requested_at timestamp with time zone, reviewed_by_name text, reviewed_at timestamp with time zone, review_notes text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  SELECT
    r.id, r.hostel_name, r.item_description, r.quantity, r.estimated_cost,
    r.vendor_id, v.name, r.urgency, r.justification, r.status,
    req.full_name, r.requested_at, rev.full_name, r.reviewed_at, r.review_notes
  FROM purchase_requests r
  LEFT JOIN vendors v ON v.id = r.vendor_id
  LEFT JOIN profiles req ON req.id = r.requested_by
  LEFT JOIN profiles rev ON rev.id = r.reviewed_by
  ORDER BY
    CASE r.status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 WHEN 'Ordered' THEN 2 ELSE 3 END,
    CASE r.urgency WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 WHEN 'Normal' THEN 2 ELSE 3 END,
    r.requested_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.generate_due_recurring_expenses()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_template record;
  v_count integer := 0;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_month_start date := date_trunc('month', v_today)::date;
  v_expense_date date;
BEGIN
  perform accounting_require_role(array['owner','finance_manager']);
  FOR v_template IN
    SELECT * FROM recurring_expense_templates
    WHERE is_active = true
      AND day_of_month <= extract(day FROM v_today)
      AND (last_generated_for IS NULL OR last_generated_for < v_month_start)
  LOOP
    v_expense_date := make_date(
      extract(year FROM v_today)::int,
      extract(month FROM v_today)::int,
      v_template.day_of_month
    );

    PERFORM record_expense(
      p_hostel_name := v_template.hostel_name,
      p_expense_date := v_expense_date,
      p_category := v_template.category,
      p_amount := v_template.amount,
      p_vendor := v_template.vendor,
      p_payment_mode := v_template.payment_mode,
      p_reference_number := v_template.reference_number,
      p_notes := coalesce(v_template.notes, '') ||
        case when v_template.notes is null then '' else ' ' end ||
        '(auto-generated recurring expense)'
    );

    UPDATE recurring_expense_templates
    SET last_generated_for = v_month_start
    WHERE id = v_template.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_all_resident_tags()
 RETURNS TABLE(resident_id integer, tag_label text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  SELECT resident_id, tag_label FROM resident_tags;
$function$;

CREATE OR REPLACE FUNCTION public.mark_bed_ready(p_bed_id integer)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  UPDATE beds SET status = 'active' WHERE id = p_bed_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_room_beds(p_hostel_name text, p_room_number text)
 RETURNS TABLE(bed_id bigint, bed_number text, bed_code text, bed_status text, occupant_name text, booking_start date, booking_end date, monthly_rent numeric, notice_given_at date, expected_vacate_date date, is_future_booking boolean, future_start_date date)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
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
$function$;

CREATE OR REPLACE FUNCTION public.get_expense_budgets()
 RETURNS TABLE(budget_id bigint, category text, hostel_name text, monthly_budget_amount numeric, notes text, updated_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select accounting_require_role(array['owner','finance_manager']);
  SELECT id, category, hostel_name, monthly_budget_amount, notes, updated_at
  FROM expense_budgets
  ORDER BY hostel_name, category;
$function$;

CREATE OR REPLACE FUNCTION public.remove_booking_referral(p_booking_id integer)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  DELETE FROM booking_referrals WHERE booking_id = p_booking_id;
$function$;

CREATE OR REPLACE FUNCTION public.set_expense_budget(p_category text, p_hostel_name text, p_monthly_budget_amount numeric, p_notes text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id bigint;
BEGIN
  perform accounting_require_role(array['owner','finance_manager']);
  INSERT INTO expense_budgets (category, hostel_name, monthly_budget_amount, notes, updated_by, updated_at)
  VALUES (p_category, p_hostel_name, p_monthly_budget_amount, p_notes, auth.uid(), now())
  ON CONFLICT (category, (COALESCE(hostel_name, '')))
  DO UPDATE SET
    monthly_budget_amount = EXCLUDED.monthly_budget_amount,
    notes = EXCLUDED.notes,
    updated_by = EXCLUDED.updated_by,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
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
$function$;

CREATE OR REPLACE FUNCTION public.get_booking_referral(p_booking_id integer)
 RETURNS TABLE(booking_id integer, bed_id integer, referral_source_id bigint, referral_source_name text, source_type text, commission_amount numeric, notes text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  SELECT br.booking_id, b.bed_id, br.referral_source_id, rs.name, rs.source_type,
         br.commission_amount, br.notes
  FROM booking_referrals br
  JOIN referral_sources rs ON rs.id = br.referral_source_id
  JOIN bookings b ON b.id = br.booking_id
  WHERE br.booking_id = p_booking_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_feature_flags()
 RETURNS TABLE(key text, enabled boolean, description text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
  SELECT key, enabled, description FROM feature_flags ORDER BY key;
$function$;

CREATE OR REPLACE FUNCTION public.get_waitlist()
 RETURNS TABLE(waitlist_id bigint, full_name text, mobile_number text, preferred_hostel text, preferred_sharing integer, preferred_floor integer, budget numeric, expected_joining_date date, notes text, status text, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  select
    w.id as waitlist_id, w.full_name, w.mobile_number, w.preferred_hostel,
    w.preferred_sharing, w.preferred_floor, w.budget, w.expected_joining_date,
    w.notes, w.status, w.created_at
  from waitlist w
  order by
    case w.status when 'waiting' then 1 when 'matched' then 2 else 3 end,
    w.created_at asc;
$function$;

CREATE OR REPLACE FUNCTION public.create_bed_hold(p_bed_id integer, p_enquiry_id integer, p_prospect_name text, p_prospect_mobile text, p_hold_minutes integer, p_notes text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hold_id bigint;
BEGIN
  perform require_role(array['owner','operations_manager']);
  IF EXISTS (
    SELECT 1 FROM beds WHERE id = p_bed_id AND status <> 'active'
  ) THEN
    RAISE EXCEPTION 'Bed % is not currently available to hold.', p_bed_id;
  END IF;

  INSERT INTO bed_holds (
    bed_id, enquiry_id, prospect_name, prospect_mobile,
    hold_expiry_at, notes, created_by
  )
  VALUES (
    p_bed_id, p_enquiry_id, p_prospect_name, p_prospect_mobile,
    now() + make_interval(mins => p_hold_minutes), p_notes, auth.uid()
  )
  RETURNING id INTO v_hold_id;

  UPDATE beds SET status = 'held' WHERE id = p_bed_id;

  RETURN v_hold_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_bed_hold(p_bed_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  perform require_role(array['owner','operations_manager']);
  UPDATE bed_holds
  SET status = 'released'
  WHERE bed_id = p_bed_id AND status = 'active';

  UPDATE beds SET status = 'active' WHERE id = p_bed_id AND status = 'held';
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_booking_settlement(p_booking_id bigint)
 RETURNS TABLE(settlement_id bigint, settlement_date date, outstanding_rent numeric, other_charges numeric, deposit_held numeric, deductions_total numeric, refund_amount numeric, final_balance numeric, notes text, deductions jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  select
    s.id, s.settlement_date, s.outstanding_rent, s.other_charges, s.deposit_held,
    s.deductions_total, s.refund_amount, s.final_balance, s.notes,
    coalesce(
      (select jsonb_agg(jsonb_build_object('category', d.category, 'amount', d.amount, 'notes', d.notes))
       from settlement_deductions d where d.settlement_id = s.id),
      '[]'::jsonb
    ) as deductions
  from settlements s
  where s.booking_id = p_booking_id;
$function$;

CREATE OR REPLACE FUNCTION public.release_expired_holds()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  perform require_role(array['owner','operations_manager','finance_manager']);
  UPDATE beds b
  SET status = 'active'
  FROM bed_holds h
  WHERE h.bed_id = b.id
    AND h.status = 'active'
    AND h.hold_expiry_at < now()
    AND b.status = 'held';

  UPDATE bed_holds
  SET status = 'expired'
  WHERE status = 'active' AND hold_expiry_at < now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_active_bed_holds()
 RETURNS TABLE(hold_id bigint, bed_id integer, bed_code text, bed_number text, hostel_name text, room_number text, prospect_name text, prospect_mobile text, hold_start_at timestamp with time zone, hold_expiry_at timestamp with time zone, notes text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  SELECT
    h.id, h.bed_id, bd.bed_code, bd.bed_number, ho.name,
    r.room_number, h.prospect_name, h.prospect_mobile,
    h.hold_start_at, h.hold_expiry_at, h.notes
  FROM bed_holds h
  JOIN beds bd ON bd.id = h.bed_id
  JOIN rooms r ON r.id = bd.room_id
  JOIN floors f ON f.id = r.floor_id
  JOIN hostels ho ON ho.id = f.hostel_id
  WHERE h.status = 'active'
  ORDER BY h.hold_expiry_at;
$function$;

CREATE OR REPLACE FUNCTION public.get_booking_checklist(p_booking_id integer, p_checklist_type text)
 RETURNS TABLE(item_key text, is_checked boolean, checked_at timestamp with time zone, checked_by_name text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  SELECT
    c.item_key,
    c.is_checked,
    c.checked_at,
    p.full_name
  FROM booking_checklist_items c
  LEFT JOIN profiles p ON p.id = c.checked_by
  WHERE c.booking_id = p_booking_id
    AND c.checklist_type = p_checklist_type;
$function$;

CREATE OR REPLACE FUNCTION public.set_booking_checklist_item(p_booking_id integer, p_checklist_type text, p_item_key text, p_item_label text, p_is_checked boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  perform require_role(array['owner','operations_manager']);
  INSERT INTO booking_checklist_items (
    booking_id, checklist_type, item_key, item_label,
    is_checked, checked_at, checked_by, updated_at
  )
  VALUES (
    p_booking_id, p_checklist_type, p_item_key, p_item_label,
    p_is_checked,
    CASE WHEN p_is_checked THEN now() ELSE NULL END,
    CASE WHEN p_is_checked THEN auth.uid() ELSE NULL END,
    now()
  )
  ON CONFLICT (booking_id, checklist_type, item_key)
  DO UPDATE SET
    item_label = EXCLUDED.item_label,
    is_checked = EXCLUDED.is_checked,
    checked_at = CASE WHEN EXCLUDED.is_checked THEN now() ELSE NULL END,
    checked_by = CASE WHEN EXCLUDED.is_checked THEN auth.uid() ELSE NULL END,
    updated_at = now();
END;
$function$;

commit;
