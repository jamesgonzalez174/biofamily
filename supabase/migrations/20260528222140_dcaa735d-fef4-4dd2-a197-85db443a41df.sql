CREATE OR REPLACE FUNCTION public.create_redemption(_user_id uuid, _prize_id uuid)
 RETURNS public.redemptions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _balance int;
  _prize public.prizes%ROWTYPE;
  _red public.redemptions%ROWTYPE;
BEGIN
  SELECT points_balance INTO _balance
  FROM public.profiles WHERE id = _user_id
  FOR UPDATE;
  IF _balance IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;

  SELECT * INTO _prize FROM public.prizes WHERE id = _prize_id FOR UPDATE;
  IF _prize.id IS NULL THEN RAISE EXCEPTION 'Prize not found'; END IF;
  IF NOT _prize.is_active THEN RAISE EXCEPTION 'Prize is not available'; END IF;
  IF _prize.stock <= 0 THEN RAISE EXCEPTION 'Prize is out of stock'; END IF;
  IF _balance < _prize.point_cost THEN RAISE EXCEPTION 'Not enough points'; END IF;

  UPDATE public.prizes SET stock = stock - 1 WHERE id = _prize.id;

  UPDATE public.profiles
    SET points_balance = points_balance - _prize.point_cost
    WHERE id = _user_id;

  INSERT INTO public.redemptions (user_id, prize_id, prize_name, points_spent, status)
  VALUES (_user_id, _prize.id, _prize.name, _prize.point_cost, 'pending')
  RETURNING * INTO _red;

  INSERT INTO public.points_ledger (user_id, delta, reason, source, reference)
  VALUES (_user_id, -_prize.point_cost, 'Redeemed: ' || _prize.name, 'redemption', _red.id::text);

  RETURN _red;
END;
$function$;