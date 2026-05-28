
-- 1) Redemptions TOCTOU: remove client-side INSERT policy. All redemptions
-- must go through the server function (redeemPrize) which uses the admin
-- client and performs validation atomically via the helper below.
DROP POLICY IF EXISTS "Users insert own redemptions" ON public.redemptions;

-- Atomic redemption helper: locks the user's profile row, validates balance,
-- stock, prize state, decrements stock, and inserts the redemption row in a
-- single transaction. Use from the server function via supabaseAdmin.rpc.
CREATE OR REPLACE FUNCTION public.create_redemption(_user_id uuid, _prize_id uuid)
RETURNS public.redemptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _balance int;
  _prize public.prizes%ROWTYPE;
  _red public.redemptions%ROWTYPE;
BEGIN
  -- Lock the user's profile to serialize concurrent redemptions
  SELECT points_balance INTO _balance
  FROM public.profiles WHERE id = _user_id
  FOR UPDATE;
  IF _balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- Lock the prize row to serialize stock decrement
  SELECT * INTO _prize FROM public.prizes WHERE id = _prize_id FOR UPDATE;
  IF _prize.id IS NULL THEN RAISE EXCEPTION 'Prize not found'; END IF;
  IF NOT _prize.is_active THEN RAISE EXCEPTION 'Prize is not available'; END IF;
  IF _prize.stock <= 0 THEN RAISE EXCEPTION 'Prize is out of stock'; END IF;
  IF _balance < _prize.point_cost THEN RAISE EXCEPTION 'Not enough points'; END IF;

  UPDATE public.prizes SET stock = stock - 1 WHERE id = _prize.id;

  INSERT INTO public.redemptions (user_id, prize_id, prize_name, points_spent, status)
  VALUES (_user_id, _prize.id, _prize.name, _prize.point_cost, 'pending')
  RETURNING * INTO _red;

  RETURN _red;
END;
$$;

REVOKE ALL ON FUNCTION public.create_redemption(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_redemption(uuid, uuid) TO service_role;

-- 2) Zoho connections: restrict OAuth tokens to service_role only.
-- Admins no longer get direct table access; metadata is read via server
-- functions that use the admin client (e.g. getZohoConnection).
DROP POLICY IF EXISTS "Admins manage zoho_connections" ON public.zoho_connections;
DROP POLICY IF EXISTS "Admins read zoho_connections" ON public.zoho_connections;

REVOKE ALL ON public.zoho_connections FROM anon, authenticated;
GRANT ALL ON public.zoho_connections TO service_role;
