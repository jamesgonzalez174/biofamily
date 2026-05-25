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

async function requestZohoAccessToken(dc: string, clientId: string, clientSecret: string, refreshToken: string) {
  const url = `https://accounts.zoho.${dc}/oauth/v2/token`;
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  try {
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

    const accessToken = json?.access_token;
    const errorCode = json?.error || json?.code || res.statusText || "unknown_error";
    const errorDescription = json?.error_description || json?.message || raw || "Unknown Zoho token error";

    return {
      ok: res.ok && Boolean(accessToken),
      dc,
      url,
      accessToken: accessToken as string | undefined,
      apiDomain: typeof json?.api_domain === "string" && json.api_domain.length > 0
        ? json.api_domain
        : `https://www.zohoapis.${dc}`,
      status: res.status,
      errorCode,
      errorDescription,
    };
  } catch (error: any) {
    return {
      ok: false,
      dc,
      url,
      accessToken: undefined,
      apiDomain: `https://www.zohoapis.${dc}`,
      status: 0,
      errorCode: "fetch_failed",
      errorDescription: error?.message ?? "Network request failed",
    };
  }
}

async function getZohoAccessToken() {
  const dc = normalizeZohoDc(process.env.ZOHO_DC);
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Zoho credentials (ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN)");
  }

  const result = await requestZohoAccessToken(dc, clientId, clientSecret, refreshToken);

  if (result.ok && result.accessToken) {
    return {
      accessToken: result.accessToken,
      dc,
      apiDomain: result.apiDomain,
    };
  }

  console.error("Zoho token request failed", {
    status: result.status,
    dc,
    errorCode: result.errorCode,
    errorDescription: result.errorDescription,
  });

  throw new Error(
    `Zoho token error [${dc}] ${result.errorCode}: ${result.errorDescription}. Refresh tokens are bound to the data center they were issued in — verify ZOHO_DC matches the region where the refresh token was generated (e.g. "com", "eu", "in", "ca", "com.au", "jp", "sa", "com.cn").`,
  );
}

/**
 * Pull customers (contacts) from Zoho Books and upsert into zoho_customers.
 */
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

