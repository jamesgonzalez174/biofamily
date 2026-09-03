import { createServerFn } from "@tanstack/react-start";

export type PharmacyOption = { id: string; name: string; address: string | null };

/**
 * Minimal, public pharmacy picker used on the signup screen.
 * Returns id + name + address so users can search by address and tell
 * identically named branches apart, while keeping financial data private.
 */
export const listPharmacyOptions = createServerFn({ method: "GET" }).handler(
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
