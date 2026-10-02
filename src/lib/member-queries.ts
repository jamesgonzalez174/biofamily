import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** One shared profile request (includes the member's own pharmacy) used by every page. */
export const profileQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, pharmacy:pharmacies(id, name, address, invoice_references)")
        .eq("id", userId!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

/** Member-visible settings (expiry date + tickets toggle), shared by all components. */
export const memberSettingsQuery = queryOptions({
  queryKey: ["member-settings"],
  queryFn: async () => {
    const { data } = await (supabase as any).rpc("get_member_settings");
    return ((data as any[] | null)?.[0] ?? null) as { points_expire_at: string | null; tickets_enabled: boolean } | null;
  },
});
