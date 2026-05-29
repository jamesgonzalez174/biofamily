-- 1. Atomic redemption cancellation (prevents double-refund races between admins)
CREATE OR REPLACE FUNCTION public.cancel_redemption(_red_id uuid)
RETURNS public.redemptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _red public.redemptions%ROWTYPE;
BEGIN
  SELECT * INTO _red FROM public.redemptions WHERE id = _red_id FOR UPDATE;
  IF _red.id IS NULL THEN RAISE EXCEPTION 'Redemption not found'; END IF;
  IF _red.status = 'cancelled' THEN RETURN _red; END IF;
  IF _red.status = 'claimed' THEN RAISE EXCEPTION 'Cannot cancel a claimed redemption'; END IF;

  -- Refund points
  UPDATE public.profiles
    SET points_balance = points_balance + _red.points_spent
    WHERE id = _red.user_id;

  -- Restore stock
  UPDATE public.prizes SET stock = stock + 1 WHERE id = _red.prize_id;

  -- Ledger entry (unique reference prevents duplicate refund)
  INSERT INTO public.points_ledger (user_id, delta, reason, source, reference)
  VALUES (_red.user_id, _red.points_spent, 'Cancelled: ' || _red.prize_name, 'redemption_cancel', _red.id::text)
  ON CONFLICT DO NOTHING;

  UPDATE public.redemptions
    SET status = 'cancelled', updated_at = now()
    WHERE id = _red.id
  RETURNING * INTO _red;

  RETURN _red;
END;
$$;

-- 2. Unique constraint to make ledger inserts idempotent for system sources
CREATE UNIQUE INDEX IF NOT EXISTS points_ledger_source_ref_user_uniq
  ON public.points_ledger (source, reference, user_id)
  WHERE reference IS NOT NULL;

-- 3. Index to speed up per-user ledger aggregation (used by Zoho sync delta calc)
CREATE INDEX IF NOT EXISTS points_ledger_user_source_idx
  ON public.points_ledger (user_id, source);

-- 4. Index for hot profile email lookups (case-insensitive Zoho matching)
CREATE INDEX IF NOT EXISTS profiles_email_lower_idx
  ON public.profiles (lower(email));