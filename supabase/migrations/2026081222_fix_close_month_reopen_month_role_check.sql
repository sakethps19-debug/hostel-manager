-- ============================================================================
-- close_month/reopen_month had zero role check - any authenticated user
-- (including operations_manager or finance_manager) could forge/clear a
-- monthly_finance_close record directly via RPC, bypassing the page's
-- owner-only gate. Found by an independent review agent, confirmed live.
-- ============================================================================
begin;

create or replace function close_month(p_month integer, p_year integer, p_notes text)
returns bigint language plpgsql security definer set search_path to 'public' as $$
DECLARE
  v_id bigint;
  v_rent_revenue numeric := 0;
  v_other_revenue numeric := 0;
  v_operating_expenses numeric := 0;
  v_net_surplus numeric := 0;
  v_outstanding_rent numeric := 0;
  v_deposits_held numeric := 0;
BEGIN
  PERFORM require_role(array['owner']);

  IF EXISTS (
    SELECT 1 FROM monthly_finance_closes
    WHERE month = p_month AND year = p_year AND reopened_at IS NULL
  ) THEN
    RAISE EXCEPTION '% / % is already closed.', p_month, p_year;
  END IF;

  SELECT
    coalesce(sum(rent_revenue), 0),
    coalesce(sum(other_revenue), 0),
    coalesce(sum(operating_expenses), 0),
    coalesce(sum(net_surplus), 0)
  INTO v_rent_revenue, v_other_revenue, v_operating_expenses, v_net_surplus
  FROM get_hostel_pnl(p_month, p_year);

  SELECT
    coalesce(sum(outstanding_rent_total), 0),
    coalesce(sum(deposits_held_total), 0)
  INTO v_outstanding_rent, v_deposits_held
  FROM get_hostel_metrics_snapshot();

  INSERT INTO monthly_finance_closes (
    month, year, rent_revenue, other_revenue, operating_expenses,
    net_surplus, outstanding_rent_total, deposits_held_total, notes, closed_by
  )
  VALUES (
    p_month, p_year, v_rent_revenue, v_other_revenue, v_operating_expenses,
    v_net_surplus, v_outstanding_rent, v_deposits_held, p_notes, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

create or replace function reopen_month(p_month integer, p_year integer)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  perform require_role(array['owner']);

  UPDATE monthly_finance_closes
  SET reopened_by = auth.uid(),
      reopened_at = now()
  WHERE month = p_month AND year = p_year AND reopened_at IS NULL;
end;
$$;

commit;
