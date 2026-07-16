import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getZohoAccessToken } from "./zoho-api.server";

function readContactCF(contact: any, ...names: string[]): number | null {
  const lower = names.map((n) => n.toLowerCase().replace(/[\s_-]/g, ""));
  const cfs: any[] = Array.isArray(contact?.custom_fields) ? contact.custom_fields : [];
  for (const cf of cfs) {
    const label = String(cf?.label ?? cf?.api_name ?? cf?.placeholder ?? "")
      .toLowerCase()
      .replace(/[\s_-]/g, "");
    if (lower.includes(label)) {
      const raw = cf?.value ?? cf?.value_formatted ?? "";
      const v = Number(String(raw).replace(/,/g, "").trim());
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

function readContactCFText(contact: any, ...names: string[]): string | null {
  const lower = names.map((n) => n.toLowerCase().replace(/[\s_-]/g, ""));
  const cfs: any[] = Array.isArray(contact?.custom_fields) ? contact.custom_fields : [];
  for (const cf of cfs) {
    const label = String(cf?.label ?? cf?.api_name ?? cf?.placeholder ?? "")
      .toLowerCase()
      .replace(/[\s_-]/g, "");
    if (lower.includes(label)) {
      const raw = cf?.value ?? cf?.value_formatted ?? "";
      const s = String(raw).trim();
      if (s) return s;
    }
  }
  for (const n of names) {
    // Try the raw name as a top-level key first (e.g. "cf_reference_invoiced"),
    // then fall back to the cf_<snake> convention.
    const direct = contact?.[n];
    if (direct !== undefined && direct !== null && String(direct).trim() !== "") return String(direct).trim();
    const key = `cf_${n.toLowerCase().replace(/\s+/g, "_")}`;
    const v = contact?.[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}


function parseInvoiceRefs(raw: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\s,;\n\r|]+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}


export interface SyncResult {
  ok: boolean;
  fetched: number;
  upserted: number;
  pages: number;
  truncated: boolean;
  errors: string[];
  notifiedCount: number;
}

/** Core Zoho contacts → DB sync. Syncs loyalty_points and invoice_references onto pharmacies only. */
export async function runZohoSync(opts: { notify?: boolean; source?: string; triggeredBy?: string | null } = {}): Promise<SyncResult> {
  void opts.notify;
  const source = opts.source ?? "manual";
  const triggeredBy = opts.triggeredBy ?? null;
  const startedAt = new Date().toISOString();
  const { data: runRow } = await supabaseAdmin
    .from("zoho_sync_runs")
    .insert({ started_at: startedAt, source, triggered_by: triggeredBy, ok: false })
    .select("id")
    .single();
  const runId = (runRow as any)?.id as string | undefined;

  const finalize = async (result: SyncResult) => {
    if (!runId) return;
    await supabaseAdmin
      .from("zoho_sync_runs")
      .update({
        finished_at: new Date().toISOString(),
        ok: result.ok,
        fetched: result.fetched,
        upserted: result.upserted,
        pages: result.pages,
        truncated: result.truncated,
        notified_count: result.notifiedCount,
        errors: result.errors as any,
      })
      .eq("id", runId);
  };

  try {
    let { accessToken, apiDomain, orgId } = await getZohoAccessToken();
    let tokenIssuedAt = Date.now();
    const TOKEN_TTL_MS = 50 * 60 * 1000;
    const apiBase = `${apiDomain}/books/v3`;


    let fetched = 0;
    let upserted = 0;
    let truncated = false;
    let notifiedCount = 0;
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
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: "application/json" },
        });
        const raw = await res.text();
        if (res.status === 401 && attempt === 0) {
          const refreshed = await getZohoAccessToken();
          accessToken = refreshed.accessToken;
          tokenIssuedAt = Date.now();
          continue;
        }
        let json: any = null;
        try { json = raw ? JSON.parse(raw) : null; } catch {
          return { contacts: [], hasMore: false, stop: `page ${page}: non-JSON (${res.status})` };
        }
        if (!res.ok) {
          return { contacts: [], hasMore: false, stop: `page ${page}: ${json?.message || res.statusText}` };
        }
        return { contacts: json.contacts ?? [], hasMore: Boolean(json.page_context?.has_more_page) };
      }
      return null;
    };

    const isContactActive = (c: any): boolean => {
      const s = String(c?.status ?? "").toLowerCase();
      if (s === "inactive" || s === "disabled" || s === "crm_inactive") return false;
      if (c?.is_active === false) return false;
      return true;
    };

    const upsertPage = async (page: number, contactsAll: any[]) => {
      const contacts = contactsAll.filter(isContactActive);
      if (contacts.length === 0) return;
      const nowIso = new Date().toISOString();
      const customerRows = contacts.map((c) => {
        const lpRaw = readContactCF(c, "Loyalty Points", "loyalty_points", "LoyaltyPoints");
        const hpRaw = readContactCF(c, "History Points", "history_points", "HistoryPoints");
        return {
          zoho_contact_id: String(c.contact_id),
          email: c.email ? String(c.email).toLowerCase().trim() : null,
          full_name: c.contact_name || null,
          company_name: c.company_name || null,
          loyalty_points: lpRaw,
          history_points: hpRaw,
          raw: c,
          last_synced_at: nowIso,
        };
      });
      const pharmacyInputs = contacts
        .map((c) => {
          const name = (c.contact_name || c.company_name || "").toString().trim();
          if (!name) return null;
          const lpRaw = readContactCF(c, "Loyalty Points", "loyalty_points", "LoyaltyPoints");
          const hpRaw = readContactCF(c, "History Points", "history_points", "HistoryPoints");
          // Keep syncing name/address/invoice_references even when today's
          // Loyalty is 0/missing — otherwise the invoice list & pharmacy info
          // go stale for pharmacies that aren't actively earning right now.
          const loyalty = lpRaw !== null && lpRaw > 0 ? Math.max(0, Math.floor(lpRaw)) : null;
          const history = hpRaw !== null ? Math.max(0, Math.floor(hpRaw)) : null;
          const invoiceRefs = parseInvoiceRefs(
            readContactCFText(c, "cf_reference_invoiced", "Reference Invoiced", "reference_invoiced", "Invoice References", "invoice_references"),
          );

          return {
            zoho_contact_id: String(c.contact_id),
            name,
            address: c.billing_address?.address || null,
            loyalty_points: loyalty,
            history_points: history,
            invoice_references: invoiceRefs,
          };
        })
        .filter((r): r is { zoho_contact_id: string; name: string; address: string | null; loyalty_points: number | null; history_points: number | null; invoice_references: string[] } => r !== null);


      // Compute per-pharmacy point delta from monotonic History Points, not
      // from Loyalty (Zoho resets Loyalty when moving points into History).
      const pharmIds = pharmacyInputs.map((r) => r.zoho_contact_id);
      const { data: existingPharms } = pharmIds.length
        ? await supabaseAdmin
            .from("pharmacies")
            .select("id, zoho_contact_id, is_active, loyalty_points, history_points")
            .in("zoho_contact_id", pharmIds)
        : { data: [] as any[] };
      const existingByZoho = new Map<string, any>();
      for (const ep of existingPharms ?? []) {
        existingByZoho.set(String((ep as any).zoho_contact_id), ep);
      }

      // Cross-pharmacy dedup within this batch (case-insensitive): each
      // invoice reference may belong to only one pharmacy.
      const claimedRefs = new Map<string, string>();
      const pharmacyRows = pharmacyInputs.map((r) => {
        const uniqueRefs: string[] = [];
        for (const ref of r.invoice_references) {
          const key = ref.toUpperCase();
          const owner = claimedRefs.get(key);
          if (owner && owner !== r.zoho_contact_id) continue;
          claimedRefs.set(key, r.zoho_contact_id);
          uniqueRefs.push(ref);
        }
        const existing = existingByZoho.get(r.zoho_contact_id);
        const oldHistory = Number(existing?.history_points ?? 0);
        const oldLoyalty = Number(existing?.loyalty_points ?? 0);
        // History Points is monotonic in Zoho — safe basis for the delta.
        // Fall back to Loyalty delta only when Zoho didn't report history yet.
        let delta = 0;
        if (r.history_points !== null) {
          delta = Math.max(0, r.history_points - oldHistory);
        } else if (r.loyalty_points !== null) {
          delta = Math.max(0, r.loyalty_points - oldLoyalty);
        }
        const nextHistory = r.history_points !== null
          ? Math.max(oldHistory, r.history_points)
          : oldHistory + delta;
        const nextLoyalty = r.loyalty_points !== null ? r.loyalty_points : oldLoyalty;
        return {
          zoho_contact_id: r.zoho_contact_id,
          name: r.name,
          address: r.address,
          invoice_references: uniqueRefs,
          is_active: existing?.is_active ?? true,
          loyalty_points: nextLoyalty,
          history_points: nextHistory,
          _delta: delta,
          _existingId: existing?.id ?? null,
        };
      });


      // Strip any of the incoming refs from OTHER pharmacies in the DB so the
      // same invoice number can't appear on two pharmacy rows at once.
      const allIncomingRefs = Array.from(
        new Set(pharmacyRows.flatMap((r) => r.invoice_references)),
      );
      if (allIncomingRefs.length > 0) {
        const incomingIds = new Set(pharmacyRows.map((r) => r.zoho_contact_id));
        const { data: otherPharms } = await supabaseAdmin
          .from("pharmacies")
          .select("id, zoho_contact_id, invoice_references")
          .overlaps("invoice_references", allIncomingRefs);
        const incomingUpper = new Set(allIncomingRefs.map((r) => r.toUpperCase()));
        for (const op of otherPharms ?? []) {
          if (incomingIds.has(String((op as any).zoho_contact_id))) continue;
          const current: string[] = Array.isArray((op as any).invoice_references)
            ? ((op as any).invoice_references as string[])
            : [];
          const filtered = current.filter((r) => !incomingUpper.has(r.toUpperCase()));
          if (filtered.length !== current.length) {
            await supabaseAdmin
              .from("pharmacies")
              .update({ invoice_references: filtered })
              .eq("id", (op as any).id);
          }
        }
      }

      const upsertRows = pharmacyRows.map(({ _delta, _existingId, ...rest }) => {
        void _delta; void _existingId;
        return rest;
      });
      const [cRes, pRes] = await Promise.all([
        supabaseAdmin.from("zoho_customers").upsert(customerRows, { onConflict: "zoho_contact_id" }),
        upsertRows.length > 0
          ? supabaseAdmin.from("pharmacies").upsert(upsertRows, { onConflict: "zoho_contact_id" })
          : Promise.resolve({ error: null as any }),
      ]);
      if (cRes.error) errors.push(`page ${page} upsert: ${cRes.error.message}`);
      else upserted += customerRows.length;
      if (pRes.error) errors.push(`page ${page} pharmacies upsert: ${pRes.error.message}`);

      // Split each pharmacy's loyalty delta equally across its members.
      const pharmDeltas = pharmacyRows.filter((r) => r._delta > 0);
      if (pharmDeltas.length > 0) {
        const zohoIds = pharmDeltas.map((r) => r.zoho_contact_id);
        const { data: phRows } = await supabaseAdmin
          .from("pharmacies")
          .select("id, zoho_contact_id")
          .in("zoho_contact_id", zohoIds);
        const idByZoho = new Map<string, string>();
        for (const p of phRows ?? []) idByZoho.set(String((p as any).zoho_contact_id), (p as any).id);

        for (const r of pharmDeltas) {
          const pharmacyId = idByZoho.get(r.zoho_contact_id);
          if (!pharmacyId) continue;
          const { data: members } = await supabaseAdmin
            .from("profiles")
            .select("id, points_balance, lifetime_points")
            .eq("pharmacy_id", pharmacyId);
          if (!members || members.length === 0) continue;
          const share = Math.floor(r._delta / members.length);
          if (share <= 0) continue;
          for (const m of members as any[]) {
            const newBal = Math.max(0, Number(m.points_balance ?? 0) + share);
            const newHist = Number(m.lifetime_points ?? 0) + share;
            await supabaseAdmin
              .from("profiles")
              .update({ points_balance: newBal, lifetime_points: newHist })
              .eq("id", m.id);
            await supabaseAdmin.from("points_ledger").insert({
              user_id: m.id,
              delta: share,
              reason: members.length > 1 ? `Zoho sync — split across ${members.length} pharmacy members` : "Zoho sync",
              source: "zoho_sync",
              reference: pharmacyId,
            });
          }
        }
      }
    };


    let page = 1;
    let next = fetchPage(page);
    while (true) {
      const current = await next;
      if (!current) break;
      if (current.stop) { errors.push(current.stop); break; }
      fetched += current.contacts.length;
      const hasMore = current.hasMore;
      const nextPageNum = page + 1;
      if (hasMore && nextPageNum <= 100) next = fetchPage(nextPageNum);
      await upsertPage(page, current.contacts);
      if (!hasMore) break;
      page = nextPageNum;
      if (page > 100) {
        truncated = true;
        errors.push(`hit page cap (100) — sync truncated at ${fetched} contacts`);
        break;
      }
    }

    const result: SyncResult = { ok: errors.length === 0, fetched, upserted, pages: page, truncated, errors: errors.slice(0, 10), notifiedCount };

    await finalize(result);
    return result;
  } catch (error: any) {
    const result: SyncResult = {
      ok: false, fetched: 0, upserted: 0, pages: 0, truncated: false,
      errors: [error?.message ?? "Zoho sync failed"], notifiedCount: 0,
    };
    await finalize(result);
    return result;
  }
}

