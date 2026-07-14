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
    // Authorize: admin OR owner-of-pharmacy
    const [{ data: roleRow }, { data: profile }, { data: pharm }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle(),
      supabaseAdmin.from("profiles").select("pharmacy_id").eq("id", context.userId).maybeSingle(),
      supabaseAdmin
        .from("pharmacies")
        .select("id, invoice_references")
        .eq("id", data.pharmacyId)
        .maybeSingle(),
    ]);
    const isAdmin = !!roleRow;
    const isOwner = profile?.pharmacy_id === data.pharmacyId;
    if (!isAdmin && !isOwner) throw new Error("Forbidden");
    if (!pharm) throw new Error("Pharmacy not found");

    const refs: string[] = Array.isArray((pharm as any).invoice_references)
      ? ((pharm as any).invoice_references as string[]).filter((r) => typeof r === "string" && r.trim().length > 0)
      : [];
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
    return { ok: true, invoices };
  });
