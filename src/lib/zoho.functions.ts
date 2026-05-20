import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processZohoPayload } from "./zoho-process.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

function normalizeZohoDc(input?: string) {
  const raw = (input || "com").trim().toLowerCase();
  const withoutProtocol = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  if (withoutProtocol.startsWith("accounts.zoho.")) {
    return withoutProtocol.slice("accounts.zoho.".length);
  }

  if (withoutProtocol.startsWith("www.zohoapis.")) {
    return withoutProtocol.slice("www.zohoapis.".length);
  }

  if (withoutProtocol.startsWith("zohoapis.")) {
    return withoutProtocol.slice("zohoapis.".length);
  }

  if (withoutProtocol.startsWith("zoho.")) {
    return withoutProtocol.slice("zoho.".length);
  }

  return withoutProtocol.replace(/^\.+/, "") || "com";
}

async function getZohoAccessToken() {
  const dc = normalizeZohoDc(process.env.ZOHO_DC);
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Zoho credentials (ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN)");
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
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Accept: "application/json",
    },
    body,
  });
  const raw = await res.text();
  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json.access_token) {
    const errorCode = json?.error || json?.code || res.statusText || "unknown_error";
    const errorDescription = json?.error_description || json?.message || raw || "Unknown Zoho token error";

    console.error("Zoho token request failed", {
      status: res.status,
      dc,
      errorCode,
      errorDescription,
    });

    if (errorCode === "general_error") {
      throw new Error(
        `Zoho token error: general_error. Check that ZOHO_DC matches your Zoho region and that ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REFRESH_TOKEN all come from the same Zoho self client. Current token URL: ${url}`,
      );
    }

    throw new Error(`Zoho token error: ${errorCode}${errorDescription ? ` (${errorDescription})` : ""}`);
  }

  return {
    accessToken: json.access_token as string,
    dc,
    apiDomain: typeof json.api_domain === "string" && json.api_domain.length > 0
      ? json.api_domain
      : `https://www.zohoapis.${dc}`,
  };
}

/**
 * Pull customers (contacts) from Zoho Books and upsert into zoho_customers.
 */
export const syncZohoCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const orgId = process.env.ZOHO_ORGANIZATION_ID;
    if (!orgId) throw new Error("Missing ZOHO_ORGANIZATION_ID");

    const { accessToken, apiDomain } = await getZohoAccessToken();
    const apiBase = `${apiDomain}/books/v3`;

    let page = 1;
    let fetched = 0;
    let upserted = 0;
    const errors: string[] = [];

    while (true) {
      const url = `${apiBase}/contacts?organization_id=${orgId}&page=${page}&per_page=200`;
      const res = await fetch(url, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      });
      const json: any = await res.json();
      if (!res.ok) {
        errors.push(`page ${page}: ${json.message || res.statusText}`);
        break;
      }
      const contacts: any[] = json.contacts ?? [];
      fetched += contacts.length;

      if (contacts.length > 0) {
        const rows = contacts.map((c) => ({
          zoho_contact_id: String(c.contact_id),
          email: c.email || null,
          full_name: c.contact_name || null,
          company_name: c.company_name || null,
          loyalty_points: c.cf_loyalty_points ?? null,
          history_points: c.cf_history_points ?? null,
          raw: c,
          last_synced_at: new Date().toISOString(),
        }));
        const { error } = await supabaseAdmin
          .from("zoho_customers")
          .upsert(rows, { onConflict: "zoho_contact_id" });
        if (error) errors.push(`page ${page} upsert: ${error.message}`);
        else upserted += rows.length;
      }

      const hasMore = json.page_context?.has_more_page;
      if (!hasMore) break;
      page++;
      if (page > 100) break; // safety
    }

    return { ok: true, fetched, upserted, pages: page, errors: errors.slice(0, 10) };
  });

/**
 * Re-run the points logic for unprocessed (or errored) Zoho webhook events.
 * Useful when a payload arrived before the user existed, or to retry failures.
 */
export const reprocessZohoEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const { data: events, error } = await supabaseAdmin
      .from("zoho_events")
      .select("event_id, payload, processed, error")
      .or("processed.eq.false,error.not.is.null")
      .order("created_at", { ascending: true })
      .limit(500);

    if (error) throw new Error(error.message);

    let processed = 0;
    let userNotFound = 0;
    let noEmail = 0;
    let totalPoints = 0;
    const failures: { eventId: string; reason: string }[] = [];

    for (const ev of events ?? []) {
      try {
        const res = await processZohoPayload(ev.payload);
        if (res.ok) {
          processed++;
          totalPoints += res.pointsAwarded;
        } else if (res.status === "user not found") {
          userNotFound++;
          failures.push({ eventId: res.eventId, reason: "user not found" });
        } else if (res.status === "no email") {
          noEmail++;
          failures.push({ eventId: res.eventId, reason: "no email" });
        }
      } catch (e: any) {
        failures.push({ eventId: ev.event_id ?? "unknown", reason: e?.message ?? "error" });
      }
    }

    return {
      ok: true,
      scanned: events?.length ?? 0,
      processed,
      pointsAwarded: totalPoints,
      userNotFound,
      noEmail,
      failures: failures.slice(0, 10),
    };
  });
