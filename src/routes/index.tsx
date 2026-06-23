import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Biomed Family — Earn points, claim prizes" },
      { name: "description", content: "Biomed Family loyalty rewards: pharmacy teams earn points on every qualifying purchase and redeem them for real prizes." },
      { property: "og:title", content: "Biomed Family — Earn points, claim prizes" },
      { property: "og:description", content: "Biomed Family loyalty rewards: pharmacy teams earn points on every qualifying purchase and redeem them for real prizes." },
      { property: "og:url", content: "https://myprizepoint.com/" },
    ],
    links: [{ rel: "canonical", href: "https://myprizepoint.com/" }],
  }),
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    throw redirect({ to: session ? "/dashboard" : "/login" });
  },
  component: () => null,
});
