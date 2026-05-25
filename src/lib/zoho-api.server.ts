/**
 * Shared Zoho Books API helpers (server-only).
 * Used by both the manual sync (zoho.functions.ts) and the webhook
 * processor (zoho-process.server.ts) to fetch a contact on demand.
 */

export function normalizeZohoDc(input?: string) {
  const raw = (input || "com").trim().toLowerCase();
  const withoutProtocol = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (withoutProtocol.startsWith("accounts.zoho.")) return withoutProtocol.slice("accounts.zoho.".length);
  if (withoutProtocol.startsWith("www.zohoapis.")) return withoutProtocol.slice("www.zohoapis.".length);
  if (withoutProtocol.startsWith("zohoapis.")) return withoutProtocol.slice("zohoapis.".length);
  if (withoutProtocol.startsWith("zoho.")) return withoutProtocol.slice("zoho.".length);
  return withoutProtocol.replace(/^\.+/, "") || "com";
}

export async function getZohoAccessToken(): Promise<{ accessToken: string; apiDomain: string; dc: string }> {
  const dc = normalizeZohoDc(process.env.ZOHO_DC);
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Zoho credentials");
  }
  const url = `https://accounts.zoho.${dc}/oauth/v2/token`;
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", Accept: "application/json" },
    body,
  });
  const json: any = await res.json().catch(() => null);
  const accessToken = json?.access_token;
  if (!res.ok || !accessToken) {
    throw new Error(`Zoho token error [${dc}] ${json?.error ?? res.statusText}: ${json?.error_description ?? ""}`);
  }
  const apiDomain = typeof json?.api_domain === "string" && json.api_domain.length > 0
    ? json.api_domain
    : `https://www.zohoapis.${dc}`;
  return { accessToken, apiDomain, dc };
}

/**
 * Fetch a single contact by id from Zoho Books. Returns the contact object
 * or null on failure (logs the error but does not throw — callers should
 * treat refresh-from-Zoho as best-effort).
 */
export async function fetchZohoContact(contactId: string): Promise<any | null> {
  if (!contactId) return null;
  const orgId = process.env.ZOHO_ORGANIZATION_ID;
  if (!orgId) {
    console.warn("fetchZohoContact: missing ZOHO_ORGANIZATION_ID");
    return null;
  }
  try {
    const { accessToken, apiDomain } = await getZohoAccessToken();
    const url = `${apiDomain}/books/v3/contacts/${encodeURIComponent(contactId)}?organization_id=${orgId}`;
    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: "application/json" },
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok) {
      console.warn(`fetchZohoContact failed [${res.status}]:`, json?.message ?? res.statusText);
      return null;
    }
    return json?.contact ?? null;
  } catch (e) {
    console.warn("fetchZohoContact error:", e);
    return null;
  }
}
