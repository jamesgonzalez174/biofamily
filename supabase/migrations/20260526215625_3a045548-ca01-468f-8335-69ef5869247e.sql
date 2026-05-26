-- Function: expire available points when settings.points_expire_at has passed.
-- Only zeros AVAILABLE points (profiles.points_balance, pharmacies.loyalty_points).
-- History (profiles.lifetime_points, pharmacies.history_points) is preserved.
CREATE OR REPLACE FUNCTION public.run_points_expiration()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expire_at timestamptz;
  profiles_zeroed int := 0;
  pharmacies_zeroed int := 0;
BEGIN
  SELECT points_expire_at INTO expire_at FROM public.settings WHERE id = 1;
  IF expire_at IS NULL OR expire_at > now() THEN
    RETURN jsonb_build_object('ran', false, 'expire_at', expire_at);
  END IF;

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

  -- Clear the expiration so it doesn't fire again until admin sets a new date.
  UPDATE public.settings SET points_expire_at = NULL WHERE id = 1;

  RETURN jsonb_build_object(
    'ran', true,
    'expire_at', expire_at,
    'profiles_zeroed', profiles_zeroed,
    'pharmacies_zeroed', pharmacies_zeroed
  );
END;
$$;

-- Schedule daily at 00:05 UTC
DO $$
BEGIN
  PERFORM cron.unschedule('points-expiration-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'points-expiration-daily',
  '5 0 * * *',
  $$SELECT public.run_points_expiration();$$
);