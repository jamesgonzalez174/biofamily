import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Sparkles, Trophy, Gift, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) throw redirect({ to: "/dashboard" });
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-primary shadow-glow">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Biomed Family</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/login" className="rounded-lg px-4 py-2 text-sm font-medium text-foreground hover:bg-muted">Sign in</Link>
          <Link to="/signup" className="rounded-lg bg-gradient-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft hover:opacity-95">Get started</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="py-20 text-center md:py-32">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-soft">
            <Zap className="h-3.5 w-3.5 text-primary" /> Auto-synced with your Zoho purchases
          </div>
          <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-bold tracking-tight md:text-7xl">
            Every purchase earns <span className="text-gradient">rewards</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            Turn invoices into loyalty points and unlock prizes your customers actually want.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link to="/signup" className="rounded-xl bg-gradient-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-glow hover:opacity-95">Create account</Link>
            <Link to="/login" className="rounded-xl border border-border bg-card px-6 py-3 text-sm font-semibold hover:bg-muted">I have an account</Link>
          </div>
        </section>

        <section className="grid gap-4 pb-24 md:grid-cols-3">
          {[
            { icon: Zap, title: "Auto point sync", desc: "Zoho invoices instantly turn into points." },
            { icon: Trophy, title: "Tier progression", desc: "Bronze, Silver, Gold and beyond." },
            { icon: Gift, title: "Real prizes", desc: "Curated catalog, fulfilled by your team." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-gradient-card p-6 shadow-soft">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
