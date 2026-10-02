CREATE TABLE public.ticket_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  pharmacy_id uuid REFERENCES public.pharmacies(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tickets integer NOT NULL,
  zoho_tickets integer NOT NULL,
  member_count integer NOT NULL,
  is_backfill boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_ledger_invoice_idx ON public.ticket_ledger(invoice_id);
CREATE INDEX ticket_ledger_user_idx ON public.ticket_ledger(user_id);
GRANT SELECT ON public.ticket_ledger TO authenticated;
GRANT ALL ON public.ticket_ledger TO service_role;
ALTER TABLE public.ticket_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read ticket ledger" ON public.ticket_ledger FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Backfill: reconstruct from currently-linked members for already-distributed invoices.
INSERT INTO public.ticket_ledger (invoice_id, pharmacy_id, user_id, tickets, zoho_tickets, member_count, is_backfill, created_at)
SELECT i.id, i.pharmacy_id, p.id,
  (i.total_tickets / NULLIF(m.cnt,0))::int, i.zoho_tickets, m.cnt, true, i.tickets_distributed_at
FROM public.invoices i
JOIN LATERAL (SELECT COUNT(*)::int cnt FROM public.profiles WHERE pharmacy_id = i.pharmacy_id) m ON true
JOIN public.profiles p ON p.pharmacy_id = i.pharmacy_id
WHERE i.tickets_distributed_at IS NOT NULL AND COALESCE(i.total_tickets,0) > 0 AND m.cnt > 0;

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
  _share := GREATEST(1, floor(_inv.zoho_tickets::numeric / _member_count)::int);
  _total := _share * _member_count;

  INSERT INTO public.ticket_ledger (invoice_id, pharmacy_id, user_id, tickets, zoho_tickets, member_count)
  SELECT _inv.id, _inv.pharmacy_id, id, _share, _inv.zoho_tickets, _member_count
  FROM public.profiles WHERE pharmacy_id = _inv.pharmacy_id;

  UPDATE public.profiles SET tickets = tickets + _share WHERE pharmacy_id = _inv.pharmacy_id;
  UPDATE public.pharmacies SET tickets = tickets + _total WHERE id = _inv.pharmacy_id;
  UPDATE public.invoices SET total_tickets = _total, tickets_distributed_at = now() WHERE id = _inv.id;
  RETURN jsonb_build_object('distributed', true, 'members', _member_count, 'share', _share, 'tickets', _total);
END;
$$;
REVOKE ALL ON FUNCTION public.distribute_invoice_tickets_once(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_invoice_tickets_once(uuid) TO service_role;