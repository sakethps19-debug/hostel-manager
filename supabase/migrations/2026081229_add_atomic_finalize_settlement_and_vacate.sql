-- ============================================================================
-- Settlement + vacate atomicity fix.
--
-- The previous flow called finalize_settlement(...) and then vacate_bed(...)
-- as two SEPARATE RPC round-trips from the client (SettlementForm.tsx). If
-- the first succeeded and the second failed or never ran (network drop, tab
-- closed, browser crash between the two calls), a resident ended up
-- financially settled (a settlements row + possibly a Deposit Refund
-- payment exist) while their booking was still 'confirmed'/'checked_in' -
-- i.e. still occupying the bed. This function combines both operations into
-- a single SECURITY DEFINER transaction: either the whole settlement +
-- vacate transition commits, or none of it does.
--
-- Body is a straight merge of finalize_settlement's and vacate_bed's
-- existing logic, unchanged, so all history/audit behavior (settlements
-- row, settlement_deductions rows, auto-recorded Deposit Refund payment,
-- receipt numbering) is preserved exactly. finalize_settlement and
-- vacate_bed themselves are left in place (unused elsewhere is fine; they
-- are not being removed this sprint to avoid an unnecessary blast radius).
--
-- Verified live via rolled-back transactions: commits settlement + vacate
-- atomically for owner/operations_manager, rejects finance_manager with
-- "Insufficient permissions", and a second call against an already-settled
-- booking raises "This booking already has a settlement recorded".
-- ============================================================================
begin;

create or replace function finalize_settlement_and_vacate(
  p_booking_id bigint,
  p_other_charges numeric,
  p_deductions jsonb,
  p_notes text
)
returns table(settlement_id bigint, refund_amount numeric, final_balance numeric)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_ledger record;
  v_deposit_received numeric;
  v_deposit_refunded numeric;
  v_deposit_held numeric;
  v_deductions_total numeric := 0;
  v_refund numeric;
  v_final numeric;
  v_settlement_id bigint;
  v_other_charges numeric;
  v_item jsonb;
  v_existing_settlement_id bigint;
  v_resident_id bigint;
  v_receipt text;
  v_outstanding_rent numeric;
begin
  perform require_role(array['owner','operations_manager']);

  select id into v_existing_settlement_id from settlements where booking_id = p_booking_id;
  if v_existing_settlement_id is not null then
    raise exception 'This booking already has a settlement recorded';
  end if;

  select * into v_ledger from get_booking_ledger(p_booking_id);
  v_outstanding_rent := greatest(v_ledger.balance_outstanding, 0);

  select coalesce(sum(p.amount), 0) into v_deposit_received
  from payments p
  where p.booking_id = p_booking_id and p.payment_type = 'Security Deposit' and p.status = 'active';

  select coalesce(sum(p.amount), 0) into v_deposit_refunded
  from payments p
  where p.booking_id = p_booking_id and p.payment_type = 'Deposit Refund' and p.status = 'active';

  v_deposit_held := v_deposit_received - v_deposit_refunded;

  v_other_charges := coalesce(p_other_charges, 0);

  if p_deductions is not null then
    for v_item in select * from jsonb_array_elements(p_deductions)
    loop
      v_deductions_total := v_deductions_total + coalesce((v_item->>'amount')::numeric, 0);
    end loop;
  end if;

  v_final := v_deposit_held - v_outstanding_rent - v_other_charges - v_deductions_total;
  v_refund := greatest(v_final, 0);

  insert into settlements (
    booking_id, outstanding_rent, other_charges, deposit_held,
    deductions_total, refund_amount, final_balance, notes
  )
  values (
    p_booking_id, v_outstanding_rent, v_other_charges, v_deposit_held,
    v_deductions_total, v_refund, v_final, nullif(trim(p_notes), '')
  )
  returning id into v_settlement_id;

  if p_deductions is not null then
    for v_item in select * from jsonb_array_elements(p_deductions)
    loop
      insert into settlement_deductions (settlement_id, category, amount, notes)
      values (
        v_settlement_id,
        v_item->>'category',
        coalesce((v_item->>'amount')::numeric, 0),
        nullif(trim(v_item->>'notes'), '')
      );
    end loop;
  end if;

  if v_refund > 0 then
    select resident_id into v_resident_id from bookings where id = p_booking_id;
    v_receipt := 'VNR-' || extract(year from current_date)::text || '-' || lpad(nextval('payments_receipt_seq')::text, 4, '0');

    insert into payments (
      booking_id, resident_id, amount, payment_date, payment_type, payment_mode, notes, receipt_number
    )
    values (
      p_booking_id, v_resident_id, v_refund, current_date, 'Deposit Refund', 'Cash',
      'Auto-recorded from final settlement', v_receipt
    );
  end if;

  update bookings
  set
    status = 'completed',
    end_date = least(end_date, current_date)
  where id = p_booking_id
    and status in ('confirmed', 'checked_in');

  if not found then
    raise exception 'Active booking not found';
  end if;

  return query select v_settlement_id, v_refund, v_final;
end;
$$;

commit;