export const syncZohoCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      await assertAdmin(context.userId);

      const orgId = process.env.ZOHO_ORGANIZATION_ID;
      if (!orgId) throw new Error("Missing ZOHO_ORGANIZATION_ID");

      let { accessToken, apiDomain } = await getZohoAccessToken();
      let tokenIssuedAt = Date.now();
      const TOKEN_TTL_MS = 50 * 60 * 1000; // refresh before 1h expiry
      const apiBase = `${apiDomain}/books/v3`;

      let fetched = 0;
      let upserted = 0;
      let truncated = false;
      let pages = 0;
      const errors: string[] = [];

      // Fetch one page from Zoho, with token refresh on TTL or 401.
      const fetchPage = async (
        page: number,
      ): Promise<{ contacts: any[]; hasMore: boolean; stop?: string } | null> => {
        if (Date.now() - tokenIssuedAt > TOKEN_TTL_MS) {
          const refreshed = await getZohoAccessToken();
          accessToken = refreshed.accessToken;
          tokenIssuedAt = Date.now();
        }

        for (let attempt = 0; attempt < 2; attempt++) {
          const url = `${apiBase}/contacts?organization_id=${orgId}&page=${page}&per_page=200`;
          const res = await fetch(url, {
            headers: {
              Authorization: `Zoho-oauthtoken ${accessToken}`,
              Accept: "application/json",
            },
          });
          const raw = await res.text();

          if (res.status === 401 && attempt === 0) {
            const refreshed = await getZohoAccessToken();
            accessToken = refreshed.accessToken;
            tokenIssuedAt = Date.now();
            continue;
          }

          let json: any = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            return { contacts: [], hasMore: false, stop: `page ${page}: non-JSON response (${res.status}) ${raw.slice(0, 120)}` };
          }
          if (!res.ok) {
            return { contacts: [], hasMore: false, stop: `page ${page}: ${json?.message || res.statusText}` };
          }
          return {
            contacts: json.contacts ?? [],
            hasMore: Boolean(json.page_context?.has_more_page),
          };
        }
        return null;
      };

      // Upsert one page's contacts + pharmacies in PARALLEL.
      const upsertPage = async (page: number, contacts: any[]) => {
        if (contacts.length === 0) return;
        const nowIso = new Date().toISOString();
        const customerRows = contacts.map((c) => ({
          zoho_contact_id: String(c.contact_id),
          email: c.email ? String(c.email).toLowerCase().trim() : null,
          full_name: c.contact_name || null,
          company_name: c.company_name || null,
          loyalty_points: readContactCF(c, "Loyalty Points", "loyalty_points", "LoyaltyPoints"),
          history_points: readContactCF(c, "History Points", "history_points", "HistoryPoints"),
          raw: c,
          last_synced_at: nowIso,
        }));
        const pharmacyRows = contacts
          .map((c) => {
            const name = (c.contact_name || c.company_name || "").toString().trim();
            if (!name) return null;
            const lp = readContactCF(c, "Loyalty Points", "loyalty_points", "LoyaltyPoints");
            const hp = readContactCF(c, "History Points", "history_points", "HistoryPoints");
            return {
              zoho_contact_id: String(c.contact_id),
              name,
              address: c.billing_address?.address || null,
              is_active: true,
              loyalty_points: lp !== null ? Math.floor(lp) : 0,
              history_points: hp !== null ? Math.floor(hp) : 0,
            };
          })
          .filter((r): r is { zoho_contact_id: string; name: string; address: string | null; is_active: boolean; loyalty_points: number; history_points: number } => r !== null);

        const [cRes, pRes] = await Promise.all([
          supabaseAdmin.from("zoho_customers").upsert(customerRows, { onConflict: "zoho_contact_id" }),
          pharmacyRows.length > 0
            ? supabaseAdmin.from("pharmacies").upsert(pharmacyRows, { onConflict: "zoho_contact_id" })
            : Promise.resolve({ error: null as any }),
        ]);
        if (cRes.error) errors.push(`page ${page} upsert: ${cRes.error.message}`);
        else upserted += customerRows.length;
        if (pRes.error) errors.push(`page ${page} pharmacies upsert: ${pRes.error.message}`);

        // Sync matching profiles by email — name + Loyalty/History Points.
        const emailToContact = new Map<string, typeof customerRows[number]>();
        for (const row of customerRows) {
          if (row.email) emailToContact.set(row.email, row);
        }
        const emails = [...emailToContact.keys()];
        if (emails.length > 0) {
          const { data: matchingProfiles } = await supabaseAdmin
            .from("profiles")
            .select("id, email, full_name, points_balance, lifetime_points")
            .in("email", emails);
          await Promise.all(
            (matchingProfiles ?? []).map(async (p) => {
              const c = emailToContact.get(String(p.email).toLowerCase().trim());
              if (!c) return;
              const updates: { full_name?: string; points_balance?: number; lifetime_points?: number } = {};
              if (c.full_name && c.full_name !== p.full_name) updates.full_name = c.full_name;
              if (c.loyalty_points !== null) updates.points_balance = Math.floor(c.loyalty_points);
              if (c.history_points !== null) updates.lifetime_points = Math.floor(c.history_points);
              if (Object.keys(updates).length > 0) {
                await supabaseAdmin.from("profiles").update(updates).eq("id", p.id);
              }
            }),
          );
        }
      };

      // Pipeline: prefetch next page while upserting the current one.
      let page = 1;
      let next = fetchPage(page);
      while (true) {
        const current = await next;
        pages = page;
        if (!current) break;
        if (current.stop) {
          errors.push(current.stop);
          break;
        }
        fetched += current.contacts.length;

        const hasMore = current.hasMore;
        const nextPageNum = page + 1;
        if (hasMore && nextPageNum <= 100) {
          next = fetchPage(nextPageNum);
        }

        await upsertPage(page, current.contacts);

        if (!hasMore) break;
        page = nextPageNum;
        if (page > 100) {
          truncated = true;
          errors.push(`hit page cap (100) — sync truncated at ${fetched} contacts`);
          break;
        }
      }

      const ok = errors.length === 0;
      return { ok, fetched, upserted, pages: page, truncated, errors: errors.slice(0, 10) };
    } catch (error: any) {
      return {
        ok: false,
        fetched: 0,
        upserted: 0,
        pages: 0,
        truncated: false,
        errors: [error?.message ?? "Zoho sync failed"],
      };
    }
  });

