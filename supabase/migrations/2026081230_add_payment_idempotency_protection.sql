-- ============================================================================
-- Duplicate payment hardening.
--
-- record_payment had zero idempotency protection: a double-click, a browser
-- retry after a dropped response, or a resubmitted form after a page
-- refresh could insert two identical payment rows for the same booking. The
-- fix is NOT to block two genuine payments of the same amount (a resident
-- can legitimately pay the same monthly rent twice in different months, or
-- make two identical top-ups) - it is to make a specific SUBMISSION
-- idempotent: the same client-generated idempotency key, resubmitted, must
-- return the original payment rather than create a second one. This
-- mirrors the exact pattern already used for message sends
-- (resident_messages.idempotency_key / reserve_resident_message).
--
-- Verified live via rolled-back transactions: two calls with the same key
-- return the same payment_id/receipt_number (is_new=false on the repeat,
-- no duplicate row); two calls with different keys for the identical
-- amount/booking/mode both insert as new (genuine duplicates are not
-- blocked). Receipt numbering itself was already concurrency-safe
-- (nextval() on payments_receipt_seq is atomic) - no change needed there.
-- ============================================================================
begin;

alter table payments add column if not exists idempotency_key text;

create unique index if not exists payments_idempotency_key_key
  on payments (idempotency_key)
  where idempotency_key is not null;

create or replace function record_payment(
  p_booking_id bigint,
  p_amount numeric,
  p_payment_date date,
  p_payment_for_month date,
  p_payment_type text,
  p_payment_mode text,
  p_reference_number text,
  p_notes text,
  p_idempotency_key text default null
)
returns table(payment_id bigint, receipt_number text, is_new boolean)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_resident_id bigint;
  v_payment_id bigint;
  v_receipt_number text;
  v_existing_id bigint;
  v_existing_receipt text;
begin
  perform require_role(array['owner','finance_manager']);

  if p_idempotency_key is not null then
    select p.id, p.receipt_number into v_existing_id, v_existing_receipt
    from payments p where p.idempotency_key = p_idempotency_key;

    if v_existing_id is not null then
      -- A resubmitted request carrying the same idempotency key (retry
      -- after a network error, a resubmitted form) reuses this exact
      -- payment rather than recording it twice.
      return query select v_existing_id, v_existing_receipt, false;
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

  v_receipt_number := 'VNR-' || extract(year from current_date)::text || '-' || lpad(nextval('payments_receipt_seq')::text, 4, '0');

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

  return query select v_payment_id, v_receipt_number, true;
end;
$$;

commit;
