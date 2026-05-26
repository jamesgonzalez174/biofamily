// Public OAuth callback. Exchanges the grant code at the right region,
// fetches the org list, and stores the connection in zoho_connections.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Map Zoho's `location` param (or accounts-server domain) to the region suffix.
function regionFromLocation(loc: string | null, accountsServer: string | null): string {
  const l = (loc || "").toLowerCase();
  if (l === "us") return "com";
  if (l === "eu") return "eu";
  if (l === "in") return "in";
  if (l === "au") return "com.au";
  if (l === "jp") return "jp";
  if (l === "ca") return "ca";
  if (l === "cn") return "com.cn";
  if (l === "sa") return "sa";
  if (accountsServer) {
    const m = accountsServer.match(/accounts\.zoho\.([a-z.]+)/i);
    if (m) return m[1];
  }
  return "com";
}

function html(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function popupResponse(payload: Record<string, unknown>) {
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return html(`<!doctype html><html><body>
<script>
  (function(){
    try { window.opener && window.opener.postMessage(${json}, "*"); } catch(e) {}
    document.body.innerText = ${JSON.stringify(payload.ok ? "Connected. You can close this window." : "Connection failed: " + (payload.error || "unknown"))};
    setTimeout(function(){ try{ window.close(); }catch(e){} }, 800);
  })();
</script>
</body></html>`);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const location = url.searchParams.get("location");
  const accountsServer = url.searchParams.get("accounts-server");

  if (error) return popupResponse({ ok: false, error });
  if (!code) return popupResponse({ ok: false, error: "missing_code" });

  const clientId = Deno.env.get("ZOHO_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOHO_CLIENT_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!clientId || !clientSecret || !supabaseUrl || !serviceKey) {
    return popupResponse({ ok: false, error: "server_misconfigured" });
  }

  const region = regionFromLocation(location, accountsServer);
  const redirectUri = `${supabaseUrl}/functions/v1/zoho-oauth-callback`;

  // Exchange code -> tokens
  const tokenRes = await fetch(`https://accounts.zoho.${region}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  });
  const tokenJson: any = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenJson?.access_token || !tokenJson?.refresh_token) {
    return popupResponse({
      ok: false,
      error: tokenJson?.error || `token_exchange_failed_${tokenRes.status}`,
    });
  }

  const accessToken: string = tokenJson.access_token;
  const refreshToken: string = tokenJson.refresh_token;
  const expiresInSec: number = Number(tokenJson.expires_in ?? 3600);
  const apiDomain: string = tokenJson.api_domain || `https://www.zohoapis.${region}`;

  // Get the organization (use first by default)
  const orgsRes = await fetch(`${apiDomain}/books/v3/organizations`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: "application/json" },
  });
  const orgsJson: any = await orgsRes.json().catch(() => ({}));
  const orgs: any[] = Array.isArray(orgsJson?.organizations) ? orgsJson.organizations : [];
  if (orgs.length === 0) {
    return popupResponse({ ok: false, error: "no_zoho_books_orgs_visible" });
  }
  const org = orgs[0];

  // State carries the connecting user id
  let connectedBy: string | null = null;
  try {
    const state = url.searchParams.get("state");
    if (state) {
      const decoded = JSON.parse(atob(state));
      if (typeof decoded?.user_id === "string") connectedBy = decoded.user_id;
    }
  } catch { /* ignore */ }

  const supabase = createClient(supabaseUrl, serviceKey);
  // Single-tenant: keep only one connection row. Delete any existing rows for other orgs.
  await supabase.from("zoho_connections").delete().neq("zoho_org_id", String(org.organization_id));

  const { error: upsertErr } = await supabase.from("zoho_connections").upsert(
    {
      zoho_org_id: String(org.organization_id),
      zoho_org_name: String(org.name ?? ""),
      region,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: new Date(Date.now() + expiresInSec * 1000).toISOString(),
      connected_by: connectedBy,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "zoho_org_id" },
  );

  if (upsertErr) {
    return popupResponse({ ok: false, error: `db_upsert_failed: ${upsertErr.message}` });
  }

  return popupResponse({
    ok: true,
    orgId: String(org.organization_id),
    orgName: String(org.name ?? ""),
    region,
  });
});