/**
 * Admin-only diagnostic: validate the current Zoho refresh token across all
 * known data centers and report exactly what Zoho returned.
 */
export const testZohoConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const configuredDc = normalizeZohoDc(process.env.ZOHO_DC);
    const clientId = process.env.ZOHO_CLIENT_ID;
    const clientSecret = process.env.ZOHO_CLIENT_SECRET;
    const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
    const orgId = process.env.ZOHO_ORGANIZATION_ID;

    const missing: string[] = [];
    if (!clientId) missing.push("ZOHO_CLIENT_ID");
    if (!clientSecret) missing.push("ZOHO_CLIENT_SECRET");
    if (!refreshToken) missing.push("ZOHO_REFRESH_TOKEN");

    if (missing.length > 0 || !clientId || !clientSecret || !refreshToken) {
      return {
        ok: false,
        configuredDc,
        missing,
        clientIdPrefix: clientId?.slice(0, 15) ?? null,
        clientSecretLength: clientSecret?.length ?? 0,
        refreshTokenPrefix: refreshToken?.slice(0, 15) ?? null,
        refreshTokenLength: refreshToken?.length ?? 0,
        orgIdPresent: Boolean(orgId),
        attempts: [] as any[],
        matchedDc: null as string | null,
        orgIdMatches: null as boolean | null,
      };
    }

    const allDcs = ["com", "eu", "in", "ca", "com.au", "jp", "sa", "com.cn"];
    const ordered = [configuredDc, ...allDcs.filter((d) => d !== configuredDc)];

    const attempts: Array<{
      dc: string;
      ok: boolean;
      status: number;
      errorCode: string;
      errorDescription: string;
      apiDomain?: string;
    }> = [];

    let matchedDc: string | null = null;
    let matchedApiDomain: string | null = null;
    let matchedAccessToken: string | null = null;

    for (const dc of ordered) {
      const r = await requestZohoAccessToken(dc, clientId, clientSecret, refreshToken);
      attempts.push({
        dc,
        ok: r.ok,
        status: r.status,
        errorCode: r.errorCode,
        errorDescription: r.errorDescription,
        apiDomain: r.apiDomain,
      });
      if (r.ok && r.accessToken && !matchedDc) {
        matchedDc = dc;
        matchedApiDomain = r.apiDomain;
        matchedAccessToken = r.accessToken;
      }
    }

    // If we got a token, verify the org id by hitting /organizations.
    let orgIdMatches: boolean | null = null;
    let orgList: Array<{ organization_id: string; name: string }> = [];
    if (matchedAccessToken && matchedApiDomain) {
      try {
        const res = await fetch(`${matchedApiDomain}/books/v3/organizations`, {
          headers: {
            Authorization: `Zoho-oauthtoken ${matchedAccessToken}`,
            Accept: "application/json",
          },
        });
        const json: any = await res.json().catch(() => null);
        const orgs: any[] = Array.isArray(json?.organizations) ? json.organizations : [];
        orgList = orgs.map((o) => ({
          organization_id: String(o.organization_id),
          name: String(o.name ?? ""),
        }));
        if (orgId) {
          orgIdMatches = orgList.some((o) => o.organization_id === String(orgId));
        }
      } catch {
        orgList = [];
      }
    }

    return {
      ok: matchedDc !== null && (orgIdMatches ?? true),
      configuredDc,
      matchedDc,
      dcMatchesConfig: matchedDc === configuredDc,
      clientIdPrefix: clientId.slice(0, 15),
      clientSecretLength: clientSecret.length,
      refreshTokenPrefix: refreshToken.slice(0, 15),
      refreshTokenLength: refreshToken.length,
      orgIdPresent: Boolean(orgId),
      orgIdConfigured: orgId ?? null,
      orgIdMatches,
      organizations: orgList,
      attempts,
      missing,
    };
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
