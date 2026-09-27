-- ============================================================================
-- Fix: create_booking never checked beds.status, so a bed explicitly marked
-- 'maintenance' or 'inactive' could still be booked directly through the
-- RPC - the UI's "Find a Bed" screen filters these out visually, but the
-- underlying function had no server-side guard, unlike transfer_resident
-- (which already checks `v_new_bed_status <> 'active'` before allowing a
-- transfer onto a bed). Found while building the booking regression test
-- suite for the UAT/test-environment sprint (section 9: "maintenance/
-- blocked bed cannot be incorrectly booked") and confirmed present in
-- production, not introduced by any test-environment rebuild.
--
-- Same signature as before, so CREATE OR REPLACE keeps the existing
-- EXECUTE grants intact (no PUBLIC-execute regression, unlike the
-- signature-changing replacements fixed in
-- 2026081244_fix_public_execute_regression_on_atomic_rpcs.sql).
-- ============================================================================
create or replace function public.create_booking(p_bed_id bigint, p_full_name text, p_mobile_number text, p_email text, p_emergency_contact text, p_id_proof_type text, p_id_proof_number text, p_home_address text, p_work_college_address text, p_notes text, p_start_date date, p_end_date date, p_monthly_rent numeric, p_security_deposit numeric)
 returns table(resident_id bigint, booking_id bigint)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_resident_id bigint;
  v_booking_id bigint;
  v_bed_status text;
begin
  perform require_role(array['owner','operations_manager']);

  if p_full_name is null or trim(p_full_name) = '' then
    raise exception 'Resident name is required';
  end if;

  if p_mobile_number is null
     or trim(p_mobile_number) !~ '^[0-9]{10}$' then
    raise exception 'Mobile number must contain exactly 10 digits';
  end if;

  if p_id_proof_type is null or trim(p_id_proof_type) = '' then
    raise exception 'ID proof type is required';
  end if;

  if p_id_proof_type not in (
    'Aadhaar Card',
    'PAN Card',
    'Voter ID',
    'Driving License',
    'Other'
  ) then
    raise exception 'Invalid ID proof type';
  end if;

  if p_id_proof_number is null
     or trim(p_id_proof_number) = '' then
    raise exception 'ID proof number/value is required';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception 'Start date and end date are required';
  end if;

  if p_end_date < p_start_date then
    raise exception 'End date cannot be before start date';
  end if;

  if p_monthly_rent is null or p_monthly_rent < 0 then
    raise exception 'Monthly rent must be valid';
  end if;

  select status into v_bed_status from beds where id = p_bed_id;

  if v_bed_status is null then
    raise exception 'Bed % not found', p_bed_id;
  end if;

  if v_bed_status <> 'active' then
    raise exception 'This bed is not available for booking (status: %).', v_bed_status;
  end if;

  if exists (
    select 1
    from bookings b
    where b.bed_id = p_bed_id
      and b.status in ('confirmed', 'checked_in')
      and daterange(b.start_date, b.end_date, '[]')
          && daterange(p_start_date, p_end_date, '[]')
  ) then
    raise exception 'This bed is already booked for the selected dates';
  end if;

  insert into residents (
    full_name,
    mobile_number,
    email,
    emergency_contact,
    id_proof_type,
    id_proof_number,
    home_address,
    work_college_address,
    notes
  )
  values (
    trim(p_full_name),
    trim(p_mobile_number),
    nullif(trim(p_email), ''),
    nullif(trim(p_emergency_contact), ''),
    trim(p_id_proof_type),
    trim(p_id_proof_number),
    nullif(trim(p_home_address), ''),
    nullif(trim(p_work_college_address), ''),
    nullif(trim(p_notes), '')
  )
  returning id into v_resident_id;

  insert into bookings (
    resident_id,
    bed_id,
    start_date,
    end_date,
    monthly_rent,
    security_deposit,
    status
  )
  values (
    v_resident_id,
    p_bed_id,
    p_start_date,
    p_end_date,
    p_monthly_rent,
    coalesce(p_security_deposit, 0),
    'confirmed'
  )
  returning id into v_booking_id;

  return query
  select v_resident_id, v_booking_id;

end;
$function$;
