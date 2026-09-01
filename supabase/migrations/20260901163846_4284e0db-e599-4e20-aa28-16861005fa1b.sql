CREATE OR REPLACE FUNCTION public.distribute_invoice_points_once(_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _inv public.invoices%ROWTYPE;
  _ph public.pharmacies%ROWTYPE;
  _member record;
  _member_count integer := 0;
  _share integer := 0;
  _tickets integer := 0;
  _ticket_share integer := 0;
  _tickets_on boolean := false;
  _inserted_id uuid;
  _credited_count integer := 0;
BEGIN
  SELECT * INTO _inv
  FROM public.invoices
  WHERE id = _invoice_id
  FOR UPDATE;

  IF _inv.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF _inv.points_distributed_at IS NOT NULL THEN
    RETURN jsonb_build_object('distributed', false, 'reason', 'already_distributed');
  END IF;

  IF NOT COALESCE(_inv.points_given, false)
     OR COALESCE(_inv.total_points, 0) <= 0
     OR _inv.pharmacy_id IS NULL THEN
    RETURN jsonb_build_object('distributed', false, 'reason', 'not_eligible');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.points_ledger
    WHERE source = 'zoho_invoice'
      AND reference = _inv.zoho_invoice_id
  ) THEN
    UPDATE public.invoices
    SET points_distributed_at = now()
    WHERE id = _inv.id;
    RETURN jsonb_build_object('distributed', false, 'reason', 'ledger_exists');
  END IF;

  SELECT * INTO _ph
  FROM public.pharmacies
  WHERE id = _inv.pharmacy_id
  FOR UPDATE;

  IF _ph.id IS NULL THEN
    RETURN jsonb_build_object('distributed', false, 'reason', 'pharmacy_missing');
  END IF;

  SELECT COUNT(*)::integer INTO _member_count
  FROM public.profiles
  WHERE pharmacy_id = _inv.pharmacy_id;

  _share := CASE WHEN _member_count > 0 THEN floor(_inv.total_points::numeric / _member_count)::integer ELSE 0 END;

  SELECT COALESCE(tickets_enabled, false) INTO _tickets_on FROM public.settings WHERE id = 1;

  -- Tickets: 1% of the invoice total, rounded to the nearest whole ticket,
  -- split across members. Every member always gets at least 1 ticket, so a
  -- small invoice (e.g. under 100) with 3 members still gives 1 ticket each.
  IF COALESCE(_tickets_on, false) THEN
    _tickets := GREATEST(0, round(COALESCE(_inv.total, 0) * 0.01)::integer);
    IF _member_count > 0 THEN
      _ticket_share := GREATEST(1, floor(_tickets::numeric / _member_count)::integer);
      _tickets := GREATEST(_tickets, _ticket_share * _member_count);
    ELSE
      _ticket_share := 0;
    END IF;
    UPDATE public.invoices SET total_tickets = _tickets WHERE id = _inv.id;
  END IF;

  UPDATE public.pharmacies
  SET
    history_points = history_points + _inv.total_points,
    loyalty_points = loyalty_points + _inv.total_points,
    tickets = tickets + _tickets
  WHERE id = _inv.pharmacy_id;

  IF _share > 0 OR _ticket_share > 0 THEN
    FOR _member IN
      SELECT id
      FROM public.profiles
      WHERE pharmacy_id = _inv.pharmacy_id
      ORDER BY id
      FOR UPDATE
    LOOP
      INSERT INTO public.points_ledger (user_id, delta, reason, source, reference)
      VALUES (
        _member.id,
        _share,
        'Invoice ' || COALESCE(_inv.invoice_number, _inv.zoho_invoice_id) || ' — ' || _inv.total_points || ' pts split across ' || _member_count,
        'zoho_invoice',
        _inv.zoho_invoice_id
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO _inserted_id;

      IF _inserted_id IS NOT NULL THEN
        UPDATE public.profiles
        SET
          points_balance = points_balance + _share,
          lifetime_points = lifetime_points + _share,
          tickets = tickets + _ticket_share
        WHERE id = _member.id;
        _credited_count := _credited_count + 1;
      END IF;
      _inserted_id := NULL;
    END LOOP;
  END IF;

  UPDATE public.invoices
  SET points_distributed_at = now()
  WHERE id = _inv.id;

  RETURN jsonb_build_object(
    'distributed', true,
    'members', _member_count,
    'share', _share,
    'tickets', _tickets,
    'ticket_share', _ticket_share,
    'credited', _credited_count
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.distribute_invoice_points_once(uuid) FROM anon, authenticated;