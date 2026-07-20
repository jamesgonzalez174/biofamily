import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getZohoAccessToken } from "./zoho-api.server";

export type InvoiceDetail = {
  number: string;
  invoiceId: string | null;
  date: string | null;
  dueDate: string | null;
  total: number | null;
  balance: number | null;
  currencyCode: string | null;
  status: string | null;
  points: number;
  error?: string;
};

/**
 * Fetch invoice details (date/total/status) from Zoho Books for every
 * `invoice_references` value stored on a pharmacy.
 *
 * Access: admin, OR the requester's own pharmacy.
 */
export const getPharmacyInvoiceDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pharmacyId: string }) => {
    if (!input?.pharmacyId || typeof input.pharmacyId !== "string") {
      throw new Error("pharmacyId required");
    }
    return input;
  })
  .handler(async ({ context, data }): Promise<{ ok: boolean; invoices: InvoiceDetail[]; error?: string }> => {
    // Authorize: admin OR owner-of-pharmacy OR user has access to it
    const [{ data: roleRow }, { data: profile }, { data: access }, { data: pharm }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle(),
      supabaseAdmin.from("profiles").select("pharmacy_id").eq("id", context.userId).maybeSingle(),
      supabaseAdmin.from("user_pharmacy_access").select("pharmacy_id").eq("user_id", context.userId).eq("pharmacy_id", data.pharmacyId).maybeSingle(),
      supabaseAdmin
        .from("pharmacies")
        .select("id, invoice_references, loyalty_points")
        .eq("id", data.pharmacyId)
        .maybeSingle(),
    ]);
    const isAdmin = !!roleRow;
    const isOwner = profile?.pharmacy_id === data.pharmacyId;
    const hasAccess = !!access;
    if (!isAdmin && !isOwner && !hasAccess) throw new Error("Forbidden");
    if (!pharm) throw new Error("Pharmacy not found");


    const refs: string[] = Array.isArray((pharm as any).invoice_references)
      ? ((pharm as any).invoice_references as string[]).filter((r) => typeof r === "string" && r.trim().length > 0)
      : [];
    const pharmacyLoyalty = Math.max(0, Number((pharm as any).loyalty_points ?? 0));
    if (refs.length === 0) return { ok: true, invoices: [] };

    let accessToken: string, apiDomain: string, orgId: string;
    try {
      const t = await getZohoAccessToken();
      accessToken = t.accessToken;
      apiDomain = t.apiDomain;
      orgId = t.orgId;
    } catch (e: any) {
      return { ok: false, invoices: [], error: e?.message ?? "Zoho not connected" };
    }

    const fetchOne = async (ref: string): Promise<InvoiceDetail> => {
      const base: InvoiceDetail = {
        number: ref,
        invoiceId: null,
        date: null,
        dueDate: null,
        total: null,
        balance: null,
        currencyCode: null,
        status: null,
        points: 0,
      };
      try {
        const url = `${apiDomain}/books/v3/invoices?organization_id=${orgId}&invoice_number=${encodeURIComponent(ref)}`;
        const res = await fetch(url, {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: "application/json" },
        });
        const json: any = await res.json().catch(() => null);
        if (!res.ok) return { ...base, error: json?.message ?? `HTTP ${res.status}` };
        const list: any[] = Array.isArray(json?.invoices) ? json.invoices : [];
        const inv = list.find((i) => String(i?.invoice_number) === ref) ?? list[0];
        if (!inv) return { ...base, error: "not found in Zoho" };
        return {
          number: String(inv.invoice_number ?? ref),
          invoiceId: inv.invoice_id ? String(inv.invoice_id) : null,
          date: inv.date ?? null,
          dueDate: inv.due_date ?? null,
          total: typeof inv.total === "number" ? inv.total : Number(inv.total ?? 0) || null,
          balance: typeof inv.balance === "number" ? inv.balance : Number(inv.balance ?? 0),
          currencyCode: inv.currency_code ?? null,
          status: inv.status ?? null,
          points: 0,
        };
      } catch (e: any) {
        return { ...base, error: e?.message ?? "fetch failed" };
      }
    };

    // Cap concurrency to avoid hammering Zoho: process in batches of 5.
    const invoices: InvoiceDetail[] = [];
    for (let i = 0; i < refs.length; i += 5) {
      const batch = await Promise.all(refs.slice(i, i + 5).map(fetchOne));
      invoices.push(...batch);
    }

    // Attribute the pharmacy's current loyalty points across invoices,
    // proportional to invoice total. Falls back to equal split if totals
    // are missing/zero. Uses largest-remainder so shares sum exactly to
    // pharmacyLoyalty (whole points).
    if (pharmacyLoyalty > 0 && invoices.length > 0) {
      const totals = invoices.map((i) => (typeof i.total === "number" && i.total > 0 ? i.total : 0));
      const sumTotals = totals.reduce((a, b) => a + b, 0);
      let shares: number[];
      if (sumTotals > 0) {
        const raw = totals.map((t) => (t / sumTotals) * pharmacyLoyalty);
        const floors = raw.map((v) => Math.floor(v));
        let remainder = pharmacyLoyalty - floors.reduce((a, b) => a + b, 0);
        const order = raw
          .map((v, idx) => ({ idx, frac: v - Math.floor(v) }))
          .sort((a, b) => b.frac - a.frac);
        for (const o of order) {
          if (remainder <= 0) break;
          floors[o.idx] += 1;
          remainder -= 1;
        }
        shares = floors;
      } else {
        const base = Math.floor(pharmacyLoyalty / invoices.length);
        shares = invoices.map(() => base);
        let remainder = pharmacyLoyalty - base * invoices.length;
        for (let i = 0; i < invoices.length && remainder > 0; i++, remainder--) shares[i] += 1;
      }
      for (let i = 0; i < invoices.length; i++) invoices[i].points = shares[i];
    }

    return { ok: true, invoices };
  });
