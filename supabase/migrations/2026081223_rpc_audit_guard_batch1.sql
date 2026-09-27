-- ============================================================================
-- P0 Security Hardening Sprint: RPC authorization audit remediation (1/5).
-- Adds require_role/accounting_require_role guards to SECURITY DEFINER
-- functions that were authenticated-callable with no server-side role
-- check, mapped to the correct role array per lib/permissions.ts and each
-- function's actual UI caller (verified page-by-page, not blindly
-- restricted to owner). Found via: functions that are security_definer,
-- authenticated-executable, and whose body does not call
-- require_role(/accounting_require_role(/comms_require_role(.
-- ============================================================================
begin;

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
        and coalesce(b.expected_vacate_date, b.end_date) between current_date and current_date + 7
    ) as vacating_7_days_count,
    (
      select count(*)
      from bookings b
      where b.status in ('confirmed', 'checked_in')
        and coalesce(b.expected_vacate_date, b.end_date) between current_date and current_date + 30
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

CREATE OR REPLACE FUNCTION public.get_today_snapshot()
 RETURNS TABLE(checkins_today_count integer, checkouts_today_count integer, enquiries_followup_count integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
  SELECT
    (
      SELECT count(*)::int FROM bookings b
      WHERE b.start_date = (now() AT TIME ZONE 'Asia/Kolkata')::date
        AND b.status IN ('confirmed', 'checked_in')
    ) AS checkins_today_count,
    (
      SELECT count(*)::int FROM bookings b
      WHERE b.status IN ('confirmed', 'checked_in')
        AND (
          (b.notice_given_at IS NOT NULL AND b.expected_vacate_date = (now() AT TIME ZONE 'Asia/Kolkata')::date)
          OR (b.notice_given_at IS NULL AND b.end_date = (now() AT TIME ZONE 'Asia/Kolkata')::date)
        )
    ) AS checkouts_today_count,
    (
      SELECT count(*)::int FROM enquiries e
      WHERE e.status NOT IN ('Converted', 'Lost')
    ) AS enquiries_followup_count;
$function$;

CREATE OR REPLACE FUNCTION public.get_todays_checkouts()
 RETURNS TABLE(booking_id integer, bed_id integer, bed_number text, bed_code text, hostel_name text, floor_number integer, room_number text, resident_id integer, full_name text, mobile_number text, checkout_date date, notice_given boolean, monthly_rent numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
  SELECT
    b.id, bd.id, bd.bed_number, bd.bed_code, h.name, f.floor_number,
    r.room_number, res.id, res.full_name, res.mobile_number,
    COALESCE(b.expected_vacate_date, b.end_date),
    (b.notice_given_at IS NOT NULL), b.monthly_rent
  FROM bookings b
  JOIN residents res ON res.id = b.resident_id
  JOIN beds bd ON bd.id = b.bed_id
  JOIN rooms r ON r.id = bd.room_id
  JOIN floors f ON f.id = r.floor_id
  JOIN hostels h ON h.id = f.hostel_id
  WHERE b.status IN ('confirmed', 'checked_in')
    AND (
      (b.notice_given_at IS NOT NULL AND b.expected_vacate_date = (now() AT TIME ZONE 'Asia/Kolkata')::date)
      OR (b.notice_given_at IS NULL AND b.end_date = (now() AT TIME ZONE 'Asia/Kolkata')::date)
    )
  ORDER BY h.name, r.room_number, bd.bed_number;
$function$;

CREATE OR REPLACE FUNCTION public.get_petty_cash_balance()
 RETURNS numeric
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select accounting_require_role(array['owner','finance_manager']);
  select coalesce(sum(amount), 0) from petty_cash_transactions;
$function$;

CREATE OR REPLACE FUNCTION public.get_petty_cash_transactions()
 RETURNS TABLE(transaction_id bigint, hostel_name text, transaction_type text, amount numeric, description text, transaction_date date, running_balance numeric, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select accounting_require_role(array['owner','finance_manager']);
  select
    id, hostel_name, transaction_type, amount, description, transaction_date,
    sum(amount) over (order by transaction_date, id) as running_balance,
    created_at
  from petty_cash_transactions
  order by transaction_date desc, id desc;
$function$;

CREATE OR REPLACE FUNCTION public.get_cash_reconciliations()
 RETURNS TABLE(reconciliation_id bigint, reconciliation_date date, hostel_name text, expected_balance numeric, counted_balance numeric, variance numeric, notes text, created_by_name text, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select accounting_require_role(array['owner','finance_manager']);
  select
    r.id, r.reconciliation_date, r.hostel_name, r.expected_balance,
    r.counted_balance, r.variance, r.notes, p.full_name, r.created_at
  from cash_reconciliations r
  left join profiles p on p.id = r.created_by
  order by r.reconciliation_date desc, r.created_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.get_resident_profile_extra(p_resident_id bigint)
 RETURNS TABLE(date_of_birth date, gender text, photo_url text, employer_or_college text, occupation_or_course text, emergency_contact_name text, emergency_contact_relationship text, emergency_contact_mobile text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
  select r.date_of_birth, r.gender, r.photo_url, r.employer_or_college, r.occupation_or_course,
         r.emergency_contact_name, r.emergency_contact_relationship, r.emergency_contact_mobile
  from residents r
  where r.id = p_resident_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_complaints()
 RETURNS TABLE(complaint_id bigint, resident_id bigint, full_name text, hostel_name text, room_number text, bed_code text, category text, description text, priority text, status text, resolution text, created_at timestamp with time zone, closed_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager']);
  select
    c.id as complaint_id, c.resident_id, r.full_name, c.hostel_name, c.room_number,
    c.bed_code, c.category, c.description, c.priority, c.status, c.resolution,
    c.created_at, c.closed_at
  from complaints c
  left join residents r on r.id = c.resident_id
  order by
    case c.status when 'Open' then 1 when 'In Progress' then 2 when 'Resolved' then 3 else 4 end,
    c.created_at desc;
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
    and b.start_date > current_date
  order by b.start_date asc
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.reverse_payment(p_payment_id bigint, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_booking_history()
 RETURNS TABLE(booking_id bigint, resident_id bigint, full_name text, mobile_number text, email text, emergency_contact text, notes text, hostel_name text, floor_number integer, room_number text, bed_number text, bed_code text, start_date date, end_date date, monthly_rent numeric, security_deposit numeric, booking_status text, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
  select
    bk.id as booking_id,
    res.id as resident_id,
    res.full_name,
    res.mobile_number,
    res.email,
    res.emergency_contact,
    res.notes,
    h.name as hostel_name,
    f.floor_number,
    r.room_number,
    b.bed_number,
    b.bed_code,
    bk.start_date,
    bk.end_date,
    bk.monthly_rent,
    bk.security_deposit,
    bk.status as booking_status,
    bk.created_at
  from bookings bk
  join residents res
    on res.id = bk.resident_id
  join beds b
    on b.id = bk.bed_id
  join rooms r
    on r.id = b.room_id
  join floors f
    on f.id = r.floor_id
  join hostels h
    on h.id = f.hostel_id
  order by bk.created_at desc, bk.id desc;
$function$;

CREATE OR REPLACE FUNCTION public.get_bed_maintenance_history(p_bed_id bigint)
 RETURNS TABLE(maintenance_id bigint, reason text, start_date date, expected_completion_date date, actual_completion_date date, notes text, cost numeric, status text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
  select
    bm.id as maintenance_id,
    bm.reason,
    bm.start_date,
    bm.expected_completion_date,
    bm.actual_completion_date,
    bm.notes,
    bm.cost,
    bm.status
  from bed_maintenance bm
  where bm.bed_id = p_bed_id
  order by bm.start_date desc, bm.id desc;
$function$;

CREATE OR REPLACE FUNCTION public.get_payment_history(p_booking_id bigint)
 RETURNS TABLE(payment_id bigint, receipt_number text, payment_date date, payment_for_month date, payment_type text, amount numeric, payment_mode text, reference_number text, notes text, status text, reversed_reason text, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
  select id, receipt_number, payment_date, payment_for_month, payment_type, amount,
         payment_mode, reference_number, notes, status, reversed_reason, created_at
  from payments
  where booking_id = p_booking_id
  order by payment_date desc, created_at desc;
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
$function$;

CREATE OR REPLACE FUNCTION public.get_resident_master_list()
 RETURNS TABLE(resident_id bigint, booking_id bigint, full_name text, mobile_number text, id_proof_number text, hostel_name text, room_number text, bed_id bigint, bed_code text, start_date date, end_date date, monthly_rent numeric, outstanding_rent numeric, booking_status text, photo_storage_path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_ledger record;
  v_settlement record;
  v_outstanding numeric;
begin
  perform require_role(array['owner','operations_manager','finance_manager']);
  for r in
    select bk.id as booking_id, bk.resident_id, res.full_name, res.mobile_number, res.id_proof_number,
           h.name as hostel_name, rm.room_number, b.id as bed_id, b.bed_code,
           bk.start_date, bk.end_date, bk.monthly_rent, bk.status as booking_status
    from bookings bk
    join residents res on res.id = bk.resident_id
    join beds b on b.id = bk.bed_id
    join rooms rm on rm.id = b.room_id
    join floors f on f.id = rm.floor_id
    join hostels h on h.id = f.hostel_id
    order by bk.created_at desc
  loop
    select * into v_ledger from get_booking_ledger(r.booking_id);
    select * into v_settlement from settlements s where s.booking_id = r.booking_id;

    if v_settlement.id is not null then
      v_outstanding := greatest(v_settlement.outstanding_rent, 0);
    else
      v_outstanding := greatest(v_ledger.balance_outstanding, 0);
    end if;

    resident_id := r.resident_id;
    booking_id := r.booking_id;
    full_name := r.full_name;
    mobile_number := r.mobile_number;
    id_proof_number := case
      when r.id_proof_number is null or length(r.id_proof_number) <= 4 then r.id_proof_number
      else '•••• ' || right(r.id_proof_number, 4)
    end;
    hostel_name := r.hostel_name;
    room_number := r.room_number;
    bed_id := r.bed_id;
    bed_code := r.bed_code;
    start_date := r.start_date;
    end_date := r.end_date;
    monthly_rent := r.monthly_rent;
    outstanding_rent := v_outstanding;
    booking_status := r.booking_status;
    photo_storage_path := (
      select rd.storage_path
      from resident_documents rd
      where rd.resident_id = r.resident_id
        and rd.document_type = 'Resident Photo'
        and rd.is_primary = true
      limit 1
    );

    return next;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_deposit_reconciliation()
 RETURNS TABLE(booking_id bigint, resident_id bigint, full_name text, hostel_name text, room_number text, bed_number text, bed_code text, booking_status text, deposit_agreed numeric, deposit_received numeric, deposit_refunded numeric, deposit_balance numeric, deposit_status text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','finance_manager']);
  SELECT
    bh.booking_id, bh.resident_id, bh.full_name, bh.hostel_name,
    bh.room_number, bh.bed_number, bh.bed_code, bh.booking_status,
    ds.deposit_agreed, ds.deposit_received, ds.deposit_refunded,
    ds.deposit_balance, ds.deposit_status
  FROM get_booking_history() bh
  CROSS JOIN LATERAL get_deposit_summary(bh.booking_id) ds;
$function$;

CREATE OR REPLACE FUNCTION public.submit_expense_approval_request(p_hostel_name text, p_category text, p_amount numeric, p_vendor text, p_justification text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id bigint;
BEGIN
  perform accounting_require_role(array['owner','finance_manager']);
  INSERT INTO expense_approval_requests (
    hostel_name, category, amount, vendor, justification, requested_by
  )
  VALUES (
    p_hostel_name, p_category, p_amount, p_vendor, p_justification, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_purchase_request(p_hostel_name text, p_item_description text, p_quantity integer, p_estimated_cost numeric, p_vendor_id bigint, p_urgency text, p_justification text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id bigint;
BEGIN
  perform require_role(array['owner','operations_manager']);
  INSERT INTO purchase_requests (
    hostel_name, item_description, quantity, estimated_cost,
    vendor_id, urgency, justification, requested_by
  )
  VALUES (
    p_hostel_name, p_item_description, coalesce(p_quantity, 1), p_estimated_cost,
    p_vendor_id, coalesce(p_urgency, 'Normal'), p_justification, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_budget_vs_actual(p_month integer, p_year integer)
 RETURNS TABLE(category text, hostel_name text, budgeted_amount numeric, actual_amount numeric, variance numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select accounting_require_role(array['owner','finance_manager']);
  WITH actuals AS (
    SELECT category, hostel_name, sum(amount) AS actual_amount
    FROM get_expenses()
    WHERE expense_date >= make_date(p_year, p_month, 1)
      AND expense_date < (make_date(p_year, p_month, 1) + INTERVAL '1 month')::date
    GROUP BY category, hostel_name
  ),
  keys AS (
    SELECT category, hostel_name FROM expense_budgets
    UNION
    SELECT category, hostel_name FROM actuals
  )
  SELECT
    k.category,
    k.hostel_name,
    coalesce(b.monthly_budget_amount, 0),
    coalesce(a.actual_amount, 0),
    coalesce(b.monthly_budget_amount, 0) - coalesce(a.actual_amount, 0)
  FROM keys k
  LEFT JOIN expense_budgets b
    ON b.category = k.category AND coalesce(b.hostel_name, '') = coalesce(k.hostel_name, '')
  LEFT JOIN actuals a
    ON a.category = k.category AND coalesce(a.hostel_name, '') = coalesce(k.hostel_name, '')
  ORDER BY k.hostel_name, k.category;
$function$;

CREATE OR REPLACE FUNCTION public.get_transfer_history(p_resident_id bigint)
 RETURNS TABLE(transfer_id bigint, old_booking_id bigint, new_booking_id bigint, transfer_date date, reason text, notes text, old_hostel_name text, old_room_number text, old_bed_code text, new_hostel_name text, new_room_number text, new_bed_code text, rent_before numeric, rent_after numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select require_role(array['owner','operations_manager','finance_manager']);
  select
    bt.id as transfer_id,
    bt.old_booking_id,
    bt.new_booking_id,
    bt.transfer_date,
    bt.reason,
    bt.notes,
    oh.name as old_hostel_name,
    orm.room_number as old_room_number,
    ob.bed_code as old_bed_code,
    nh.name as new_hostel_name,
    nrm.room_number as new_room_number,
    nb.bed_code as new_bed_code,
    bt.rent_before,
    bt.rent_after
  from bed_transfers bt
  join beds ob on ob.id = bt.old_bed_id
  join rooms orm on orm.id = ob.room_id
  join floors ofl on ofl.id = orm.floor_id
  join hostels oh on oh.id = ofl.hostel_id
  join beds nb on nb.id = bt.new_bed_id
  join rooms nrm on nrm.id = nb.room_id
  join floors nfl on nfl.id = nrm.floor_id
  join hostels nh on nh.id = nfl.hostel_id
  where bt.resident_id = p_resident_id
  order by bt.transfer_date desc;
$function$;

commit;
