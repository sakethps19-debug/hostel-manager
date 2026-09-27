-- ============================================================================
-- Same fix as record_payment: record_expense and post_expense_journal were
-- two separate client-side RPC calls (NewExpenseForm.tsx) with the journal
-- call wrapped in an empty catch block. record_expense now posts the
-- journal entry itself in the same transaction as the expense insert.
-- post_expense_journal remains idempotent and is left in place unchanged.
--
-- Verified live via a rolled-back transaction: posts a balanced journal
-- entry (Dr category expense account / Cr cash-bank account) in the same
-- call as the expense insert.
-- ============================================================================
begin;

drop function if exists record_expense(text,date,text,numeric,text,text,text,text);

create or replace function record_expense(
  p_hostel_name text default null,
  p_expense_date date default current_date,
  p_category text default 'Other',
  p_amount numeric default 0,
  p_vendor text default null,
  p_payment_mode text default 'Cash',
  p_reference_number text default null,
  p_notes text default null
)
returns expenses
language plpgsql security definer set search_path to 'public' as $$
declare
  v_record expenses;
begin
  perform require_role(array['owner','finance_manager']);

  if p_amount <= 0 then
    raise exception 'Expense amount must be greater than zero.';
  end if;

  insert into expenses (
    hostel_name, expense_date, category, amount, vendor,
    payment_mode, reference_number, notes
  ) values (
    p_hostel_name, p_expense_date, p_category, p_amount, p_vendor,
    p_payment_mode, p_reference_number, p_notes
  )
  returning * into v_record;

  perform post_expense_journal(v_record.id, auth.uid());

  return v_record;
end;
$$;

commit;
