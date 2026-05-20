import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, TrendingUp, Gift, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StatusBar } from "@/components/StatusBar";
import { PharmacyBanner } from "@/components/PharmacyBanner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { tierFor } from "@/lib/tiers";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user!.id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: ledger } = useQuery({
    queryKey: ["ledger", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("points_ledger").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(5);
      return data ?? [];
    },
  });

  const { data: featured } = useQuery({
    queryKey: ["featured-prizes"],
    queryFn: async () => {
      const { data } = await supabase.from("prizes").select("*").eq("is_active", true).gt("stock", 0).order("point_cost").limit(3);
      return data ?? [];
    },
  });

  const balance = profile?.points_balance ?? 0;
  const lifetime = profile?.lifetime_points ?? 0;
  const tier = tierFor(lifetime);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Welcome back</p>
            <h1 className="text-3xl font-semibold tracking-tight">{profile?.full_name || user?.email}</h1>
          </div>
          <StatusBar />
        </div>

        <PharmacyBanner />




        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2 overflow-hidden rounded-2xl bg-gradient-hero p-6 text-primary-foreground shadow-glow">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest opacity-80">
              <Sparkles className="h-3.5 w-3.5" /> Available balance
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <div className="text-5xl font-bold tabular-nums">{balance.toLocaleString()}</div>
              <div className="text-sm opacity-80">points</div>
            </div>
            <div className="mt-6">
              <div className="flex items-center justify-between text-xs opacity-90">
                <span>{tier.current.name} tier</span>
                {tier.next ? <span>{tier.toNext.toLocaleString()} pts to {tier.next.name}</span> : <span>Top tier reached</span>}
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20">
                <div className="h-full bg-white" style={{ width: `${tier.progress}%` }} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-gradient-card p-6 shadow-soft">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" /> Lifetime
            </div>
            <div className="mt-2 text-3xl font-bold tabular-nums">{lifetime.toLocaleString()}</div>
            <p className="mt-1 text-sm text-muted-foreground">Total points earned</p>
            <Link to="/catalog" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              Browse prizes <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Recent activity</h2>
              <Link to="/history" className="text-xs text-muted-foreground hover:text-foreground">View all</Link>
            </div>
            <ul className="mt-4 space-y-3">
              {(ledger ?? []).length === 0 && <li className="text-sm text-muted-foreground">No activity yet. Make a purchase to start earning.</li>}
              {ledger?.map((l) => (
                <li key={l.id} className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
                  <div>
                    <div className="text-sm font-medium">{l.reason}</div>
                    <div className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className={`text-sm font-semibold tabular-nums ${l.delta >= 0 ? "text-success" : "text-destructive"}`}>
                    {l.delta >= 0 ? "+" : ""}{l.delta}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Featured prizes</h2>
              <Link to="/catalog" className="text-xs text-muted-foreground hover:text-foreground">See all</Link>
            </div>
            <ul className="mt-4 space-y-3">
              {(featured ?? []).length === 0 && <li className="text-sm text-muted-foreground">No prizes yet.</li>}
              {featured?.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
                  <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-lg bg-muted">
                    {p.image_url ? <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" /> : <Gift className="h-5 w-5 text-muted-foreground" />}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.point_cost.toLocaleString()} pts</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${balance >= p.point_cost ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                    {balance >= p.point_cost ? "Affordable" : "Locked"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
