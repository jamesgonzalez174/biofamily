## Goal

Let admins choose the daily Zoho sync timezone (including Belize, UTC-6) and time-of-day from the admin Settings page. Saving updates pg_cron immediately — no SQL editor required.

## Changes

### 1. Database (migration)

Add three columns to `public.settings`:
- `sync_timezone TEXT NOT NULL DEFAULT 'America/Belize'` (IANA tz name)
- `sync_hour SMALLINT NOT NULL DEFAULT 17` (0–23, local)
- `sync_minute SMALLINT NOT NULL DEFAULT 30` (0–59, local)

Add a `SECURITY DEFINER` function `public.reschedule_zoho_sync(_utc_hour int, _utc_minute int, _url text, _secret text)` owned by the `postgres` role that:
- Unschedules any existing job named `daily-zoho-sync` (safe if absent)
- Calls `cron.schedule('daily-zoho-sync', '<min> <hour> * * *', ...)` with a `net.http_post` body that sends `x-cron-secret: <_secret>` and an empty JSON body
- `REVOKE EXECUTE ... FROM public, anon, authenticated` and `GRANT EXECUTE ... TO service_role` so only the admin server function can invoke it

### 2. Server function (`src/lib/zoho.functions.ts`)

`updateZohoSchedule({ timezone, hour, minute })` — admin only:
- Validates timezone via `Intl.DateTimeFormat` and bounds-checks hour/minute
- Computes the UTC hour/minute equivalent using the timezone's current `shortOffset` (Belize has no DST; tz-aware projects keep working because we recompute on every save)
- Writes the three settings columns via `supabaseAdmin`
- Calls `supabaseAdmin.rpc('reschedule_zoho_sync', { _utc_hour, _utc_minute, _url, _secret: process.env.CRON_SECRET })` with the project's stable production URL `https://biofamily.lovable.app/api/public/hooks/daily-zoho-sync`
- Returns `{ ok, utcHour, utcMinute, localLabel }` for confirmation

### 3. Admin Settings UI (`src/routes/_authenticated/admin/settings.tsx`)

New "Daily Zoho sync schedule" section:
- Timezone `<select>` with curated options (Belize, UTC, NY, Chicago, Denver, LA, Mexico City, Guatemala, London) plus the project's current value if it isn't in the list
- Hour + minute pickers (minute in 5-min steps)
- "Save & reschedule" button → calls `updateZohoSchedule`, shows toast with the computed UTC time so the admin can verify
- Shows current saved local time and equivalent UTC time

### 4. Dashboard widget tweak (`src/routes/_authenticated/admin/index.tsx`)

Reads `sync_timezone`/`sync_hour`/`sync_minute` and displays the next scheduled run in local terms (e.g. "Next run: 5:30 PM Belize"). No logic changes beyond that.

## Technical notes

- pg_cron always runs in UTC. We store the admin's intended local time + IANA tz in `settings`, and compute UTC at save time. If the user later moves to a DST-observing timezone, re-saving (or any settings change) will recompute correctly.
- The `reschedule_zoho_sync` SQL function is the only place that touches the `cron`/`net` schemas, so the elevated grants stay narrow. The endpoint itself still requires `x-cron-secret` (unchanged from current security posture).
- No changes to `daily-zoho-sync.ts` route handler — secret check remains.
- Existing manually-scheduled `daily-zoho-sync` cron job will be replaced the first time an admin clicks Save.

## Files touched

- `supabase/migrations/*` (new): settings columns + `reschedule_zoho_sync` function
- `src/lib/zoho.functions.ts`: add `updateZohoSchedule`
- `src/routes/_authenticated/admin/settings.tsx`: new schedule section
- `src/routes/_authenticated/admin/index.tsx`: show next run in local time
