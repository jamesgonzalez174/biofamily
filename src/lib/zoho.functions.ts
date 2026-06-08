import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processZohoPayload } from "./zoho-process.server";
import { getZohoAccessToken } from "./zoho-api.server";
import { runZohoSync } from "./zoho-sync.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

/** Read a Zoho custom field by label/api_name from a contact. */
function readContactCF(contact: any, ...names: string[]): number | null {
  const lower = names.map((n) => n.toLowerCase().replace(/[\s_-]/g, ""));
  const cfs: any[] = Array.isArray(contact?.custom_fields) ? contact.custom_fields : [];
  for (const cf of cfs) {
    const label = String(cf?.label ?? cf?.api_name ?? cf?.placeholder ?? "")
      .toLowerCase()
      .replace(/[\s_-]/g, "");
    if (lower.includes(label)) {
      const v = Number(cf?.value ?? cf?.value_formatted ?? NaN);
      if (!Number.isNaN(v)) return v;
    }
  }
  for (const n of names) {
    const key = `cf_${n.toLowerCase().replace(/\s+/g, "_")}`;
    const v = contact?.[key];
    if (v !== undefined && v !== null && v !== "") {
      const num = Number(v);
      if (!Number.isNaN(num)) return num;
    }
  }
  return null;
}

/** Returns the active Zoho connection metadata for the admin UI. */
export const getZohoConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("zoho_connections")
      .select("zoho_org_id, zoho_org_name, region, expires_at, connected_at")
      .order("connected_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { connected: false as const };
    return {
      connected: true as const,
      orgId: data.zoho_org_id,
      orgName: data.zoho_org_name,
      region: data.region,
      expiresAt: data.expires_at,
      connectedAt: data.connected_at,
    };
  });

/** Delete the stored Zoho connection. */
export const disconnectZoho = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("zoho_connections").delete().not("id", "is", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Pull customers (contacts) from Zoho Books and upsert into zoho_customers.
 */
export const syncZohoCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return await runZohoSync({ notify: true, source: "manual", triggeredBy: context.userId });
  });

/** List recent Zoho sync runs (admin only). */
export const listZohoSyncRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("zoho_sync_runs")
      .select("id, started_at, finished_at, ok, source, fetched, upserted, pages, truncated, notified_count, errors, triggered_by")
      .order("started_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { runs: data ?? [] };
  });

/** Compute the timezone's current UTC offset in minutes (positive = east of UTC). */
function tzOffsetMinutes(timezone: string, at: Date = new Date()): number {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "shortOffset" });
  const parts = dtf.formatToParts(at);
  const tzn = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
  const m = tzn.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const h = parseInt(m[2], 10);
  const min = m[3] ? parseInt(m[3], 10) : 0;
  return sign * (h * 60 + min);
}

/**
 * Update the daily Zoho sync schedule. Stores the admin's preferred timezone +
 * local time-of-day and reschedules the pg_cron job in UTC accordingly.
 */
export const updateZohoSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { timezone: string; hour: number; minute: number }) => input)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const { timezone, hour, minute } = data;
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error("Hour must be 0–23");
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error("Minute must be 0–59");
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      throw new Error(`Unknown timezone: ${timezone}`);
    }

    const secret = process.env.CRON_SECRET;
    if (!secret) throw new Error("CRON_SECRET is not configured");
    const baseUrl = process.env.PUBLIC_APP_URL || "https://biofamily.lovable.app";
    const url = `${baseUrl.replace(/\/$/, "")}/api/public/hooks/daily-zoho-sync`;

    const offsetMin = tzOffsetMinutes(timezone);
    const totalLocal = hour * 60 + minute;
    const totalUtc = (((totalLocal - offsetMin) % 1440) + 1440) % 1440;
    const utcHour = Math.floor(totalUtc / 60);
    const utcMinute = totalUtc % 60;

    const { error: upErr } = await supabaseAdmin
      .from("settings")
      .update({ sync_timezone: timezone, sync_hour: hour, sync_minute: minute })
      .eq("id", 1);
    if (upErr) throw new Error(upErr.message);

    const { error: rpcErr } = await supabaseAdmin.rpc("reschedule_zoho_sync", {
      _utc_hour: utcHour,
      _utc_minute: utcMinute,
      _url: url,
      _secret: secret,
    });
    if (rpcErr) throw new Error(`Reschedule failed: ${rpcErr.message}`);

    return {
      ok: true,
      timezone,
      localHour: hour,
      localMinute: minute,
      utcHour,
      utcMinute,
      cronExpr: `${utcMinute} ${utcHour} * * *`,
    };
  });

/**
 * Admin-only diagnostic: validate the stored Zoho connection by issuing a
 * fresh access token and listing organizations.
 */
