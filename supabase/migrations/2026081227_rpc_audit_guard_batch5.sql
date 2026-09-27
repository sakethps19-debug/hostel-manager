-- P0 Security Hardening Sprint: RPC authorization audit remediation (5/5).
-- See 2026081223_rpc_audit_guard_batch1.sql for full rationale.
--
-- Deliberately excluded from this whole 5-batch remediation (already safe
-- via an equivalent inline check, so a helper-call guard would be
-- redundant or, in two cases, actually WRONG/too-broad):
--   - reserve_resident_message, reserve_broadcast_message: already gate via
--     comms_current_role() + explicit role-array check inline.
--   - get_resident_communication_preferences,
--     update_resident_communication_preferences: already gate via
--     get_my_role() to owner/operations_manager only (narrower than a
--     3-role comms guard would have been).
--   - set_text_setting: already gates via get_my_role() to owner only.
--   - clear_must_change_password: self-service, scoped to auth.uid() only,
--     no target parameter to abuse.
begin;

CREATE OR REPLACE FUNCTION public.update_vendor(p_vendor_id bigint, p_name text, p_category text, p_contact_person text, p_contact_number text, p_email text, p_address text, p_gst_number text, p_notes text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','finance_manager']);
  UPDATE vendors
  SET name = trim(p_name),
      category = p_category,
      contact_person = p_contact_person,
      contact_number = p_contact_number,
      email = p_email,
      address = p_address,
      gst_number = p_gst_number,
      notes = p_notes,
      updated_at = now()
  WHERE id = p_vendor_id;
$function$;

CREATE OR REPLACE FUNCTION public.set_vendor_active(p_vendor_id bigint, p_is_active boolean)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','finance_manager']);
  UPDATE vendors
  SET is_active = p_is_active,
      updated_at = now()
  WHERE id = p_vendor_id;
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
$function$;

CREATE OR REPLACE FUNCTION public.get_upcoming_checkins(p_days integer)
 RETURNS TABLE(booking_id integer, bed_id integer, bed_number text, bed_code text, hostel_name text, floor_number integer, room_number text, resident_id integer, full_name text, mobile_number text, start_date date, days_until integer, monthly_rent numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
  SELECT
    b.id,
    bd.id,
    bd.bed_number,
    bd.bed_code,
    h.name,
    f.floor_number,
    r.room_number,
    res.id,
    res.full_name,
    res.mobile_number,
    b.start_date,
    (b.start_date - (now() AT TIME ZONE 'Asia/Kolkata')::date)::int,
    b.monthly_rent
  FROM bookings b
  JOIN residents res ON res.id = b.resident_id
  JOIN beds bd ON bd.id = b.bed_id
  JOIN rooms r ON r.id = bd.room_id
  JOIN floors f ON f.id = r.floor_id
  JOIN hostels h ON h.id = f.hostel_id
  WHERE b.status = 'confirmed'
    AND b.start_date > (now() AT TIME ZONE 'Asia/Kolkata')::date
    AND b.start_date <= (now() AT TIME ZONE 'Asia/Kolkata')::date + p_days
  ORDER BY b.start_date;
$function$;

CREATE OR REPLACE FUNCTION public.get_referral_sources()
 RETURNS TABLE(referral_source_id bigint, name text, contact_number text, source_type text, notes text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  SELECT id, name, contact_number, source_type, notes
  FROM referral_sources
  ORDER BY name;
$function$;

CREATE OR REPLACE FUNCTION public.set_booking_referral(p_booking_id integer, p_referral_source_id bigint, p_commission_amount numeric, p_notes text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  INSERT INTO booking_referrals (booking_id, referral_source_id, commission_amount, notes, created_by)
  VALUES (p_booking_id, p_referral_source_id, p_commission_amount, p_notes, auth.uid())
  ON CONFLICT (booking_id) DO UPDATE SET
    referral_source_id = EXCLUDED.referral_source_id,
    commission_amount = EXCLUDED.commission_amount,
    notes = EXCLUDED.notes;
$function$;

CREATE OR REPLACE FUNCTION public.get_vendors()
 RETURNS TABLE(vendor_id bigint, name text, category text, contact_person text, contact_number text, email text, address text, gst_number text, notes text, is_active boolean, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','finance_manager']);
  SELECT id, name, category, contact_person, contact_number, email,
         address, gst_number, notes, is_active, created_at
  FROM vendors
  ORDER BY is_active DESC, name;
$function$;

CREATE OR REPLACE FUNCTION public.add_vendor(p_name text, p_category text, p_contact_person text, p_contact_number text, p_email text, p_address text, p_gst_number text, p_notes text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id bigint;
BEGIN
  perform require_role(array['owner','finance_manager']);
  INSERT INTO vendors (
    name, category, contact_person, contact_number, email,
    address, gst_number, notes, created_by
  )
  VALUES (
    trim(p_name), p_category, p_contact_person, p_contact_number, p_email,
    p_address, p_gst_number, p_notes, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_recurring_expense_templates()
 RETURNS TABLE(template_id bigint, hostel_name text, category text, amount numeric, vendor text, payment_mode text, reference_number text, notes text, day_of_month integer, is_active boolean, last_generated_for date)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select accounting_require_role(array['owner','finance_manager']);
  SELECT id, hostel_name, category, amount, vendor, payment_mode,
         reference_number, notes, day_of_month, is_active, last_generated_for
  FROM recurring_expense_templates
  ORDER BY is_active DESC, day_of_month, category;
$function$;

CREATE OR REPLACE FUNCTION public.update_purchase_request_status(p_request_id bigint, p_status text, p_review_notes text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  UPDATE purchase_requests
  SET status = p_status,
      review_notes = coalesce(p_review_notes, review_notes),
      reviewed_by = CASE WHEN p_status IN ('Approved', 'Rejected') THEN auth.uid() ELSE reviewed_by END,
      reviewed_at = CASE WHEN p_status IN ('Approved', 'Rejected') THEN now() ELSE reviewed_at END
  WHERE id = p_request_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_text_setting(p_key text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
  select setting_value from app_text_settings where setting_key = p_key;
$function$;

CREATE OR REPLACE FUNCTION public.add_asset(p_name text, p_category text, p_hostel_name text DEFAULT NULL::text, p_room_number text DEFAULT NULL::text, p_bed_code text DEFAULT NULL::text, p_purchase_date date DEFAULT NULL::date, p_purchase_cost numeric DEFAULT NULL::numeric, p_condition text DEFAULT 'Good'::text, p_warranty_expiry date DEFAULT NULL::date, p_notes text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_asset_id bigint;
begin
  perform require_role(array['owner','operations_manager','finance_manager']);
  insert into assets (name, category, hostel_name, room_number, bed_code, purchase_date, purchase_cost, condition, warranty_expiry, notes)
  values (p_name, p_category, p_hostel_name, p_room_number, p_bed_code, p_purchase_date, p_purchase_cost, coalesce(p_condition, 'Good'), p_warranty_expiry, p_notes)
  returning asset_id into v_asset_id;
  return v_asset_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_assets()
 RETURNS SETOF assets
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
  select * from assets order by created_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.post_rent_accruals_for_period(p_period_year integer, p_period_month integer, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_booking record;
  v_period_start date := make_date(p_period_year, p_period_month, 1);
  v_count int := 0;
begin
  perform accounting_require_role(array['owner','finance_manager']);
  for v_booking in
    select id as booking_id from bookings
     where status = 'confirmed'
       and start_date <= (v_period_start + interval '1 month - 1 day')
       and (end_date is null or end_date >= v_period_start)
  loop
    if post_rent_accrual(v_booking.booking_id, p_period_year, p_period_month, p_created_by) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
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
$function$;

CREATE OR REPLACE FUNCTION public.get_resident_details(p_bed_id bigint)
 RETURNS TABLE(resident_id bigint, booking_id bigint, full_name text, mobile_number text, email text, emergency_contact text, id_proof_type text, id_proof_number text, home_address text, work_college_address text, notes text, start_date date, end_date date, monthly_rent numeric, security_deposit numeric, booking_status text, bed_number text, bed_code text, room_number text, floor_number integer, hostel_name text, notice_given_at date, expected_vacate_date date, notice_notes text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
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
$function$;

CREATE OR REPLACE FUNCTION public.comms_estimate_cost(p_channel text, p_category text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rate_key text;
  v_rate numeric;
begin
  perform comms_require_role(array['owner','operations_manager','finance_manager']);
  if p_channel = 'sms' then
    v_rate_key := 'sms_rate';
  elsif p_category = 'general_notice' then
    v_rate_key := 'whatsapp_marketing_rate';  -- broad announcements approximate to Meta's marketing category
  else
    v_rate_key := 'whatsapp_utility_rate';    -- everything else (rent/booking/ops notices) is transactional/utility
  end if;

  select setting_value::numeric into v_rate from communication_settings where setting_key = v_rate_key;
  return coalesce(v_rate, 0);
end;
$function$;

CREATE OR REPLACE FUNCTION public.comms_monthly_limit_ok(p_resident_id bigint, p_category text, p_override boolean, p_role text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_limit int;
  v_count int;
begin
  perform comms_require_role(array['owner','operations_manager','finance_manager']);
  -- Emergency notices always bypass the volume safeguard - it exists to
  -- catch programming errors and duplicate-reminder loops, not to make a
  -- genuine emergency message impossible to send.
  if p_category = 'emergency_notice' then
    return true;
  end if;

  if p_override then
    if p_role <> 'owner' then
      raise exception 'Only the Owner may override the monthly message limit';
    end if;
    return true;
  end if;

  -- Serializes concurrent limit-checks for the SAME resident. Because this
  -- runs inside the caller's insert transaction (not a separate RPC), the
  -- lock is held until that insert commits, genuinely preventing two
  -- concurrent reservations for the same resident from both reading
  -- "under limit" before either has a row on disk.
  perform pg_advisory_xact_lock(hashtext('comms_monthly_limit:' || p_resident_id));

  select coalesce(setting_value::int, 5) into v_limit
    from communication_settings where setting_key = 'monthly_message_limit_per_resident';

  select count(*) into v_count from (
    select created_at from resident_messages
     where resident_id = p_resident_id and status not in ('failed', 'cancelled')
       and created_at >= date_trunc('month', now())
    union all
    select created_at from broadcast_messages
     where resident_id = p_resident_id and status not in ('failed', 'cancelled')
       and created_at >= date_trunc('month', now())
  ) sent_this_month;

  return v_count < v_limit;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_resident_communications(p_resident_id bigint)
 RETURNS TABLE(communication_id bigint, communication_type text, note text, created_by_name text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select comms_require_role(array['owner','operations_manager','finance_manager']);
  select c.communication_id, c.communication_type, c.note,
         coalesce(p.full_name, u.email), c.created_at
    from resident_communications c
    left join profiles p on p.id = c.created_by
    left join auth.users u on u.id = c.created_by
   where c.resident_id = p_resident_id
   order by c.created_at desc;
$function$;

commit;
