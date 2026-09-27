-- ============================================================================
-- reverse_payment only flipped payments.status to 'reversed' - it never
-- touched the accounting ledger. If a payment had already been journaled
-- (post_payment_journal ran, or now runs atomically inside record_payment),
-- reversing the payment left the original journal entry standing,
-- overstating cash/revenue with no correcting entry. reverse_payment now
-- also posts a reversing journal entry (accounting_reverse_entry, already
-- used elsewhere for exactly this) for any journal entry linked to the
-- payment, in the same transaction as the status flip.
--
-- Verified live via a rolled-back transaction: original journal entry ends
-- up status='reversed' with reversed_by_journal_entry_id set; a new
-- 'reversal' entry is posted with flipped debit/credit lines and
-- reverses_journal_entry_id pointing back at the original.
-- ============================================================================
begin;

create or replace function reverse_payment(p_payment_id bigint, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
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
    perform accounting_reverse_entry(v_journal_entry_id, current_date, 'Payment reversed: ' || trim(p_reason), auth.uid());
  end if;
end;
$$;

commit;
