-- ============================================================================
-- Fix: finalize_settlement_and_vacate's auto-recorded Deposit Refund payment
-- never posted a matching accounting journal entry.
--
-- record_payment posts a journal entry for every payment it creates (via
-- post_payment_journal, see 2026081231_make_payment_and_journal_atomic.sql),
-- but finalize_settlement_and_vacate's own internal `insert into payments`
-- for the refund (when v_refund > 0) has never done so - not a regression,
-- this was already true of the pre-atomicity finalize_settlement() this
-- function was merged from (2026081229_add_atomic_finalize_settlement_and_
-- vacate.sql, whose own comment says the body is "a straight merge of
-- finalize_settlement's and vacate_bed's existing logic, unchanged"). Found
-- while building the settlement-atomicity regression test for the UAT/test-
-- environment sprint (section 13: "success means source + journal both
-- exist... no split state").
--
-- backfill_missing_financial_journals() already exists specifically to catch
-- payments/expenses/assets missing a journal entry, which is direct evidence
-- the intended architecture requires every payment to have one - this just
-- closes the gap at the source instead of relying on a periodic backfill.
--
-- Calls accounting_post_entry(...) directly rather than post_payment_journal
-- (which independent double-checks accounting_require_role(['owner',
-- 'finance_manager'])): finalize_settlement_and_vacate is callable by
-- operations_manager too (require_role(['owner','operations_manager']) at
-- its own top), and post_payment_journal's nested role check would reject
-- an operations_manager caller who has a refund to record - accounting_post_
-- entry has no role check of its own (by design - it's the raw posting
-- primitive every *_journal wrapper calls into), so this preserves exactly
-- the same caller set finalize_settlement_and_vacate already allows.
--
-- Same signature as before, so CREATE OR REPLACE keeps existing EXECUTE
-- grants intact.
-- ============================================================================
create or replace function public.finalize_settlement_and_vacate(p_booking_id bigint, p_other_charges numeric, p_deductions jsonb, p_notes text)
 returns table(settlement_id bigint, refund_amount numeric, final_balance numeric)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  v_refund_payment_id bigint;
  v_journal_entry_id bigint;
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
    v_receipt := 'VNR-' || extract(year from (now() AT TIME ZONE 'Asia/Kolkata')::date)::text || '-' || lpad(nextval('payments_receipt_seq')::text, 4, '0');

    insert into payments (
      booking_id, resident_id, amount, payment_date, payment_type, payment_mode, notes, receipt_number
    )
    values (
      p_booking_id, v_resident_id, v_refund, (now() AT TIME ZONE 'Asia/Kolkata')::date, 'Deposit Refund', 'Cash',
      'Auto-recorded from final settlement', v_receipt
    )
    returning id into v_refund_payment_id;

    v_journal_entry_id := accounting_post_entry(
      (now() AT TIME ZONE 'Asia/Kolkata')::date,
      accounting_hostel_name_for_booking(p_booking_id),
      'payment',
      v_refund_payment_id,
      'Deposit Refund payment — booking #' || p_booking_id,
      jsonb_build_array(
        jsonb_build_object('account_code', '2160', 'debit', v_refund, 'credit', 0,
          'resident_id', v_resident_id, 'booking_id', p_booking_id),
        jsonb_build_object('account_code', coalesce(accounting_cash_account_code('Cash'), '1110'), 'debit', 0, 'credit', v_refund,
          'resident_id', v_resident_id, 'booking_id', p_booking_id)
      ),
      auth.uid()
    );
  end if;

  update bookings
  set
    status = 'completed',
    end_date = least(end_date, (now() AT TIME ZONE 'Asia/Kolkata')::date)
  where id = p_booking_id
    and status in ('confirmed', 'checked_in');

  if not found then
    raise exception 'Active booking not found';
  end if;

  return query select v_settlement_id, v_refund, v_final;
end;
$function$;
