
## Goal

Replace the manual `ZOHO_REFRESH_TOKEN` secret with a one-click OAuth connect flow on the admin page. The admin clicks **Connect Zoho**, picks an organization, authorizes in a popup, and the token is stored in the database — auto-refreshed, region-aware, no copy-paste.

## Database

New migration:

```sql
CREATE TABLE public.zoho_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_org_id text NOT NULL UNIQUE,
  zoho_org_name text,
  region text NOT NULL,                 -- 'com' | 'eu' | 'in' | 'com.au' | 'jp'
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  connected_by uuid,                    -- auth user id
  connected_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
-- admin-only via has_role; service_role full access
```

Old `ZOHO_REFRESH_TOKEN` / `ZOHO_DC` / `ZOHO_ORGANIZATION_ID` secrets become unused (leave in place; we read from DB instead).

## Edge functions (3)

All under `supabase/functions/`, `verify_jwt = false` only on the callback.

1. **`get-zoho-client-id`** — returns `{ clientId: process.env.ZOHO_CLIENT_ID }` to the frontend so it can build the consent URL. Admin-only.
2. **`list-zoho-organizations`** — given a region + temp access token (from initial auth), calls `https://www.zohoapis.<region>/books/v3/organizations` and returns the list. Used by the picker after first OAuth round-trip.
3. **`zoho-oauth-callback`** — public. Receives `?code=&location=&state=`, maps `location` → region, exchanges code at `https://accounts.zoho.<region>/oauth/v2/token`, stores tokens + org info in `zoho_connections`, returns an HTML page that `postMessage`s `ZOHO_OAUTH_SUCCESS` and closes.

State payload: `{ user_id, nonce }` (no org_id needed — single tenant).

## Server-side token helper (rewrite)

`src/lib/zoho-api.server.ts` → instead of reading `process.env.ZOHO_REFRESH_TOKEN`:

- Read the single row from `zoho_connections` via `supabaseAdmin`.
- If `expires_at` is >60s away, return `access_token`.
- Otherwise POST to `accounts.zoho.<region>/oauth/v2/token` with the stored refresh token, update the row, return new access token.
- `fetchZohoContact` and the webhook processor pick up `region` + `zoho_org_id` from the same row.

This replaces the broken manual refresh-token flow everywhere (webhook included).

## Admin UI

New page `/admin/zoho-connect` (replaces `zoho-exchange`):

- Shows current connection status (org name, region, last refreshed) or "Not connected".
- **Connect Zoho** button → calls `get-zoho-client-id`, builds:
  ```
  https://accounts.zoho.com/oauth/v2/auth?
    response_type=code&
    client_id=<id>&
    scope=ZohoBooks.fullaccess.all&
    redirect_uri=<edge>/zoho-oauth-callback&
    access_type=offline&prompt=consent&
    state=<signed payload>
  ```
  Opens in popup; listens for `ZOHO_OAUTH_SUCCESS` message → toast + refresh.
- **Disconnect** button → deletes the row.

`/admin/zoho-test` keeps working (reads from DB now instead of env).

## Files

- create: `supabase/migrations/<ts>_zoho_connections.sql`
- create: `supabase/functions/get-zoho-client-id/index.ts`
- create: `supabase/functions/list-zoho-organizations/index.ts`
- create: `supabase/functions/zoho-oauth-callback/index.ts`
- create: `src/routes/_authenticated/admin/zoho-connect.tsx`
- edit:   `src/lib/zoho-api.server.ts` (DB-backed tokens)
- edit:   `src/lib/zoho.functions.ts` (testZohoConnection reads DB)
- edit:   `src/routeTree.gen.ts`
- delete: `src/routes/_authenticated/admin/zoho-exchange.tsx` (obsolete)

## What stays the same

- `zoho-webhook` route, `zoho-process.server.ts`, `zoho_customers`, `zoho_events` — unchanged. They just call the rewritten `getZohoAccessToken()` which now reads from `zoho_connections`.

## Redirect URI to register in Zoho

You'll need to add this exact URL to your Zoho self-client's **Authorized Redirect URIs** before connecting:

```
https://ihwvggkplxbszqnknzyx.supabase.co/functions/v1/zoho-oauth-callback
```

## Risks / notes

- The existing `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` secrets are reused — no new secrets needed.
- Scope `ZohoBooks.fullaccess.all` matches what your current setup needs; can be narrowed later.
- Single-row table: enforced by application logic (just upsert on `zoho_org_id`).
