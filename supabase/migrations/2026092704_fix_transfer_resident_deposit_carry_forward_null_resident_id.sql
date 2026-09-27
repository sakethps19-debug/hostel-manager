-- ============================================================================
-- Fix: transfer_resident's deposit-carry-forward payment insert never set
-- resident_id, which is NOT NULL on payments - so transferring ANY resident
-- who has an existing Security Deposit on file (the normal case) crashes
-- outright with "null value in column resident_id... violates not-null
-- constraint", rather than completing the transfer.
--
-- Found while building the resident-lifecycle regression test for the
-- UAT/test-environment sprint (section 10: "Transfer... verify... old bed
-- released correctly, new bed allocation correct, accounting/payment
-- history remains attached"). v_resident_id is already resolved earlier in
-- this same function body from the original booking - this just threads it
-- through to the carried-forward deposit payment row, exactly like every
-- other insert into payments in this codebase already does.
--
-- Confirmed present in production (payments.resident_id is NOT NULL there
-- too, and this function's body is identical) - not introduced by any
-- test-environment rebuild.
--
-- Same signature as before, so CREATE OR REPLACE keeps existing EXECUTE
-- grants intact.
-- ============================================================================
create or replace function public.transfer_resident(p_booking_id bigint, p_new_bed_id bigint, p_transfer_date date, p_reason text, p_notes text DEFAULT NULL::text, p_new_monthly_rent numeric DEFAULT NULL::numeric, p_new_security_deposit numeric DEFAULT NULL::numeric, p_new_end_date date DEFAULT NULL::date)
 returns table(new_booking_id bigint, new_bed_id bigint, new_hostel_name text, new_room_number text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_resident_id bigint;
  v_old_bed_id bigint;
  v_old_monthly_rent numeric;
  v_old_security_deposit numeric;
  v_old_end_date date;
  v_old_start_date date;
  v_new_monthly_rent numeric;
  v_new_security_deposit numeric;
  v_new_end_date date;
  v_new_booking_id bigint;
  v_deposit_carry numeric;
  v_new_bed_status text;
  v_overlap_exists boolean;
  v_new_hostel_name text;
  v_new_room_number text;
begin
  perform require_role(array['owner','operations_manager']);

  select b.resident_id, b.bed_id, b.monthly_rent, b.security_deposit, b.end_date, b.start_date
  into v_resident_id, v_old_bed_id, v_old_monthly_rent, v_old_security_deposit, v_old_end_date, v_old_start_date
  from bookings b
  where b.id = p_booking_id and b.status in ('confirmed', 'checked_in');

  if v_resident_id is null then
    raise exception 'No active booking found for booking id %', p_booking_id;
  end if;

  if p_new_bed_id = v_old_bed_id then
    raise exception 'Cannot transfer a resident to the same bed they currently occupy.';
  end if;

  if p_transfer_date <= v_old_start_date then
    raise exception 'Transfer date must be after the current booking start date.';
  end if;

  select status into v_new_bed_status from beds where id = p_new_bed_id;

  if v_new_bed_status is null then
    raise exception 'Destination bed % not found', p_new_bed_id;
  end if;

  if v_new_bed_status <> 'active' then
    raise exception 'Destination bed is not available (status: %).', v_new_bed_status;
  end if;

  v_new_monthly_rent := coalesce(p_new_monthly_rent, v_old_monthly_rent);
  v_new_security_deposit := coalesce(p_new_security_deposit, v_old_security_deposit, 0);
  v_new_end_date := coalesce(p_new_end_date, v_old_end_date);

  select exists (
    select 1
    from bookings nb
    where nb.bed_id = p_new_bed_id
      and nb.status in ('confirmed', 'checked_in')
      and daterange(nb.start_date, coalesce(nb.end_date, 'infinity'::date), '[]')
          && daterange(p_transfer_date, coalesce(v_new_end_date, 'infinity'::date), '[]')
  ) into v_overlap_exists;

  if v_overlap_exists then
    raise exception 'The selected bed is already booked for part of the requested period.';
  end if;

  update bookings
  set end_date = p_transfer_date - 1,
      status = 'completed'
  where id = p_booking_id;

  insert into bookings (resident_id, bed_id, start_date, end_date, monthly_rent, security_deposit, status, created_at)
  values (v_resident_id, p_new_bed_id, p_transfer_date, v_new_end_date, v_new_monthly_rent, v_new_security_deposit, 'confirmed', now())
  returning id into v_new_booking_id;

  select coalesce(sum(case when p.payment_type = 'Security Deposit' then p.amount
                           when p.payment_type = 'Deposit Refund' then -p.amount
                           else 0 end), 0)
  into v_deposit_carry
  from payments p
  where p.booking_id = p_booking_id and p.status = 'active';

  if v_deposit_carry > 0 then
    insert into payments (
      booking_id, resident_id, amount, payment_date, payment_for_month, payment_type,
      payment_mode, reference_number, notes, receipt_number, status, created_at
    ) values (
      v_new_booking_id, v_resident_id, v_deposit_carry, p_transfer_date, null, 'Security Deposit',
      'Other', 'TRANSFER-FROM-BOOKING-' || p_booking_id,
      'Deposit carried forward from previous bed on transfer — no new cash received.',
      'VNR-' || extract(year from p_transfer_date) || '-' || lpad(nextval('payments_receipt_seq')::text, 4, '0'),
      'active', now()
    );
  end if;

  insert into bed_transfers (
    resident_id, old_booking_id, new_booking_id, old_bed_id, new_bed_id,
    transfer_date, reason, notes, rent_before, rent_after
  ) values (
    v_resident_id, p_booking_id, v_new_booking_id, v_old_bed_id, p_new_bed_id,
    p_transfer_date, p_reason, p_notes, v_old_monthly_rent, v_new_monthly_rent
  );

  select h.name, r.room_number
  into v_new_hostel_name, v_new_room_number
  from beds bd
  join rooms r on r.id = bd.room_id
  join floors f on f.id = r.floor_id
  join hostels h on h.id = f.hostel_id
  where bd.id = p_new_bed_id;

  return query select v_new_booking_id, p_new_bed_id, v_new_hostel_name, v_new_room_number;
end;
$function$;
