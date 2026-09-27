-- ============================================================================
-- IST/UTC date-boundary fix (2/2). See
-- 2026081240_fix_ist_utc_date_boundaries_batch1.sql for full rationale.
--
-- Functions in this batch: get_resident_details, get_room_beds,
-- get_sharing_type_pricing, get_upcoming_vacancies, get_waitlist_matches,
-- give_notice, post_asset_purchase_journal, record_payment,
-- reverse_payment, start_maintenance, update_sharing_type_rate,
-- vacate_bed.
--
-- Verified live: get_hostel_dashboard(), get_rent_dashboard_summary(),
-- get_upcoming_vacancies(30) all still execute correctly against
-- production after both batches, and Hostel A/B/C bed counts remain
-- unchanged (116/108/8, 124, 185).
-- ============================================================================
begin;

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
    and (now() AT TIME ZONE 'Asia/Kolkata')::date >= bk.start_date and (bk.end_date is null or (now() AT TIME ZONE 'Asia/Kolkata')::date <= bk.end_date)
  order by bk.start_date desc
  limit 1;
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
      and (now() AT TIME ZONE 'Asia/Kolkata')::date >= bk.start_date and (bk.end_date is null or (now() AT TIME ZONE 'Asia/Kolkata')::date <= bk.end_date)
    limit 1
  ) cur on true
  left join residents res on res.id = cur.resident_id
  left join lateral (
    select *
    from bookings bk2
    where bk2.bed_id = b.id
      and bk2.status in ('confirmed', 'checked_in')
      and bk2.start_date > (now() AT TIME ZONE 'Asia/Kolkata')::date
    order by bk2.start_date asc
    limit 1
  ) fut on cur.id is null
  where h.name = p_hostel_name
    and r.room_number = p_room_number
  order by b.bed_number;
$function$;

