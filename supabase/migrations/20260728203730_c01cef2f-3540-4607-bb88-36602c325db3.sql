-- Remove duplicate cached invoice rows defensively before adding a normalized invoice-number rule.
-- Keep the already-distributed row first, otherwise the newest synced row.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY upper(trim(invoice_number))
      ORDER BY
        (points_distributed_at IS NOT NULL) DESC,
        last_synced_at DESC,
        created_at DESC,
        id DESC
    ) AS rn
  FROM public.invoices
  WHERE invoice_number IS NOT NULL AND trim(invoice_number) <> ''
)
DELETE FROM public.invoices i
USING ranked r
WHERE i.id = r.id
  AND r.rn > 1
  AND i.points_distributed_at IS NULL;

-- If any distributed duplicate groups still exist, keep the first distributed row
-- and blank the invoice number on the later rows rather than deleting point history.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY upper(trim(invoice_number))
      ORDER BY
        (points_distributed_at IS NOT NULL) DESC,
        last_synced_at DESC,
        created_at DESC,
        id DESC
    ) AS rn
  FROM public.invoices
  WHERE invoice_number IS NOT NULL AND trim(invoice_number) <> ''
)
UPDATE public.invoices i
SET invoice_number = NULL
FROM ranked r
WHERE i.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_invoice_number_normalized_key
  ON public.invoices (upper(trim(invoice_number)))
  WHERE invoice_number IS NOT NULL AND trim(invoice_number) <> '';

CREATE OR REPLACE FUNCTION public.distribute_invoice_points_once(_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv public.invoices%ROWTYPE;
  _ph public.pharmacies%ROWTYPE;
  _member record;
  _member_count integer := 0;
  _share integer := 0;
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

  UPDATE public.pharmacies
  SET
    history_points = history_points + _inv.total_points,
    loyalty_points = loyalty_points + _inv.total_points
  WHERE id = _inv.pharmacy_id;

  IF _share > 0 THEN
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
          lifetime_points = lifetime_points + _share
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
    'credited', _credited_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.distribute_invoice_points_once(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.distribute_invoice_points_once(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.distribute_invoice_points_once(uuid) TO service_role;