import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // getUser() awaits session restore from localStorage and revalidates with
    // Supabase Auth; getSession() can momentarily resolve null on hard refresh
    // and cause a false redirect to /login.
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      throw redirect({ to: "/login", search: { redirect: location.href } as never });
    }
  },
  component: () => <Outlet />,
});
