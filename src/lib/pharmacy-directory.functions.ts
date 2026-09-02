import { createServerFn } from "@tanstack/react-start";

export type PharmacyOption = { id: string; name: string };

/**
 * Minimal, public pharmacy picker used on the signup screen.
 * Returns only id + name (no addresses or financial data) so the
 * pharmacy_directory table itself can stay locked to signed-in users.
 */
export const listPharmacyOptions = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ pharmacies: PharmacyOption[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("pharmacies")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    return {
      pharmacies: (data ?? []).map((p) => ({ id: String(p.id), name: String(p.name) })),
    };
  },
);
