
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM public, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.cron_secrets (
  name text PRIMARY KEY,
  secret text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.cron_secrets FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.get_cron_secret(_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private
AS $fn$
  SELECT secret FROM private.cron_secrets WHERE name = _name;
$fn$;
REVOKE ALL ON FUNCTION private.get_cron_secret(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_cron_secret(text) TO postgres;

CREATE OR REPLACE FUNCTION public.reschedule_zoho_sync(_utc_hour integer, _utc_minute integer, _url text, _secret text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'net', 'private'
AS $fn$
DECLARE
  jid bigint;
  new_jid bigint;
  schedule_expr text;
  command_sql text;
BEGIN
  IF _utc_hour < 0 OR _utc_hour > 23 OR _utc_minute < 0 OR _utc_minute > 59 THEN
    RAISE EXCEPTION 'Invalid hour/minute';
  END IF;

  INSERT INTO private.cron_secrets(name, secret, updated_at)
  VALUES ('zoho_sync', _secret, now())
  ON CONFLICT (name) DO UPDATE SET secret = EXCLUDED.secret, updated_at = now();

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
        'x-cron-secret', private.get_cron_secret('zoho_sync')
      ),
      body := '{}'::jsonb
    );$cmd$,
    _url
  );

  SELECT cron.schedule('daily-zoho-sync', schedule_expr, command_sql) INTO new_jid;
  RETURN new_jid;
END;
$fn$;

DO $do$
DECLARE
  existing record;
  current_secret text;
  current_url text;
  new_command text;
BEGIN
  SELECT jobid, schedule, command INTO existing
    FROM cron.job WHERE jobname = 'daily-zoho-sync';
  IF existing.jobid IS NULL THEN RETURN; END IF;

  current_secret := (regexp_match(existing.command, '''x-cron-secret'',\s*''([^'']+)'''))[1];
  current_url    := (regexp_match(existing.command, 'url\s*:=\s*''([^'']+)'''))[1];

  IF current_secret IS NULL OR current_url IS NULL THEN RETURN; END IF;

  INSERT INTO private.cron_secrets(name, secret, updated_at)
  VALUES ('zoho_sync', current_secret, now())
  ON CONFLICT (name) DO UPDATE SET secret = EXCLUDED.secret, updated_at = now();

  new_command := format(
    $cmd$SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', private.get_cron_secret('zoho_sync')
      ),
      body := '{}'::jsonb
    );$cmd$,
    current_url
  );

  PERFORM cron.unschedule(existing.jobid);
  PERFORM cron.schedule('daily-zoho-sync', existing.schedule, new_command);
END $do$;
