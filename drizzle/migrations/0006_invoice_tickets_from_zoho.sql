ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS zoho_tickets integer NOT NULL DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tickets_distributed_at timestamptz;
CREATE INDEX IF NOT EXISTS invoices_tickets_distributed_at_idx ON public.invoices (tickets_distributed_at);

CREATE OR REPLACE FUNCTION public.distribute_invoice_tickets_once(_invoice_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _inv public.invoices%ROWTYPE;
  _member_count integer := 0;
  _share integer := 0;
  _total integer := 0;
  _on boolean := false;
BEGIN
  SELECT * INTO _inv FROM public.invoices WHERE id = _invoice_id FOR UPDATE;
  IF _inv.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF _inv.tickets_distributed_at IS NOT NULL THEN
    RETURN jsonb_build_object('distributed', false, 'reason', 'already_distributed');
  END IF;
  SELECT COALESCE(tickets_enabled, false) INTO _on FROM public.settings WHERE id = 1;
  IF NOT COALESCE(_on, false) THEN
    RETURN jsonb_build_object('distributed', false, 'reason', 'tickets_disabled');
  END IF;
  IF COALESCE(_inv.zoho_tickets, 0) <= 0 OR _inv.pharmacy_id IS NULL THEN
    RETURN jsonb_build_object('distributed', false, 'reason', 'not_eligible');
  END IF;

  SELECT COUNT(*)::int INTO _member_count FROM public.profiles WHERE pharmacy_id = _inv.pharmacy_id;
  IF _member_count = 0 THEN
    RETURN jsonb_build_object('distributed', false, 'reason', 'no_members');
  END IF;

  -- Split evenly; every member gets at least 1.
  _share := GREATEST(1, floor(_inv.zoho_tickets::numeric / _member_count)::int);
  _total := _share * _member_count;

  UPDATE public.profiles SET tickets = tickets + _share WHERE pharmacy_id = _inv.pharmacy_id;
  UPDATE public.pharmacies SET tickets = tickets + _total WHERE id = _inv.pharmacy_id;
  UPDATE public.invoices SET total_tickets = _total, tickets_distributed_at = now() WHERE id = _inv.id;

  RETURN jsonb_build_object('distributed', true, 'members', _member_count, 'share', _share, 'tickets', _total);
END;
$$;
REVOKE ALL ON FUNCTION public.distribute_invoice_tickets_once(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_invoice_tickets_once(uuid) TO service_role;