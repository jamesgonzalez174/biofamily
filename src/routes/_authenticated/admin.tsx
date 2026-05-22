import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

let adminCheck: Promise<boolean> | null = null;
let adminCheckUserId: string | null = null;

async function checkAdmin(userId: string) {
  if (adminCheckUserId !== userId) {
    adminCheckUserId = userId;
    adminCheck = supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => !!data);
  }
  return adminCheck!;
}

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
    const isAdmin = await checkAdmin(session.user.id);
    if (!isAdmin) throw redirect({ to: "/dashboard" });
  },
  component: () => <Outlet />,
});
