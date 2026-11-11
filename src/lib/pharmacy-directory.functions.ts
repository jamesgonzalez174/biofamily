import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PharmacyOption = { id: string; name: string; address: string | null };

/**
 * Pharmacy picker for signed-in members (no longer public).
 * Returns id + name + address so users can search by address and tell
 * identically named branches apart, while keeping financial data private.
 */
export const listPharmacyOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
  async (): Promise<{ pharmacies: PharmacyOption[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("pharmacies")
      .select("id, name, address")
      .eq("is_active", true)
      .order("name");
    return {
      pharmacies: (data ?? []).map((p) => ({ id: String(p.id), name: String(p.name), address: p.address ?? null })),
    };
  },
);

export type SalesRepOption = { id: string; name: string };

/** Signed-in-only list of active sales rep names for the signup "how did you hear about us" picker. */
export const listSalesRepOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
  async (): Promise<{ reps: SalesRepOption[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("sales_reps").select("id, name").eq("is_active", true).order("name");
    return { reps: (data ?? []).map((r) => ({ id: String(r.id), name: String(r.name) })) };
  },
);
