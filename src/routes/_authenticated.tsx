import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

// User id already verified with Supabase Auth in this page session.
let verifiedUserId: string | null = null;

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Fast path: in-app navigation with an already-verified session.
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id && session.user.id === verifiedUserId) return;

    // getUser() awaits session restore from localStorage and revalidates with
    // Supabase Auth; getSession() can momentarily resolve null on hard refresh
    // and cause a false redirect to /login.
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      verifiedUserId = null;
      throw redirect({ to: "/login", search: { redirect: location.href } as never });
    }
    verifiedUserId = user.id;
  },
  component: () => <Outlet />,
});