type TestResult = {
  ok: boolean;
  connected: boolean;
  error: string | null;
  configuredDc: string | null;
  matchedDc: string | null;
  dcMatchesConfig: boolean | null;
  orgIdConfigured: string | null;
  orgIdPresent: boolean;
  orgIdMatches: boolean | null;
  organizations: Array<{ organization_id: string; name: string }>;
  attempts: Array<{ dc: string; ok: boolean; status: number; errorCode: string; errorDescription: string }>;
  missing: string[];
  clientIdPrefix: string | null;
  clientSecretLength: number;
  refreshTokenPrefix: string | null;
  refreshTokenLength: number;
};

export const testZohoConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TestResult> => {
    await assertAdmin(context.userId);

    const { data: conn } = await supabaseAdmin
      .from("zoho_connections")
      .select("zoho_org_id, zoho_org_name, region, expires_at, connected_at")
      .order("connected_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conn) {
      return {
        ok: false,
        connected: false,
        error: "Zoho is not connected. Connect at /admin/zoho-connect.",
        configuredDc: null,
        matchedDc: null,
        dcMatchesConfig: null,
        orgIdConfigured: null,
        orgIdPresent: false,
        orgIdMatches: null,
        organizations: [],
        attempts: [],
        missing: [],
        clientIdPrefix: null,
        clientSecretLength: 0,
        refreshTokenPrefix: null,
        refreshTokenLength: 0,
      };
    }

    try {
      const { accessToken, apiDomain, dc, orgId } = await getZohoAccessToken();
      const res = await fetch(`${apiDomain}/books/v3/organizations`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: "application/json" },
      });
      const json: any = await res.json().catch(() => null);
      const orgs: any[] = Array.isArray(json?.organizations) ? json.organizations : [];
      const orgList = orgs.map((o) => ({
        organization_id: String(o.organization_id),
        name: String(o.name ?? ""),
      }));
      const orgIdMatches = orgList.some((o) => o.organization_id === orgId);

      return {
        ok: res.ok && orgIdMatches,
        connected: true,
        error: null,
        configuredDc: dc,
        matchedDc: dc,
        dcMatchesConfig: true,
        orgIdConfigured: orgId,
        orgIdPresent: true,
        orgIdMatches,
        organizations: orgList,
        attempts: [{ dc, ok: true, status: 200, errorCode: "—", errorDescription: "Access token issued" }],
        missing: [],
        clientIdPrefix: (process.env.ZOHO_CLIENT_ID ?? "").slice(0, 15),
        clientSecretLength: (process.env.ZOHO_CLIENT_SECRET ?? "").length,
        refreshTokenPrefix: "(from DB)",
        refreshTokenLength: 0,
      };
    } catch (e: any) {
      return {
        ok: false,
        connected: true,
        error: e?.message ?? "Token refresh failed",
        configuredDc: conn.region,
        matchedDc: null,
        dcMatchesConfig: null,
        orgIdConfigured: conn.zoho_org_id,
        orgIdPresent: true,
        orgIdMatches: null,
        organizations: [],
        attempts: [{
          dc: conn.region,
          ok: false,
          status: 0,
          errorCode: "refresh_failed",
          errorDescription: e?.message ?? "Token refresh failed",
        }],
        missing: [],
        clientIdPrefix: (process.env.ZOHO_CLIENT_ID ?? "").slice(0, 15),
        clientSecretLength: (process.env.ZOHO_CLIENT_SECRET ?? "").length,
        refreshTokenPrefix: "(from DB)",
        refreshTokenLength: 0,
      };
    }
  });

/**
 * Re-run the points logic for unprocessed (or errored) Zoho webhook events.
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
        const res = await processZohoPayload(ev.payload, ev.event_id ?? undefined);
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

/**
 * Diagnostic: hit /organizations with the current token to verify Books access.
 */
export const diagnoseZohoBooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    try {
      const { accessToken, apiDomain, dc, orgId } = await getZohoAccessToken();
      const booksUrl = `${apiDomain}/books/v3/organizations`;
      const res = await fetch(booksUrl, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: "application/json" },
      });
      const raw = await res.text();
      let body: any = raw;
      try { body = JSON.parse(raw); } catch {}
      return {
        dc,
        orgId,
        tokenOk: true,
        tokenError: null as string | null,
        booksStatus: res.status,
        booksUrl,
        booksBody: body,
      };
    } catch (e: any) {
      return {
        dc: null,
        orgId: null,
        tokenOk: false,
        tokenError: e?.message ?? "token failed",
        booksStatus: 0,
        booksBody: null as any,
        booksUrl: null as string | null,
      };
    }
  });
