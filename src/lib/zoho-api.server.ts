/**
 * Shared Zoho Books API helpers (server-only).
 * Tokens now live in the `zoho_connections` table (populated by the OAuth
 * connect flow at /admin/zoho-connect). Access tokens are auto-refreshed
 * using the stored refresh token + region.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function normalizeZohoDc(input?: string) {
  const raw = (input || "com").trim().toLowerCase();
  const withoutProtocol = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (withoutProtocol.startsWith("accounts.zoho.")) return withoutProtocol.slice("accounts.zoho.".length);
  if (withoutProtocol.startsWith("www.zohoapis.")) return withoutProtocol.slice("www.zohoapis.".length);
  if (withoutProtocol.startsWith("zohoapis.")) return withoutProtocol.slice("zohoapis.".length);
  if (withoutProtocol.startsWith("zoho.")) return withoutProtocol.slice("zoho.".length);
  return withoutProtocol.replace(/^\.+/, "") || "com";
}

type Connection = {
  id: string;
  zoho_org_id: string;
  zoho_org_name: string | null;
  region: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

async function loadConnection(): Promise<Connection> {
  const { data, error } = await supabaseAdmin
    .from("zoho_connections")
    .select("id, zoho_org_id, zoho_org_name, region, access_token, refresh_token, expires_at")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to read zoho_connections: ${error.message}`);
  if (!data) throw new Error("Zoho is not connected. Connect at /admin/zoho-connect.");
  return data as Connection;
}

async function refreshAccessToken(conn: Connection): Promise<Connection> {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET not set");

  const url = `https://accounts.zoho.${conn.region}/oauth/v2/token`;
  const body = new URLSearchParams({
    refresh_token: conn.refresh_token,
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
    throw new Error(`Zoho refresh failed [${conn.region}] ${json?.error ?? res.statusText}: ${json?.error_description ?? ""}`);
  }
  const expiresInSec = Number(json?.expires_in ?? 3600);
  const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();
  await supabaseAdmin
    .from("zoho_connections")
    .update({ access_token: accessToken, expires_at: expiresAt })
    .eq("id", conn.id);
  return { ...conn, access_token: accessToken, expires_at: expiresAt };
}

export async function getZohoAccessToken(): Promise<{
  accessToken: string;
  apiDomain: string;
  dc: string;
  orgId: string;
}> {
  let conn = await loadConnection();
  const expiresAtMs = new Date(conn.expires_at).getTime();
  if (Number.isNaN(expiresAtMs) || expiresAtMs - Date.now() < 60_000) {
    conn = await refreshAccessToken(conn);
  }
  return {
    accessToken: conn.access_token,
    apiDomain: `https://www.zohoapis.${conn.region}`,
    dc: conn.region,
    orgId: conn.zoho_org_id,
  };
}

export async function fetchZohoContact(contactId: string): Promise<any | null> {
  if (!contactId) return null;
  try {
    const { accessToken, apiDomain, orgId } = await getZohoAccessToken();
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