CREATE OR REPLACE FUNCTION public.get_sharing_type_pricing()
 RETURNS TABLE(hostel_name text, sharing_type integer, monthly_rent numeric, effective_from date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform require_role(array['owner']);

  return query
  select h.name, p.sharing_type, p.monthly_rent, p.effective_from
  from pricing p
  join hostels h on h.id = p.hostel_id
  where p.effective_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date
    and (p.effective_to is null or p.effective_to >= (now() AT TIME ZONE 'Asia/Kolkata')::date)
  order by h.name, p.sharing_type;
end;
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
    (coalesce(bk.expected_vacate_date, bk.end_date) - (now() AT TIME ZONE 'Asia/Kolkata')::date) as days_left,
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
    and coalesce(bk.expected_vacate_date, bk.end_date) >= (now() AT TIME ZONE 'Asia/Kolkata')::date
    and coalesce(bk.expected_vacate_date, bk.end_date) <= (now() AT TIME ZONE 'Asia/Kolkata')::date + p_days
  order by coalesce(bk.expected_vacate_date, bk.end_date) asc;
$function$;

CREATE OR REPLACE FUNCTION public.get_waitlist_matches()
 RETURNS TABLE(waitlist_id bigint, full_name text, mobile_number text, bed_id bigint, bed_code text, bed_number text, hostel_name text, room_number text, sharing_type integer, monthly_rent numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
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
      and p.effective_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date
      and (p.effective_to is null or p.effective_to >= (now() AT TIME ZONE 'Asia/Kolkata')::date)
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
        and (now() AT TIME ZONE 'Asia/Kolkata')::date >= bk.start_date and (bk.end_date is null or (now() AT TIME ZONE 'Asia/Kolkata')::date <= bk.end_date)
    )
    and (w.budget is null or coalesce(pr.monthly_rent, 0) <= w.budget)
  order by w.created_at asc;
$function$;

CREATE OR REPLACE FUNCTION public.give_notice(p_booking_id bigint, p_expected_vacate_date date, p_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status text;
begin
  perform require_role(array['owner','operations_manager']);

  select status into v_status from bookings where id = p_booking_id;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_status not in ('confirmed', 'checked_in') then
    raise exception 'Notice can only be given for an active booking';
  end if;

  if p_expected_vacate_date is null then
    raise exception 'Expected vacate date is required';
  end if;

  update bookings
  set notice_given_at = (now() AT TIME ZONE 'Asia/Kolkata')::date,
      expected_vacate_date = p_expected_vacate_date,
      notice_notes = nullif(trim(p_notes), '')
  where id = p_booking_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.post_asset_purchase_journal(p_asset_id bigint, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_asset assets%rowtype;
  v_gl_code text;
  v_cash_code text;
  v_journal_entry_id bigint;
  v_threshold numeric;
  v_capitalized boolean;
begin
  perform accounting_require_role(array['owner','finance_manager']);

  select * into v_asset from assets where asset_id = p_asset_id;
  if not found then
    raise exception 'post_asset_purchase_journal: asset % not found', p_asset_id;
  end if;
  if v_asset.purchase_cost is null or v_asset.purchase_cost <= 0 then
    return null;
  end if;

  if exists (select 1 from accounting_journal_entries where source_type = 'asset_purchase' and source_id = p_asset_id) then
    select journal_entry_id into v_journal_entry_id from accounting_journal_entries
     where source_type = 'asset_purchase' and source_id = p_asset_id limit 1;
    return v_journal_entry_id;
  end if;

  select setting_value::numeric into v_threshold from accounting_settings where setting_key = 'capitalization_threshold';
  v_capitalized := v_asset.purchase_cost >= coalesce(v_threshold, 5000);

  if v_asset.gl_account_id is not null then
    select code into v_gl_code from accounting_accounts where account_id = v_asset.gl_account_id;
  else
    select a.code into v_gl_code
      from asset_categories c join accounting_accounts a on a.account_id = c.default_gl_account_id
     where c.name = v_asset.category;
  end if;
  if v_gl_code is null then
    v_gl_code := '1229';
  end if;

  v_cash_code := coalesce(accounting_cash_account_code(v_asset.payment_mode), '1110');

  if v_capitalized then
    v_journal_entry_id := accounting_post_entry(
      coalesce(v_asset.purchase_date, (now() AT TIME ZONE 'Asia/Kolkata')::date), v_asset.hostel_name, 'asset_purchase', p_asset_id,
      'Asset purchase — ' || v_asset.name || coalesce(' (' || v_asset.asset_code || ')', ''),
      jsonb_build_array(
        jsonb_build_object('account_code', v_gl_code, 'debit', v_asset.purchase_cost, 'credit', 0, 'asset_id', p_asset_id),
        jsonb_build_object('account_code', v_cash_code, 'debit', 0, 'credit', v_asset.purchase_cost, 'asset_id', p_asset_id)
      ),
      p_created_by
    );
    update assets set capitalized = true where asset_id = p_asset_id;
  else
    v_journal_entry_id := accounting_post_entry(
      coalesce(v_asset.purchase_date, (now() AT TIME ZONE 'Asia/Kolkata')::date), v_asset.hostel_name, 'asset_purchase', p_asset_id,
      'Low-value purchase (expensed, below capitalization threshold) — ' || v_asset.name,
      jsonb_build_array(
        jsonb_build_object('account_code', '5290', 'debit', v_asset.purchase_cost, 'credit', 0, 'asset_id', p_asset_id),
        jsonb_build_object('account_code', v_cash_code, 'debit', 0, 'credit', v_asset.purchase_cost, 'asset_id', p_asset_id)
      ),
      p_created_by
    );
    update assets set capitalized = false where asset_id = p_asset_id;
  end if;

  return v_journal_entry_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_payment(p_booking_id bigint, p_amount numeric, p_payment_date date, p_payment_for_month date, p_payment_type text, p_payment_mode text, p_reference_number text, p_notes text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS TABLE(payment_id bigint, receipt_number text, is_new boolean, journal_entry_id bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_resident_id bigint;
  v_payment_id bigint;
  v_receipt_number text;
  v_existing_id bigint;
  v_existing_receipt text;
  v_journal_entry_id bigint;
begin
  perform require_role(array['owner','finance_manager']);

  if p_idempotency_key is not null then
    select p.id, p.receipt_number into v_existing_id, v_existing_receipt
    from payments p where p.idempotency_key = p_idempotency_key;

    if v_existing_id is not null then
      select je.journal_entry_id into v_journal_entry_id
        from accounting_journal_entries je
       where je.source_type = 'payment' and je.source_id = v_existing_id
       limit 1;
      return query select v_existing_id, v_existing_receipt, false, v_journal_entry_id;
      return;
    end if;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  if p_payment_date is null then
    raise exception 'Payment date is required';
  end if;

  if p_payment_mode is null or p_payment_mode not in ('Cash','UPI','Bank Transfer','Other') then
    raise exception 'Invalid payment mode';
  end if;

  if p_payment_type is null or p_payment_type not in ('Monthly Rent','Security Deposit','Deposit Refund','Other Charge','Adjustment') then
    raise exception 'Invalid payment type';
  end if;

  select resident_id into v_resident_id
  from bookings
  where id = p_booking_id;

  if not found then
    raise exception 'Booking not found';
  end if;

  v_receipt_number := 'VNR-' || extract(year from (now() AT TIME ZONE 'Asia/Kolkata')::date)::text || '-' || lpad(nextval('payments_receipt_seq')::text, 4, '0');

  insert into payments (
    booking_id, resident_id, amount, payment_date, payment_for_month,
    payment_type, payment_mode, reference_number, notes, receipt_number, idempotency_key
  )
  values (
    p_booking_id, v_resident_id, p_amount, p_payment_date, p_payment_for_month,
    p_payment_type, p_payment_mode, nullif(trim(p_reference_number), ''), nullif(trim(p_notes), ''),
    v_receipt_number, p_idempotency_key
  )
  returning id into v_payment_id;

  v_journal_entry_id := post_payment_journal(v_payment_id, auth.uid());

  return query select v_payment_id, v_receipt_number, true, v_journal_entry_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reverse_payment(p_payment_id bigint, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_journal_entry_id bigint;
begin
  perform require_role(array['owner','finance_manager']);
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A reason is required to reverse a payment';
  end if;

  update payments
  set status = 'reversed',
      reversed_at = now(),
      reversed_reason = trim(p_reason)
  where id = p_payment_id
    and status = 'active';

  if not found then
    raise exception 'Payment not found or already reversed';
  end if;

  select je.journal_entry_id into v_journal_entry_id
    from accounting_journal_entries je
   where je.source_type = 'payment' and je.source_id = p_payment_id and je.status = 'posted'
   limit 1;

  if v_journal_entry_id is not null then
    perform accounting_reverse_entry(v_journal_entry_id, (now() AT TIME ZONE 'Asia/Kolkata')::date, 'Payment reversed: ' || trim(p_reason), auth.uid());
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.start_maintenance(p_bed_id bigint, p_reason text, p_start_date date, p_expected_completion_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text, p_cost numeric DEFAULT NULL::numeric)
 RETURNS bed_maintenance
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_record bed_maintenance;
  v_has_blocking_booking boolean;
begin
  perform require_role(array['owner','operations_manager']);

  select exists (
    select 1
    from bookings bk
    where bk.bed_id = p_bed_id
      and bk.status in ('confirmed', 'checked_in')
      and (bk.end_date is null or bk.end_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date)
  ) into v_has_blocking_booking;

  if v_has_blocking_booking then
    raise exception 'This bed has a current or upcoming booking and cannot be marked for maintenance.';
  end if;

  if exists (select 1 from bed_maintenance where bed_id = p_bed_id and status = 'open') then
    raise exception 'This bed already has an open maintenance record.';
  end if;

  insert into bed_maintenance (
    bed_id, reason, start_date, expected_completion_date, notes, cost, status
  ) values (
    p_bed_id, p_reason, p_start_date, p_expected_completion_date, p_notes, p_cost, 'open'
  )
  returning * into v_record;

  update beds set status = 'maintenance' where id = p_bed_id;

  return v_record;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_sharing_type_rate(p_hostel_name text, p_sharing_type integer, p_new_rate numeric, p_effective_date date DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_hostel_id bigint;
begin
  perform require_role(array['owner']);

  if p_new_rate is null or p_new_rate <= 0 then
    raise exception 'Rate must be greater than zero.';
  end if;

  if p_effective_date < (now() AT TIME ZONE 'Asia/Kolkata')::date then
    raise exception 'Effective date cannot be in the past.';
  end if;

  select id into v_hostel_id from hostels where name = p_hostel_name;
  if v_hostel_id is null then
    raise exception 'Hostel % not found', p_hostel_name;
  end if;

  update pricing
  set effective_to = p_effective_date - 1
  where hostel_id = v_hostel_id
    and sharing_type = p_sharing_type
    and effective_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date
    and (effective_to is null or effective_to >= (now() AT TIME ZONE 'Asia/Kolkata')::date);

  insert into pricing (hostel_id, sharing_type, monthly_rent, effective_from, effective_to)
  values (v_hostel_id, p_sharing_type, p_new_rate, p_effective_date, null);
end;
$function$;

CREATE OR REPLACE FUNCTION public.vacate_bed(p_booking_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform require_role(array['owner','operations_manager']);

  update bookings
  set
    status = 'completed',
    end_date = least(end_date, (now() AT TIME ZONE 'Asia/Kolkata')::date)
  where id = p_booking_id
    and status in ('confirmed', 'checked_in');

  if not found then
    raise exception 'Active booking not found';
  end if;
end;
$function$;

commit;
