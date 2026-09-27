-- ============================================================================
-- Payment + accounting journal atomicity.
--
-- record_payment and post_payment_journal were two separate client-side RPC
-- calls (PaymentForm.tsx), with the journal call wrapped in an empty catch
-- block "surfaced via the Reconciliation page, not here". That meant a
-- successfully recorded payment could exist with NO accounting consequence
-- at all, silently, with no error shown to the user who recorded it -
-- exactly the gap run_accounting_reconciliation_checks' 'unjournaled_payment'
-- flag exists to catch after the fact, but nothing stopped it happening in
-- the first place.
--
-- record_payment now posts the journal entry itself, inside the same
-- transaction as the payment insert: if journaling fails (unknown account
-- code, unbalanced entry, or the accounting period is locked), the payment
-- insert rolls back too. A payment must not exist without its required
-- accounting consequence. post_payment_journal itself is unchanged and
-- remains idempotent (safe to call again for a payment that already has an
-- entry) - kept in place for the historical backfill migration.
--
-- Verified live via rolled-back transactions: happy path posts a balanced
-- journal entry in the same call; a locked accounting period raises and
-- rolls back the payment insert too (nothing committed).
-- ============================================================================
begin;

drop function if exists record_payment(bigint,numeric,date,date,text,text,text,text,text);

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
returns table(payment_id bigint, receipt_number text, is_new boolean, journal_entry_id bigint)
language plpgsql security definer set search_path to 'public' as $$
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

  v_journal_entry_id := post_payment_journal(v_payment_id, auth.uid());

  return query select v_payment_id, v_receipt_number, true, v_journal_entry_id;
end;
$$;

commit;
