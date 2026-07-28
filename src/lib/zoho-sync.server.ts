import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getZohoAccessToken } from "./zoho-api.server";
import { sendTransactionalEmailServer } from "./email/send.server";

const STUCK_RUN_THRESHOLD_MINUTES = 15;

async function notifyAdminsOfSyncIssue(params: {
  status: 'failed' | 'stuck';
  source: string;
  runId?: string;
  startedAt?: string;
  finishedAt?: string;
  errors: string[];
}): Promise<void> {
  try {
    const { data: adminRoles } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');
    const ids = (adminRoles ?? []).map((r: any) => r.user_id).filter(Boolean);
    if (ids.length === 0) return;
    const { data: profs } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .in('id', ids);
    const emails = Array.from(
      new Set((profs ?? []).map((p: any) => p.email).filter(Boolean)),
    ) as string[];
    for (const email of emails) {
      await sendTransactionalEmailServer({
        templateName: 'zoho-sync-alert',
        recipientEmail: email,
        idempotencyKey: `zoho-sync-${params.status}-${params.runId ?? params.startedAt ?? Date.now()}-${email}`,
        templateData: params,
      });
    }
  } catch (e) {
    console.error('notifyAdminsOfSyncIssue failed', e);
  }
}

/** Finalize any runs that have been open too long and alert admins. */
async function reapStuckRuns(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - STUCK_RUN_THRESHOLD_MINUTES * 60_000).toISOString();
    const { data: stuck } = await supabaseAdmin
      .from('zoho_sync_runs')
      .select('id, started_at, source')
      .is('finished_at', null)
      .lt('started_at', cutoff);
    for (const row of (stuck ?? []) as any[]) {
      const nowIso = new Date().toISOString();
      const errMsg = `run stuck: no completion within ${STUCK_RUN_THRESHOLD_MINUTES} minutes`;
      await supabaseAdmin
        .from('zoho_sync_runs')
        .update({ finished_at: nowIso, ok: false, errors: [errMsg] as any })
        .eq('id', row.id);
      await notifyAdminsOfSyncIssue({
        status: 'stuck',
        source: row.source ?? 'unknown',
        runId: row.id,
        startedAt: row.started_at,
        finishedAt: nowIso,
        errors: [errMsg],
      });
    }
  } catch (e) {
    console.error('reapStuckRuns failed', e);
  }
}


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
  for (const part of raw.split(/[,;\n\r|]+/)) {
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

  // Sweep any previous runs that never finished, and alert admins.
  await reapStuckRuns();

  const startedAt = new Date().toISOString();
  const { data: runRow } = await supabaseAdmin
    .from("zoho_sync_runs")
    .insert({ started_at: startedAt, source, triggered_by: triggeredBy, ok: false })
    .select("id")
    .single();
  const runId = (runRow as any)?.id as string | undefined;

  const finalize = async (result: SyncResult) => {
    const finishedAt = new Date().toISOString();
    if (runId) {
      await supabaseAdmin
        .from("zoho_sync_runs")
        .update({
          finished_at: finishedAt,
          ok: result.ok,
          fetched: result.fetched,
          upserted: result.upserted,
          pages: result.pages,
          truncated: result.truncated,
          notified_count: result.notifiedCount,
          errors: result.errors as any,
        })
        .eq("id", runId);
    }
    if (!result.ok) {
      await notifyAdminsOfSyncIssue({
        status: 'failed',
        source,
        runId,
        startedAt,
        finishedAt,
        errors: result.errors.length > 0 ? result.errors : ['Zoho sync failed'],
      });
    }
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


      // Compute per-pharmacy point delta from Zoho's Loyalty Points value
      // (this is what "1160" reads on a Zoho contact). History Points is
      // reconstructed here as the cumulative sum of loyalty deltas.
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
        // Points are now driven by per-invoice distribution (Points Given = true),
        // not by Zoho contact loyalty_points. Preserve existing values on the row.
        return {
          zoho_contact_id: r.zoho_contact_id,
          name: r.name,
          address: r.address,
          invoice_references: uniqueRefs,
          is_active: existing?.is_active ?? true,
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

      const [cRes, pRes] = await Promise.all([
        supabaseAdmin.from("zoho_customers").upsert(customerRows, { onConflict: "zoho_contact_id" }),
        pharmacyRows.length > 0
          ? supabaseAdmin.from("pharmacies").upsert(pharmacyRows, { onConflict: "zoho_contact_id" })
          : Promise.resolve({ error: null as any }),
      ]);
      if (cRes.error) errors.push(`page ${page} upsert: ${cRes.error.message}`);
      else upserted += customerRows.length;
      if (pRes.error) errors.push(`page ${page} pharmacies upsert: ${pRes.error.message}`);
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

    // ---- Invoices sync (cache all Zoho invoices) ----
    const { data: allPharms } = await supabaseAdmin
      .from("pharmacies")
      .select("id, zoho_contact_id");
    const pharmIdByZoho = new Map<string, string>();
    for (const p of allPharms ?? []) {
      const z = (p as any).zoho_contact_id;
      if (z) pharmIdByZoho.set(String(z), (p as any).id);
    }

    const fetchInvoicePage = async (
      pg: number,
    ): Promise<{ invoices: any[]; hasMore: boolean; stop?: string } | null> => {
      if (Date.now() - tokenIssuedAt > TOKEN_TTL_MS) {
        const refreshed = await getZohoAccessToken();
        accessToken = refreshed.accessToken;
        tokenIssuedAt = Date.now();
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        // No server-side custom-field filter — Zoho's cf_* filter names vary
        // per org and often return empty results. We fetch all invoices and
        // check Points Given via each invoice's detail payload below.
        const url = `${apiBase}/invoices?organization_id=${orgId}&page=${pg}&per_page=200&sort_column=last_modified_time&sort_order=D`;
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
          return { invoices: [], hasMore: false, stop: `invoices page ${pg}: non-JSON (${res.status})` };
        }
        if (!res.ok) {
          return { invoices: [], hasMore: false, stop: `invoices page ${pg}: ${json?.message || res.statusText}` };
        }
        return { invoices: json.invoices ?? [], hasMore: Boolean(json.page_context?.has_more_page) };
      }
      return null;
    };

    // Zoho's invoice list endpoint doesn't include custom_fields on list rows —
    // fetch each invoice's detail so we can read Points Given / Total Points.
    const fetchInvoiceDetail = async (invoiceId: string): Promise<any | null> => {
      if (Date.now() - tokenIssuedAt > TOKEN_TTL_MS) {
        const refreshed = await getZohoAccessToken();
        accessToken = refreshed.accessToken;
        tokenIssuedAt = Date.now();
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        const url = `${apiBase}/invoices/${invoiceId}?organization_id=${orgId}`;
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
        if (!res.ok) return null;
        try {
          const json = raw ? JSON.parse(raw) : null;
          return json?.invoice ?? null;
        } catch { return null; }
      }
      return null;
    };

    // Helpers to read custom fields off an invoice payload
    const readInvCFBool = (inv: any, ...names: string[]): boolean | null => {
      const lower = names.map((n) => n.toLowerCase().replace(/[\s_-]/g, ""));
      const cfs: any[] = Array.isArray(inv?.custom_fields) ? inv.custom_fields : [];
      for (const cf of cfs) {
        const label = String(cf?.label ?? cf?.api_name ?? cf?.placeholder ?? "")
          .toLowerCase().replace(/[\s_-]/g, "");
        if (lower.includes(label)) {
          const raw = cf?.value ?? cf?.value_formatted ?? "";
          const s = String(raw).trim().toLowerCase();
          if (s === "") return null;
          if (["true","yes","1","y"].includes(s)) return true;
          if (["false","no","0","n"].includes(s)) return false;
        }
      }
      for (const n of names) {
        const key = `cf_${n.toLowerCase().replace(/\s+/g, "_")}`;
        const v = inv?.[key];
        if (v === true || v === false) return v;
        if (typeof v === "string") {
          const s = v.trim().toLowerCase();
          if (["true","yes","1","y"].includes(s)) return true;
          if (["false","no","0","n"].includes(s)) return false;
        }
      }
      return null;
    };
    const readInvCFNum = (inv: any, ...names: string[]): number | null => {
      const lower = names.map((n) => n.toLowerCase().replace(/[\s_-]/g, ""));
      const cfs: any[] = Array.isArray(inv?.custom_fields) ? inv.custom_fields : [];
      for (const cf of cfs) {
        const label = String(cf?.label ?? cf?.api_name ?? cf?.placeholder ?? "")
          .toLowerCase().replace(/[\s_-]/g, "");
        if (lower.includes(label)) {
          const raw = cf?.value ?? cf?.value_formatted ?? "";
          const v = Number(String(raw).replace(/,/g, "").trim());
          if (!Number.isNaN(v)) return v;
        }
      }
      for (const n of names) {
        const key = `cf_${n.toLowerCase().replace(/\s+/g, "_")}`;
        const v = inv?.[key];
        if (v !== undefined && v !== null && v !== "") {
          const num = Number(v);
          if (!Number.isNaN(num)) return num;
        }
      }
      return null;
    };

    // Pre-load the set of already-distributed (locked) invoices so we can
    // skip Zoho detail calls for them entirely. Locked invoices are terminal
    // — their points, custom fields, and totals will not change here.
    const lockedZohoIds = new Set<string>();
    {
      const { data: lockedRows } = await supabaseAdmin
        .from("invoices")
        .select("zoho_invoice_id")
        .not("points_distributed_at", "is", null);
      for (const r of lockedRows ?? []) {
        const z = (r as any).zoho_invoice_id;
        if (z) lockedZohoIds.add(String(z));
      }
    }

    let invPage = 1;
    let invoicesUpserted = 0;
    let invoicesDistributed = 0;
    let consecutiveFullyLockedPages = 0;
    while (true) {
      const cur = await fetchInvoicePage(invPage);
      if (!cur) break;
      if (cur.stop) { errors.push(cur.stop); break; }
      if (cur.invoices.length > 0) {
        // Skip invoices we've already locked/distributed — no need to call Zoho
        // detail for them. Since we sort newest-first, stop paginating once we
        // hit two consecutive pages where every invoice is already locked.
        const freshList = cur.invoices.filter((inv: any) => !lockedZohoIds.has(String(inv.invoice_id)));
        const pageFullyLocked = freshList.length === 0;
        if (pageFullyLocked) {
          consecutiveFullyLockedPages += 1;
          if (consecutiveFullyLockedPages >= 2) break;
          if (!cur.hasMore) break;
          invPage += 1;
          continue;
        }
        consecutiveFullyLockedPages = 0;

        // List rows don't include custom_fields; fetch each invoice detail
        // (small concurrency) so we can read Points Given / Total Points.
        const hydrated: any[] = [];
        const CONCURRENCY = 10;
        for (let i = 0; i < freshList.length; i += CONCURRENCY) {
          const chunk = freshList.slice(i, i + CONCURRENCY);
          const details = await Promise.all(
            chunk.map(async (inv: any) => {
              const detail = await fetchInvoiceDetail(String(inv.invoice_id));
              return detail ? { ...inv, ...detail } : inv;
            }),
          );
          hydrated.push(...details);
        }
        const nowIso = new Date().toISOString();
        const rows = hydrated
          .map((inv: any) => {
            const zohoContactId = inv.customer_id ? String(inv.customer_id) : null;
            const pointsGiven = readInvCFBool(inv, "cf_points_given", "Points Given", "points_given") === true;
            if (!pointsGiven) return null;
            const totalPointsRaw = readInvCFNum(inv, "cf_points", "cf_total_points", "Points", "Total Points", "points", "total_points");
            const totalPoints = totalPointsRaw !== null ? Math.max(0, Math.floor(totalPointsRaw)) : 0;
            // Skip invoices with 0/blank Total Points — nothing to distribute.
            if (totalPoints <= 0) return null;
            return {
              zoho_invoice_id: String(inv.invoice_id),
              invoice_number: inv.invoice_number ?? null,
              zoho_contact_id: zohoContactId,
              pharmacy_id: zohoContactId ? pharmIdByZoho.get(zohoContactId) ?? null : null,
              invoice_date: inv.date || null,
              due_date: inv.due_date || null,
              total: typeof inv.total === "number" ? inv.total : Number(inv.total ?? 0) || null,
              balance: typeof inv.balance === "number" ? inv.balance : Number(inv.balance ?? 0),
              currency_code: inv.currency_code ?? null,
              status: inv.status ?? null,
              points_given: true,
              total_points: totalPoints,
              raw: inv,
              last_synced_at: nowIso,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);
        if (rows.length === 0) {
          // nothing to upsert on this page
        } else {
        // Lock already-distributed invoices and also merge by invoice number,
        // so a repeated sync can only update the existing cached invoice row.
        const zohoIds = rows.map((r) => r.zoho_invoice_id);
        const invoiceNumbers = rows
          .map((r) => r.invoice_number ? String(r.invoice_number).trim() : "")
          .filter(Boolean);
        const existingByZoho = new Map<string, any>();
        const existingByNumber = new Map<string, any>();
        const { data: existingByZohoRows } = await supabaseAdmin
          .from("invoices")
          .select("id, zoho_invoice_id, invoice_number, points_distributed_at")
          .in("zoho_invoice_id", zohoIds);
        for (const existing of existingByZohoRows ?? []) {
          existingByZoho.set(String((existing as any).zoho_invoice_id), existing);
          const num = (existing as any).invoice_number ? String((existing as any).invoice_number).trim().toUpperCase() : "";
          if (num) existingByNumber.set(num, existing);
        }
        if (invoiceNumbers.length > 0) {
          const { data: existingByNumberRows } = await supabaseAdmin
            .from("invoices")
            .select("id, zoho_invoice_id, invoice_number, points_distributed_at")
            .in("invoice_number", Array.from(new Set(invoiceNumbers)));
          for (const existing of existingByNumberRows ?? []) {
            existingByZoho.set(String((existing as any).zoho_invoice_id), existing);
            const num = (existing as any).invoice_number ? String((existing as any).invoice_number).trim().toUpperCase() : "";
            if (num) existingByNumber.set(num, existing);
          }
        }

        const insertRows: typeof rows = [];
        const updateRows: Array<{ id: string; row: (typeof rows)[number] }> = [];
        for (const row of rows) {
          const numKey = row.invoice_number ? String(row.invoice_number).trim().toUpperCase() : "";
          const existing = existingByZoho.get(row.zoho_invoice_id) ?? (numKey ? existingByNumber.get(numKey) : null);
          if (existing?.points_distributed_at) continue;
          if (existing?.id) updateRows.push({ id: String(existing.id), row });
          else insertRows.push(row);
        }

        if (insertRows.length > 0) {
          const { error: invErr } = await supabaseAdmin
            .from("invoices")
            .upsert(insertRows, { onConflict: "zoho_invoice_id" });
          if (invErr) errors.push(`invoices page ${invPage} insert/update: ${invErr.message}`);
          else invoicesUpserted += insertRows.length;
        }
        for (const { id, row } of updateRows) {
          const { error: updErr } = await supabaseAdmin
            .from("invoices")
            .update(row)
            .eq("id", id);
          if (updErr) errors.push(`invoices page ${invPage} update ${row.invoice_number ?? row.zoho_invoice_id}: ${updErr.message}`);
          else invoicesUpserted += 1;
        }



        // Distribute points only for invoices flagged points_given=true that
        // haven't yet been distributed. Idempotent via points_distributed_at.
        const eligibleZoho = rows
          .filter((r) => r.points_given && (r.total_points ?? 0) > 0 && r.pharmacy_id)
          .map((r) => r.zoho_invoice_id);
        if (eligibleZoho.length > 0) {
          const { data: pending } = await supabaseAdmin
            .from("invoices")
            .select("id, zoho_invoice_id, invoice_number, pharmacy_id, total_points")
            .in("zoho_invoice_id", eligibleZoho)
            .is("points_distributed_at", null);
          for (const inv of (pending ?? []) as any[]) {
            const { data: dist, error: distErr } = await (supabaseAdmin as any)
              .rpc("distribute_invoice_points_once", { _invoice_id: inv.id });
            if (distErr) {
              errors.push(`invoice ${inv.invoice_number ?? inv.zoho_invoice_id} distribution: ${distErr.message}`);
              continue;
            }
            if (dist?.distributed) {
              notifiedCount += Number(dist.credited ?? 0);
              invoicesDistributed += 1;
            }
          }
        }
        }
      }

      if (!cur.hasMore) break;
      invPage += 1;
      if (invPage > 200) {
        truncated = true;
        errors.push(`hit invoice page cap (200) — sync truncated at ${invoicesUpserted} invoices`);
        break;
      }
    }
    upserted += invoicesUpserted;
    void invoicesDistributed;

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

