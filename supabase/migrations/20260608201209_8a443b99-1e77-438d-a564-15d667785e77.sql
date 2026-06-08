ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS sync_timezone TEXT NOT NULL DEFAULT 'America/Belize',
  ADD COLUMN IF NOT EXISTS sync_hour SMALLINT NOT NULL DEFAULT 17,
  ADD COLUMN IF NOT EXISTS sync_minute SMALLINT NOT NULL DEFAULT 30;

ALTER TABLE public.settings
  DROP CONSTRAINT IF EXISTS settings_sync_hour_check,
  DROP CONSTRAINT IF EXISTS settings_sync_minute_check;
ALTER TABLE public.settings
  ADD CONSTRAINT settings_sync_hour_check CHECK (sync_hour BETWEEN 0 AND 23),
  ADD CONSTRAINT settings_sync_minute_check CHECK (sync_minute BETWEEN 0 AND 59);

CREATE OR REPLACE FUNCTION public.reschedule_zoho_sync(
  _utc_hour int,
  _utc_minute int,
  _url text,
  _secret text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, net
AS $$
DECLARE
  jid bigint;
  new_jid bigint;
  schedule_expr text;
  command_sql text;
BEGIN
  IF _utc_hour < 0 OR _utc_hour > 23 OR _utc_minute < 0 OR _utc_minute > 59 THEN
    RAISE EXCEPTION 'Invalid hour/minute';
  END IF;

  schedule_expr := _utc_minute::text || ' ' || _utc_hour::text || ' * * *';

  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'daily-zoho-sync';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;

  command_sql := format(
    $cmd$SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', %L
      ),
      body := '{}'::jsonb
    );$cmd$,
    _url, _secret
  );

  SELECT cron.schedule('daily-zoho-sync', schedule_expr, command_sql) INTO new_jid;
  RETURN new_jid;
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_zoho_sync(int, int, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_zoho_sync(int, int, text, text) TO service_role;