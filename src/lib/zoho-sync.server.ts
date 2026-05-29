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
        const history = (prev?.history_points ?? 0) + r.loyalty_points;
        return { ...r, is_active: true, history_points: history };
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
        .select("id, zoho_contact_id, loyalty_points, history_points")
        .in("zoho_contact_id", pharmacyInputs.map((r) => r.zoho_contact_id));
      if (!syncedPharms || syncedPharms.length === 0) return;

      for (const pharm of syncedPharms) {
        const pharmId = (pharm as any).id as string;
        // Use cumulative history_points as the target so each sync ADDS the
        // newly-reported loyalty_points instead of clobbering to the snapshot.
        // Example: yesterday +100, today +150 → user shows 250 (not 150).
        const totalPoints = Math.max(0, Number((pharm as any).history_points ?? 0));

        const { data: members } = await supabaseAdmin
          .from("profiles")
          .select("id, email, full_name, points_balance, lifetime_points")
          .eq("pharmacy_id", pharmId);
        if (!members || members.length === 0) continue;

        const n = members.length;
        const base = Math.floor(totalPoints / n);
        const remainder = totalPoints - base * n;

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
          const target = base + (i < remainder ? 1 : 0);
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

