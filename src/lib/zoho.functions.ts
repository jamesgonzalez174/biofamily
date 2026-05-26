import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processZohoPayload } from "./zoho-process.server";
import { getZohoAccessToken } from "./zoho-api.server";

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
    try {
      await assertAdmin(context.userId);

      let { accessToken, apiDomain, orgId } = await getZohoAccessToken();
      let tokenIssuedAt = Date.now();
      const TOKEN_TTL_MS = 50 * 60 * 1000;
      const apiBase = `${apiDomain}/books/v3`;

      let fetched = 0;
      let upserted = 0;
      let truncated = false;
      let pages = 0;
      const errors: string[] = [];

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

      const upsertPage = async (page: number, contacts: any[]) => {
        if (contacts.length === 0) return;
        const nowIso = new Date().toISOString();
        const customerRows = contacts.map((c) => ({
          zoho_contact_id: String(c.contact_id),
          email: c.email ? String(c.email).toLowerCase().trim() : null,
          full_name: c.contact_name || null,
          company_name: c.company_name || null,
          loyalty_points: readContactCF(c, "Loyalty Points", "loyalty_points", "LoyaltyPoints"),
          history_points: null,
          raw: c,
          last_synced_at: nowIso,
        }));
        const pharmacyInputs = contacts
          .map((c) => {
            const name = (c.contact_name || c.company_name || "").toString().trim();
            if (!name) return null;
            const lp = readContactCF(c, "Loyalty Points", "loyalty_points", "LoyaltyPoints");
            return {
              zoho_contact_id: String(c.contact_id),
              name,
              address: c.billing_address?.address || null,
              loyalty_points: lp !== null ? Math.floor(lp) : 0,
            };
          })
          .filter((r): r is { zoho_contact_id: string; name: string; address: string | null; loyalty_points: number } => r !== null);

        // Fetch existing pharmacies so we can accumulate history = existing_history + max(0, new_loyalty - existing_loyalty)
        const pharmIds = pharmacyInputs.map((r) => r.zoho_contact_id);
        const { data: existingPharms } = pharmIds.length
          ? await supabaseAdmin
              .from("pharmacies")
              .select("zoho_contact_id, loyalty_points, history_points")
              .in("zoho_contact_id", pharmIds)
          : { data: [] as any[] };
        const existingPharmMap = new Map<string, { loyalty_points: number; history_points: number }>();
        for (const ep of existingPharms ?? []) {
          existingPharmMap.set(String((ep as any).zoho_contact_id), {
            loyalty_points: Number((ep as any).loyalty_points ?? 0),
            history_points: Number((ep as any).history_points ?? 0),
          });
        }
        const pharmacyRows = pharmacyInputs.map((r) => {
          const prev = existingPharmMap.get(r.zoho_contact_id);
          const delta = prev ? Math.max(0, r.loyalty_points - prev.loyalty_points) : r.loyalty_points;
          const history = (prev?.history_points ?? 0) + delta;
          return {
            ...r,
            is_active: true,
            history_points: history,
          };
        });

        const [cRes, pRes] = await Promise.all([
          supabaseAdmin.from("zoho_customers").upsert(customerRows, { onConflict: "zoho_contact_id" }),
          pharmacyRows.length > 0
            ? supabaseAdmin.from("pharmacies").upsert(pharmacyRows, { onConflict: "zoho_contact_id" })
            : Promise.resolve({ error: null as any }),
        ]);
        if (cRes.error) errors.push(`page ${page} upsert: ${cRes.error.message}`);
        else upserted += customerRows.length;
        if (pRes.error) errors.push(`page ${page} pharmacies upsert: ${pRes.error.message}`);

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
              if (c.loyalty_points !== null) {
                const newLoyalty = Math.floor(c.loyalty_points);
                const prevLoyalty = Number((p as any).points_balance ?? 0);
                const prevHistory = Number((p as any).lifetime_points ?? 0);
                const delta = Math.max(0, newLoyalty - prevLoyalty);
                updates.points_balance = newLoyalty;
                updates.lifetime_points = prevHistory + delta;
              }
              if (Object.keys(updates).length > 0) {
                await supabaseAdmin.from("profiles").update(updates).eq("id", p.id);
              }
            }),
          );
        }
      };


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
