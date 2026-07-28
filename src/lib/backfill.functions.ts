import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

async function readInvCFBool(inv: any, ...names: string[]): Promise<boolean | null> {
  const lower = names.map((n) => n.toLowerCase().replace(/[\s_-]/g, ""));
  const cfs: any[] = Array.isArray(inv?.custom_fields) ? inv.custom_fields : [];
  for (const cf of cfs) {
    const label = String(cf?.label ?? cf?.api_name ?? cf?.placeholder ?? "")
      .toLowerCase().replace(/[\s_-]/g, "");
    if (lower.includes(label)) {
      const s = String(cf?.value ?? cf?.value_formatted ?? "").trim().toLowerCase();
      if (s === "") return null;
      if (["true", "yes", "1", "y"].includes(s)) return true;
      if (["false", "no", "0", "n"].includes(s)) return false;
    }
  }
  for (const n of names) {
    const v = inv?.[`cf_${n.toLowerCase().replace(/\s+/g, "_")}`];
    if (v === true || v === false) return v;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (["true", "yes", "1", "y"].includes(s)) return true;
      if (["false", "no", "0", "n"].includes(s)) return false;
    }
  }
  return null;
}

function readInvCFNum(inv: any, ...names: string[]): number | null {
  const lower = names.map((n) => n.toLowerCase().replace(/[\s_-]/g, ""));
  const cfs: any[] = Array.isArray(inv?.custom_fields) ? inv.custom_fields : [];
  for (const cf of cfs) {
    const label = String(cf?.label ?? cf?.api_name ?? cf?.placeholder ?? "")
      .toLowerCase().replace(/[\s_-]/g, "");
    if (lower.includes(label)) {
      const v = Number(String(cf?.value ?? cf?.value_formatted ?? "").replace(/,/g, "").trim());
      if (!Number.isNaN(v)) return v;
    }
  }
  for (const n of names) {
    const v = inv?.[`cf_${n.toLowerCase().replace(/\s+/g, "_")}`];
    if (v !== undefined && v !== null && v !== "") {
      const num = Number(v);
      if (!Number.isNaN(num)) return num;
    }
  }
  return null;
}

/**
 * Distribute an invoice's total_points across its pharmacy's members.
 * Idempotent per-invoice via ledger reference dedupe on caller side; this
 * helper only performs the writes.
 */
