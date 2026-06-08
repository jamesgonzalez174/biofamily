CREATE OR REPLACE FUNCTION public.run_points_expiration()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  expire_at timestamptz;
  profiles_zeroed int := 0;
  pharmacies_zeroed int := 0;
BEGIN
  SELECT points_expire_at INTO expire_at FROM public.settings WHERE id = 1;
  IF expire_at IS NULL OR expire_at > now() THEN
    RETURN jsonb_build_object('ran', false, 'expire_at', expire_at);
  END IF;

  -- Record an expiration ledger entry for each user with a positive balance
  INSERT INTO public.points_ledger (user_id, delta, reason, source, reference)
  SELECT id, -points_balance, 'Points expired', 'expiration',
         'expire_' || to_char(expire_at, 'YYYYMMDDHH24MISS')
  FROM public.profiles
  WHERE points_balance > 0
  ON CONFLICT DO NOTHING;

  WITH upd AS (
    UPDATE public.profiles SET points_balance = 0
    WHERE points_balance > 0
    RETURNING 1
  ) SELECT count(*) INTO profiles_zeroed FROM upd;

  WITH upd AS (
    UPDATE public.pharmacies SET loyalty_points = 0
    WHERE loyalty_points > 0
    RETURNING 1
  ) SELECT count(*) INTO pharmacies_zeroed FROM upd;

  UPDATE public.settings SET points_expire_at = NULL WHERE id = 1;

  RETURN jsonb_build_object(
    'ran', true,
    'expire_at', expire_at,
    'profiles_zeroed', profiles_zeroed,
    'pharmacies_zeroed', pharmacies_zeroed
  );
END;
$function$;