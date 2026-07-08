import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getZohoAccessToken } from "./zoho-api.server";
import { sendTransactionalEmailServer } from "@/lib/email/send.server";

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

export interface SyncResult {
  ok: boolean;
  fetched: number;
  upserted: number;
  pages: number;
  truncated: boolean;
  errors: string[];
  notifiedCount: number;
}

/** Core Zoho contacts → DB sync. When notify=true, emails users whose loyalty went up. */
export async function runZohoSync(opts: { notify?: boolean; source?: string; triggeredBy?: string | null } = {}): Promise<SyncResult> {
  const notify = opts.notify ?? false;
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
          const lp = readContactCF(c, "Loyalty Points", "loyalty_points", "LoyaltyPoints");
          const hp = readContactCF(c, "History Points", "history_points", "HistoryPoints");
          // Zoho's "History Points" is the cumulative earned total (points move
          // from Loyalty → History over time). Distribute based on History.
          const cumulative = hp !== null ? Math.floor(hp) : (lp !== null ? Math.floor(lp) : 0);
          return {
            zoho_contact_id: String(c.contact_id),
            name,
            address: c.billing_address?.address || null,
            loyalty_points: cumulative,
          };
        })
        .filter((r): r is { zoho_contact_id: string; name: string; address: string | null; loyalty_points: number } => r !== null);


      const pharmIds = pharmacyInputs.map((r) => r.zoho_contact_id);
      const { data: existingPharms } = pharmIds.length
        ? await supabaseAdmin
            .from("pharmacies")
            .select("zoho_contact_id, loyalty_points, history_points, is_active")
            .in("zoho_contact_id", pharmIds)
        : { data: [] as any[] };
      const existingPharmMap = new Map<string, { loyalty_points: number; history_points: number; is_active: boolean; exists: boolean }>();
      for (const ep of existingPharms ?? []) {
        existingPharmMap.set(String((ep as any).zoho_contact_id), {
          loyalty_points: Number((ep as any).loyalty_points ?? 0),
          history_points: Number((ep as any).history_points ?? 0),
          is_active: Boolean((ep as any).is_active ?? true),
          exists: true,
        });
      }
      // `loyalty_points` on the pharmacy row now already reflects Zoho's
      // Loyalty + History cumulative earned total. Treat history_points as a
      // high-water mark so it never goes down if Zoho briefly reports lower.
      const pharmacyRows = pharmacyInputs.map((r) => {
        const prev = existingPharmMap.get(r.zoho_contact_id);
        const history = Math.max(prev?.history_points ?? 0, r.loyalty_points);
        const is_active = prev?.exists ? prev.is_active : true;
        return { ...r, history_points: history, is_active };
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

      // Split each pharmacy's loyalty_points across its assigned members.
      // If only one member is assigned, that member receives all points.
      if (pharmacyInputs.length === 0) return;
      const { data: syncedPharms } = await supabaseAdmin
        .from("pharmacies")
        .select("id, zoho_contact_id, loyalty_points, history_points, is_active")
        .in("zoho_contact_id", pharmacyInputs.map((r) => r.zoho_contact_id));
      if (!syncedPharms || syncedPharms.length === 0) return;

      for (const pharm of syncedPharms) {
        const pharmId = (pharm as any).id as string;
        // Skip deactivated pharmacies — don't distribute points to their members.
        if ((pharm as any).is_active === false) continue;
        // history_points is the high-water mark of Zoho's cumulative
        // "Loyalty Points" value. Per-member delta = target − already_credited
        // (from prior zoho_sync ledger rows), so re-syncs are idempotent.
        const totalPoints = Math.max(0, Number((pharm as any).history_points ?? 0));

        const { data: members } = await supabaseAdmin
          .from("profiles")
          .select("id, email, full_name, points_balance, lifetime_points")
          .eq("pharmacy_id", pharmId);
        if (!members || members.length === 0) continue;

        const n = members.length;
        // Equal split — every member gets the same amount. Any fractional
        // remainder is dropped so shares stay identical across members.
        const base = Math.floor(totalPoints / n);

        // Fetch each member's cumulative Zoho-sync credits for THIS pharmacy so we
        // can compute a delta (target − already_credited) instead of overwriting
        // points_balance. Overwriting would erase redemption deductions made
        // between syncs — a real bug at scale.
        const memberIds = members.map((m: any) => m.id);
        const { data: ledgerRows } = await supabaseAdmin
          .from("points_ledger")
          .select("user_id, delta")
          .in("user_id", memberIds)
          .eq("source", "zoho_sync")
          .eq("reference", pharmId);
        const credited = new Map<string, number>();
        for (const row of ledgerRows ?? []) {
          const k = String((row as any).user_id);
          credited.set(k, (credited.get(k) ?? 0) + Number((row as any).delta ?? 0));
        }

        for (let i = 0; i < n; i++) {
          const m = members[i] as any;
          const target = base;

          const already = credited.get(String(m.id)) ?? 0;
          const delta = target - already;
          if (delta === 0) continue;

          const prevBalance = Number(m.points_balance ?? 0);
          const prevHistory = Number(m.lifetime_points ?? 0);
          const newBalance = Math.max(0, prevBalance + delta);

          await supabaseAdmin
            .from("profiles")
            .update({
              points_balance: newBalance,
              lifetime_points: delta > 0 ? prevHistory + delta : prevHistory,
            })
            .eq("id", m.id);

          await supabaseAdmin.from("points_ledger").insert({
            user_id: m.id,
            delta,
            reason: n > 1 ? `Zoho sync — split across ${n} pharmacy members` : "Zoho sync",
            source: "zoho_sync",
            reference: pharmId,
          });


          if (notify && delta > 0 && m.email) {
            const dayKey = new Date().toISOString().slice(0, 10);
            const r = await sendTransactionalEmailServer({
              templateName: "points-earned",
              recipientEmail: m.email,
              idempotencyKey: `daily-sync-${dayKey}-${m.id}`,
              templateData: {
                name: m.full_name || undefined,
                points: delta,
                reason: n > 1 ? `Daily Zoho sync (split across ${n} members)` : "Daily Zoho sync",
                newBalance,
              },
            });
            if (r.ok) notifiedCount++;
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