async function distributeInvoice(row: {
  id: string;
  zoho_invoice_id: string;
  invoice_number: string | null;
  pharmacy_id: string;
  total_points: number;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const pts = row.total_points;
  const { data: phRow } = await supabaseAdmin
    .from("pharmacies")
    .select("history_points, loyalty_points")
    .eq("id", row.pharmacy_id)
    .single();
  const newHistory = Number((phRow as any)?.history_points ?? 0) + pts;
  const newLoyalty = Number((phRow as any)?.loyalty_points ?? 0) + pts;
  await supabaseAdmin
    .from("pharmacies")
    .update({ history_points: newHistory, loyalty_points: newLoyalty })
    .eq("id", row.pharmacy_id);

  const { data: members } = await supabaseAdmin
    .from("profiles")
    .select("id, points_balance, lifetime_points")
    .eq("pharmacy_id", row.pharmacy_id);
  const memberCount = members?.length ?? 0;
  const share = memberCount > 0 ? Math.floor(pts / memberCount) : 0;
  if (share > 0) {
    for (const m of members as any[]) {
      const newBal = Math.max(0, Number(m.points_balance ?? 0) + share);
      const newLife = Number(m.lifetime_points ?? 0) + share;
      await supabaseAdmin
        .from("profiles")
        .update({ points_balance: newBal, lifetime_points: newLife })
        .eq("id", m.id);
      await supabaseAdmin.from("points_ledger").insert({
        user_id: m.id,
        delta: share,
        reason: `Invoice ${row.invoice_number ?? row.zoho_invoice_id} — ${pts} pts split across ${memberCount}`,
        source: "zoho_invoice",
        reference: row.zoho_invoice_id,
      });
    }
  }
  await supabaseAdmin
    .from("invoices")
    .update({ points_distributed_at: new Date().toISOString() })
    .eq("id", row.id);
  return { memberCount, share };
}

/**
 * Reverse a previously distributed invoice: negate prior ledger entries for
 * this invoice, roll back member balances/lifetime, and subtract from the
 * pharmacy's history/loyalty totals. Safe to run once per invoice.
 */
async function reverseInvoice(row: {
  id: string;
  zoho_invoice_id: string;
  invoice_number: string | null;
  pharmacy_id: string | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: entries } = await supabaseAdmin
    .from("points_ledger")
    .select("id, user_id, delta")
    .eq("source", "zoho_invoice")
    .eq("reference", row.zoho_invoice_id);
  const positive = (entries ?? []).filter((e: any) => Number(e.delta) > 0);
  let reversed = 0;
  for (const e of positive as any[]) {
    const d = Number(e.delta);
    const { data: p } = await supabaseAdmin
      .from("profiles")
      .select("points_balance, lifetime_points")
      .eq("id", e.user_id)
      .single();
    if (p) {
      const newBal = Math.max(0, Number((p as any).points_balance ?? 0) - d);
      const newLife = Math.max(0, Number((p as any).lifetime_points ?? 0) - d);
      await supabaseAdmin
        .from("profiles")
        .update({ points_balance: newBal, lifetime_points: newLife })
        .eq("id", e.user_id);
    }
    await supabaseAdmin.from("points_ledger").insert({
      user_id: e.user_id,
      delta: -d,
      reason: `Reversed invoice ${row.invoice_number ?? row.zoho_invoice_id} for backfill`,
      source: "zoho_invoice_reversal",
      reference: row.zoho_invoice_id,
    });
    reversed += d;
  }
  if (row.pharmacy_id && reversed > 0) {
    const { data: phRow } = await supabaseAdmin
      .from("pharmacies")
      .select("history_points, loyalty_points")
      .eq("id", row.pharmacy_id)
      .single();
    const newHistory = Math.max(0, Number((phRow as any)?.history_points ?? 0) - reversed);
    const newLoyalty = Math.max(0, Number((phRow as any)?.loyalty_points ?? 0) - reversed);
    await supabaseAdmin
      .from("pharmacies")
      .update({ history_points: newHistory, loyalty_points: newLoyalty })
      .eq("id", row.pharmacy_id);
  }
  await supabaseAdmin
    .from("invoices")
    .update({ points_distributed_at: null })
    .eq("id", row.id);
  return { reversedTotal: reversed, reversedEntries: positive.length };
}

/**
 * Backfill invoice point distribution.
 *
 * Modes:
 * - "pending": distribute any cached invoices with points_given=true,
 *   total_points > 0, pharmacy linked, and points_distributed_at IS NULL.
 *   Use this after Zoho values (Total Points, or the pharmacy contact
 *   mapping) were corrected and a subsequent sync updated the cache.
 * - "reprocess": re-fetch a specific invoice from Zoho, update cached
 *   points_given / total_points, reverse any prior distribution, and
 *   redistribute using the current values.
 */
export const backfillInvoicePoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      mode: z.enum(["pending", "reprocess"]),
      invoiceNumber: z.string().trim().min(1).max(64).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.mode === "pending") {
      const { data: rows, error } = await supabaseAdmin
        .from("invoices")
        .select("id, zoho_invoice_id, invoice_number, pharmacy_id, total_points, points_given, points_distributed_at")
        .eq("points_given", true)
        .is("points_distributed_at", null)
        .gt("total_points", 0)
        .not("pharmacy_id", "is", null);
      if (error) throw new Error(error.message);
      const list = (rows ?? []) as any[];
      let distributed = 0;
      let skipped = 0;
      const results: Array<{ invoice: string; members: number; share: number }> = [];
      for (const r of list) {
        try {
          const res = await distributeInvoice({
            id: r.id,
            zoho_invoice_id: r.zoho_invoice_id,
            invoice_number: r.invoice_number,
            pharmacy_id: r.pharmacy_id,
            total_points: Number(r.total_points),
          });
          distributed += 1;
          results.push({ invoice: r.invoice_number ?? r.zoho_invoice_id, members: res.memberCount, share: res.share });
        } catch (e: any) {
          skipped += 1;
          console.error("backfill pending distribute failed", e);
        }
      }
      await supabaseAdmin.from("admin_audit_log").insert({
        actor_user_id: context.userId,
        action: "backfill_invoices_pending",
        target_type: "invoice",
        details: { distributed, skipped, sample: results.slice(0, 20) },
      });
      return { mode: "pending" as const, examined: list.length, distributed, skipped, results };
    }

    // reprocess mode
    const invNumber = data.invoiceNumber;
    if (!invNumber) throw new Error("invoiceNumber is required for reprocess mode");

    const { data: existing } = await supabaseAdmin
      .from("invoices")
      .select("id, zoho_invoice_id, invoice_number, pharmacy_id, total_points, points_given, points_distributed_at")
      .or(`invoice_number.eq.${invNumber},zoho_invoice_id.eq.${invNumber}`)
      .maybeSingle();
    if (!existing) throw new Error(`Invoice ${invNumber} not found in cache. Run a Zoho sync first.`);

    // Re-fetch from Zoho for fresh custom-field values.
    const { getZohoAccessToken } = await import("@/lib/zoho-api.server");
    const { accessToken, apiDomain, orgId } = await getZohoAccessToken();
    const url = `${apiDomain}/books/v3/invoices/${encodeURIComponent(
      (existing as any).zoho_invoice_id,
    )}?organization_id=${orgId}`;
    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: "application/json" },
    });
    const raw = await res.text();
    let json: any = null;
    try { json = raw ? JSON.parse(raw) : null; } catch {}
    if (!res.ok) throw new Error(`Zoho fetch failed: ${json?.message || res.statusText}`);
    const inv = json?.invoice ?? null;
    if (!inv) throw new Error("Zoho invoice payload missing");

    const pointsGiven = (await readInvCFBool(inv, "cf_points_given", "Points Given", "points_given")) === true;
    const totalPointsRaw = readInvCFNum(inv, "cf_points", "cf_total_points", "Points", "Total Points", "points", "total_points");
    const totalPoints = totalPointsRaw !== null ? Math.max(0, Math.floor(totalPointsRaw)) : null;

    await supabaseAdmin
      .from("invoices")
      .update({
        points_given: pointsGiven,
        total_points: totalPoints,
        raw: inv,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", (existing as any).id);

    let reversed = { reversedTotal: 0, reversedEntries: 0 };
    if ((existing as any).points_distributed_at) {
      reversed = await reverseInvoice({
        id: (existing as any).id,
        zoho_invoice_id: (existing as any).zoho_invoice_id,
        invoice_number: (existing as any).invoice_number,
        pharmacy_id: (existing as any).pharmacy_id,
      });
    }

    let distributed: { memberCount: number; share: number } | null = null;
    if (pointsGiven && (existing as any).pharmacy_id && totalPoints && totalPoints > 0) {
      distributed = await distributeInvoice({
        id: (existing as any).id,
        zoho_invoice_id: (existing as any).zoho_invoice_id,
        invoice_number: (existing as any).invoice_number,
        pharmacy_id: (existing as any).pharmacy_id,
        total_points: totalPoints,
      });
    }

    await supabaseAdmin.from("admin_audit_log").insert({
      actor_user_id: context.userId,
      action: "backfill_invoice_reprocess",
      target_type: "invoice",
      target_id: (existing as any).zoho_invoice_id,
      target_label: (existing as any).invoice_number ?? (existing as any).zoho_invoice_id,
      details: { pointsGiven, totalPoints, reversed, distributed },
    });

    return {
      mode: "reprocess" as const,
      invoice: (existing as any).invoice_number ?? (existing as any).zoho_invoice_id,
      pointsGiven,
      totalPoints,
      reversed,
      distributed,
    };
  });
