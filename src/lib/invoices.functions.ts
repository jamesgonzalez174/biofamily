import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
 * Return invoice details for a pharmacy from the cached `invoices` table.
 * Combines invoices linked by pharmacy_id and invoices referenced by
 * invoice_number in the pharmacy's invoice_references field.
 */
export const getPharmacyInvoiceDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pharmacyId: string }) => {
    if (!input?.pharmacyId || typeof input.pharmacyId !== "string") {
      throw new Error("pharmacyId required");
    }
    return input;
  })
  .handler(async ({ data }): Promise<{ ok: boolean; invoices: InvoiceDetail[]; error?: string }> => {
    const { data: pharm } = await supabaseAdmin
      .from("pharmacies")
      .select("id, invoice_references, loyalty_points")
      .eq("id", data.pharmacyId)
      .maybeSingle();
    if (!pharm) throw new Error("Pharmacy not found");

    const refs: string[] = Array.isArray((pharm as any).invoice_references)
      ? ((pharm as any).invoice_references as string[]).filter((r) => typeof r === "string" && r.trim().length > 0)
      : [];
    void pharm;

    // Pull all invoices linked to this pharmacy, plus any matching by number.
    const { data: linked } = await supabaseAdmin
      .from("invoices")
      .select("invoice_number, zoho_invoice_id, invoice_date, due_date, total, balance, currency_code, status, points_given, total_points")
      .eq("pharmacy_id", data.pharmacyId);

    const byNumber = new Map<string, any>();
    for (const row of linked ?? []) {
      const num = (row as any).invoice_number ? String((row as any).invoice_number) : null;
      if (num) byNumber.set(num.toUpperCase(), row);
    }

    if (refs.length > 0) {
      const missing = refs.filter((r) => !byNumber.has(r.toUpperCase()));
      if (missing.length > 0) {
        const { data: byNums } = await supabaseAdmin
          .from("invoices")
          .select("invoice_number, zoho_invoice_id, invoice_date, due_date, total, balance, currency_code, status, points_given, total_points")
          .in("invoice_number", missing);
        for (const row of byNums ?? []) {
          const num = (row as any).invoice_number ? String((row as any).invoice_number) : null;
          if (num) byNumber.set(num.toUpperCase(), row);
        }
      }
    }

    const toDetail = (num: string, row: any | undefined): InvoiceDetail => {
      if (!row) {
        return {
          number: num,
          invoiceId: null,
          date: null,
          dueDate: null,
          total: null,
          balance: null,
          currencyCode: null,
          status: null,
          points: 0,
          error: "not synced yet",
        };
      }
      return {
        number: String(row.invoice_number ?? num),
        invoiceId: row.zoho_invoice_id ? String(row.zoho_invoice_id) : null,
        date: row.invoice_date ?? null,
        dueDate: row.due_date ?? null,
        total: row.total !== null && row.total !== undefined ? Number(row.total) : null,
        balance: row.balance !== null && row.balance !== undefined ? Number(row.balance) : null,
        currencyCode: row.currency_code ?? null,
        status: row.status ?? null,
        points: 0,
      };
    };

    // Prefer the pharmacy's declared references order; then append any
    // linked-by-pharmacy invoices not already covered.
    const invoices: InvoiceDetail[] = [];
    const usedKeys = new Set<string>();
    for (const ref of refs) {
      const key = ref.toUpperCase();
      invoices.push(toDetail(ref, byNumber.get(key)));
      usedKeys.add(key);
    }
    for (const row of linked ?? []) {
      const num = (row as any).invoice_number ? String((row as any).invoice_number) : null;
      if (!num) continue;
      const key = num.toUpperCase();
      if (usedKeys.has(key)) continue;
      usedKeys.add(key);
      invoices.push(toDetail(num, row));
    }

    // Attribute the pharmacy's loyalty points across invoices, proportional
    // to invoice total (largest-remainder for whole-point shares).
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

