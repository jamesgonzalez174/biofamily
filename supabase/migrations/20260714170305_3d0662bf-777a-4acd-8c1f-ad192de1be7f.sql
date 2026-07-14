
DO $$
DECLARE
  jid bigint;
  cmd text;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'daily-points-expiry-reminders';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;

  cmd := $cmd$SELECT net.http_post(
    url := 'https://project--fa8a5738-bec8-4b7b-8fff-00ca0fe8109e.lovable.app/api/public/hooks/points-expiry-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', private.get_cron_secret('zoho_sync')
    ),
    body := '{}'::jsonb
  );$cmd$;

  PERFORM cron.schedule('daily-points-expiry-reminders', '0 15 * * *', cmd);
END $$;
