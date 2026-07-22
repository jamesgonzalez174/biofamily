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
  pointsPerMember: number;
  memberCount: number;
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
  .handler(async ({ data, context }): Promise<{ ok: boolean; invoices: InvoiceDetail[]; error?: string }> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const onlyPointsGiven = !isAdmin;
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

    // Count members assigned to this pharmacy so we can show per-user share.
    const { count: memberCountRaw } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("pharmacy_id", data.pharmacyId);
    const memberCount = Number(memberCountRaw ?? 0);

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
          pointsPerMember: 0,
          memberCount,
          error: "not synced yet",
        };
      }
      const points = row.points_given && row.total_points ? Math.max(0, Math.floor(Number(row.total_points))) : 0;
      return {
        number: String(row.invoice_number ?? num),
        invoiceId: row.zoho_invoice_id ? String(row.zoho_invoice_id) : null,
        date: row.invoice_date ?? null,
        dueDate: row.due_date ?? null,
        total: row.total !== null && row.total !== undefined ? Number(row.total) : null,
        balance: row.balance !== null && row.balance !== undefined ? Number(row.balance) : null,
        currencyCode: row.currency_code ?? null,
        status: row.status ?? null,
        points,
        pointsPerMember: memberCount > 0 ? Math.floor(points / memberCount) : 0,
        memberCount,
      };
    };

    // Prefer the pharmacy's declared references order; then append any
    // linked-by-pharmacy invoices not already covered.
    const invoices: InvoiceDetail[] = [];
    const usedKeys = new Set<string>();
    for (const ref of refs) {
      const key = ref.toUpperCase();
      const row = byNumber.get(key);
      if (onlyPointsGiven && !(row && row.points_given)) continue;
      invoices.push(toDetail(ref, row));
      usedKeys.add(key);
    }
    for (const row of linked ?? []) {
      const num = (row as any).invoice_number ? String((row as any).invoice_number) : null;
      if (!num) continue;
      const key = num.toUpperCase();
      if (usedKeys.has(key)) continue;
      if (onlyPointsGiven && !(row as any).points_given) continue;
      usedKeys.add(key);
      invoices.push(toDetail(num, row));
    }

    return { ok: true, invoices };
  });

