import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

function normalizeZohoDc(value?: string): string | undefined {
  const raw = value?.trim().toLowerCase();
  if (!raw) return undefined;

  const cleaned = raw.replace(/^https?:\/\//, "").replace(/^\.+/, "").replace(/\/$/, "");

  if (["au", "com.au", "accounts.zoho.com.au", "www.zohoapis.com.au"].includes(cleaned)) return "au";
  if (["ca", "accounts.zohocloud.ca", "www.zohoapis.ca"].includes(cleaned)) return "ca";
  if (["com", "zoho.com", "accounts.zoho.com", "www.zohoapis.com"].includes(cleaned)) return "com";
  if (["eu", "zoho.eu", "accounts.zoho.eu", "www.zohoapis.eu"].includes(cleaned)) return "eu";
  if (["in", "zoho.in", "accounts.zoho.in", "www.zohoapis.in"].includes(cleaned)) return "in";
  if (["jp", "zoho.jp", "accounts.zoho.jp", "www.zohoapis.jp"].includes(cleaned)) return "jp";

  return cleaned;
}

function formatZohoRefreshError(errors: Array<{ dc: string; code: string; description?: string }>) {
  const details = errors
    .map((error) => `${error.dc}: ${error.code}${error.description ? ` (${error.description})` : ""}`)
    .join(" | ");

  const invalidCode = errors.find((error) => error.code === "invalid_code");
  if (invalidCode) {
    return (
      `Zoho rejected the refresh token for the ${invalidCode.dc} data center (${details}). ` +
      `This usually means ZOHO_REFRESH_TOKEN is revoked, outdated, or was generated for a different Zoho client/data center. ` +
      `Generate a new refresh token from the same Zoho app and update ZOHO_REFRESH_TOKEN.`
    );
  }

  const invalidClient = errors.find((error) =>
    ["invalid_client", "invalid_client_secret"].includes(error.code),
  );
  if (invalidClient) {
    return (
      `Zoho rejected the client credentials for the ${invalidClient.dc} data center (${details}). ` +
      `Re-enter ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET exactly as shown in your Zoho app, and make sure they match the same data center.`
    );
  }

  return `Zoho token refresh failed (${details}). Check ZOHO_DC and your Zoho OAuth credentials.`;
}

async function getAccessToken(): Promise<{ token: string; domain: string }> {
  const clientId = process.env.ZOHO_CLIENT_ID?.trim();
  const clientSecret = process.env.ZOHO_CLIENT_SECRET?.trim();
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN?.trim();
  const dc = normalizeZohoDc(process.env.ZOHO_DC);
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Zoho credentials in backend secrets");
  }

  const allRegions = [
    { dc: "com", accounts: "https://accounts.zoho.com", api: "https://www.zohoapis.com" },
    { dc: "eu", accounts: "https://accounts.zoho.eu", api: "https://www.zohoapis.eu" },
    { dc: "in", accounts: "https://accounts.zoho.in", api: "https://www.zohoapis.in" },
    { dc: "au", accounts: "https://accounts.zoho.com.au", api: "https://www.zohoapis.com.au" },
    { dc: "jp", accounts: "https://accounts.zoho.jp", api: "https://www.zohoapis.jp" },
    { dc: "ca", accounts: "https://accounts.zohocloud.ca", api: "https://www.zohoapis.ca" },
  ];
  const regions = dc ? allRegions.filter((r) => r.dc === dc) : allRegions;
  if (regions.length === 0) {
    throw new Error(`Unknown ZOHO_DC "${dc}". Use one of: com, eu, in, au, jp, ca`);
  }

  const errors: Array<{ dc: string; code: string; description?: string }> = [];
  for (const r of regions) {
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    });
    const res = await fetch(`${r.accounts}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok && json.access_token) {
      return { token: json.access_token, domain: r.api };
    }
    errors.push({
      dc: r.dc,
      code: String(json.error ?? res.statusText ?? "unknown_error"),
      description: typeof json.error_description === "string" ? json.error_description : undefined,
    });
  }
  throw new Error(formatZohoRefreshError(errors));
}

function readCustomField(contact: any, ...names: string[]): number | null {
  const wanted = names.map((n) => n.toLowerCase().replace(/[\s_-]/g, ""));
  const fields: any[] = Array.isArray(contact?.custom_fields) ? contact.custom_fields : [];
  for (const cf of fields) {
    const label = String(cf?.label ?? cf?.api_name ?? cf?.placeholder ?? "")
      .toLowerCase()
      .replace(/[\s_-]/g, "");
    if (wanted.includes(label)) {
      const v = Number(cf?.value ?? cf?.value_formatted ?? 0);
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
    await assertAdmin(context.userId);

    const orgId = process.env.ZOHO_ORGANIZATION_ID;
    if (!orgId) throw new Error("Missing ZOHO_ORGANIZATION_ID");
    let page = 1;
    let totalFetched = 0;
    let totalUpserted = 0;
    let profilesUpdated = 0;
    let pharmaciesCreated = 0;
    const maxPages = 50;

    try {
      const { token, domain } = await getAccessToken();

      while (page <= maxPages) {
        const listUrl = `${domain}/books/v3/contacts?organization_id=${orgId}&contact_type=customer&page=${page}&per_page=200`;
        const listRes = await fetch(listUrl, {
          headers: { Authorization: `Zoho-oauthtoken ${token}` },
        });
        if (!listRes.ok) {
          const text = await listRes.text();
          throw new Error(`Zoho contacts list failed (${listRes.status}): ${text.slice(0, 200)}`);
        }
        const listJson: any = await listRes.json();
        const contacts: any[] = listJson?.contacts ?? [];
        if (contacts.length === 0) break;
        totalFetched += contacts.length;

        for (const c of contacts) {
          // Fetch full contact to get custom fields
          let full: any = c;
          try {
            const detailRes = await fetch(
              `${domain}/books/v3/contacts/${c.contact_id}?organization_id=${orgId}`,
              { headers: { Authorization: `Zoho-oauthtoken ${token}` } },
            );
            if (detailRes.ok) {
              const dj: any = await detailRes.json();
              full = dj?.contact ?? c;
            }
          } catch {
            /* fall back to list payload */
          }

          const email = String(full?.email ?? c?.email ?? "").toLowerCase().trim() || null;
          const fullName = full?.contact_name ?? c?.contact_name ?? null;
          const company = full?.company_name ?? c?.company_name ?? null;
          const loyalty = readCustomField(full, "Loyalty Points", "loyalty_points");
          const history = readCustomField(full, "History Points", "history_points");

          const { error: upErr } = await supabaseAdmin
            .from("zoho_customers")
            .upsert(
              {
                zoho_contact_id: String(c.contact_id),
                email,
                full_name: fullName,
                company_name: company,
                loyalty_points: loyalty,
                history_points: history,
                raw: full,
                last_synced_at: new Date().toISOString(),
              },
              { onConflict: "zoho_contact_id" },
            );
          if (upErr) {
            console.error("zoho_customers upsert failed", upErr);
            continue;
          }
          totalUpserted++;

          // Upsert as a pharmacy. Use company_name if present, otherwise the contact name.
          const pharmacyName = (company ?? fullName ?? "").toString().trim();
          if (pharmacyName) {
            const address = [
              full?.billing_address?.address,
              full?.billing_address?.city,
              full?.billing_address?.state,
              full?.billing_address?.country,
            ]
              .filter(Boolean)
              .join(", ") || null;

            const { data: existingPharm } = await supabaseAdmin
              .from("pharmacies")
              .select("id")
              .ilike("name", pharmacyName)
              .maybeSingle();

            if (!existingPharm) {
              const { error: phErr } = await supabaseAdmin
                .from("pharmacies")
                .insert({ name: pharmacyName, address, is_active: true });
              if (!phErr) pharmaciesCreated++;
              else console.error("pharmacy insert failed", phErr);
            } else if (address) {
              await supabaseAdmin
                .from("pharmacies")
                .update({ address })
                .eq("id", existingPharm.id);
            }
          }

          // If history_points is present and a matching profile exists, sync lifetime_points
          if (email && history !== null) {
            const { data: profile } = await supabaseAdmin
              .from("profiles")
              .select("id, lifetime_points")
              .ilike("email", email)
              .maybeSingle();
            if (profile) {
              const hp = Math.floor(history);
              if (profile.lifetime_points !== hp) {
                await supabaseAdmin
                  .from("profiles")
                  .update({ lifetime_points: hp })
                  .eq("id", profile.id);
                profilesUpdated++;
              }
            }
          }
        }

        const hasMore = listJson?.page_context?.has_more_page === true;
        if (!hasMore) break;
        page++;
      }

      return { ok: true, totalFetched, totalUpserted, profilesUpdated, pharmaciesCreated, error: null };
    } catch (error) {
      return {
        ok: false,
        totalFetched,
        totalUpserted,
        profilesUpdated,
        pharmaciesCreated,
        error: error instanceof Error ? error.message : "Zoho sync failed",
      };
    }
  });
