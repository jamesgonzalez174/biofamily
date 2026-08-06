import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, TrendingUp, Gift, ArrowRight, Ticket, Award, Package, History, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StatusBar } from "@/components/StatusBar";
import { PharmacyBanner } from "@/components/PharmacyBanner";
import { PointsExpiryBanner } from "@/components/PointsExpiryBanner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { tierFor } from "@/lib/tiers";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Your dashboard — Biomed Family rewards" },
      { name: "description", content: "Track your points balance, tier progress, recent activity and prizes you can claim." },
      { property: "og:title", content: "Your dashboard — Biomed Family rewards" },
      { property: "og:description", content: "Track your points balance, tier progress, recent activity and prizes you can claim." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
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
  const { data: settings } = useQuery({
    queryKey: ["settings", "tickets"],
    queryFn: async () => (await supabase.from("settings").select("*").eq("id", 1).maybeSingle()).data,
  });

  const balance = profile?.points_balance ?? 0;
  const lifetime = profile?.lifetime_points ?? 0;
  const tickets = (profile as { tickets?: number } | undefined)?.tickets ?? 0;
  const ticketsEnabled = (settings as { tickets_enabled?: boolean } | null | undefined)?.tickets_enabled === true;
  const tier = tierFor(lifetime);
  const affordable = (featured ?? []).filter((p) => balance >= p.point_cost).length;

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Header */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Member dashboard</p>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight md:text-3xl">
              {profile?.full_name || user?.email}
            </h1>
          </div>
          <StatusBar />
        </header>

        <PharmacyBanner />
        <PointsExpiryBanner />

        {/* Balance + tier */}
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-hero p-7 text-primary-foreground shadow-glow lg:col-span-2">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <div className="relative">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] opacity-80">
                <Sparkles className="h-3.5 w-3.5" /> Available balance
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <div className="text-5xl font-bold tabular-nums md:text-6xl">{balance.toLocaleString()}</div>
                <div className="text-sm opacity-80">points</div>
              </div>

              <div className="mt-7 rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Award className="h-3.5 w-3.5" /> {tier.current.name} tier
                  </span>
                  <span className="opacity-90">
                    {tier.next ? `${tier.toNext.toLocaleString()} pts to ${tier.next.name}` : "Top tier reached"}
                  </span>
                </div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/25">
                  <div className="h-full rounded-full bg-white transition-all duration-700" style={{ width: `${tier.progress}%` }} />
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2.5">
                <Link
                  to="/catalog"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white/95 px-4 py-2.5 text-sm font-semibold text-primary shadow-soft transition hover:bg-white"
                >
                  <Gift className="h-4 w-4" /> Claim a prize
                </Link>
                <Link
                  to="/products"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 px-4 py-2.5 text-sm font-medium transition hover:bg-white/15"
                >
                  <Package className="h-4 w-4" /> Earn points
                </Link>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <StatCard
              icon={TrendingUp}
              label="Lifetime points"
              value={lifetime.toLocaleString()}
              hint="Total earned to date"
            />
            <StatCard
              icon={Gift}
              label="Prizes in reach"
              value={String(affordable)}
              hint="Featured prizes you can afford"
              to="/catalog"
            />
            {ticketsEnabled ? (
              <StatCard
                icon={Ticket}
                label="Tickets"
                value={tickets.toLocaleString()}
                hint="1% of each invoice total, split across your pharmacy"
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    <Ticket className="h-3.5 w-3.5" /> Tickets
                  </div>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    Coming soon
                  </span>
                </div>
                <div className="mt-2 text-3xl font-bold tabular-nums text-muted-foreground">—</div>
                <p className="mt-1 text-xs text-muted-foreground">Earn entries for bigger prize draws.</p>
              </div>
            )}


          </div>
        </section>

        {/* Activity + prizes */}
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card shadow-soft">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
                <History className="h-4 w-4 text-primary" /> Recent activity
              </h2>
              <Link to="/history" className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                View all <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <ul className="divide-y divide-border">
              {(ledger ?? []).length === 0 && (
                <li className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No activity yet. Purchases will appear here once points are credited.
                </li>
              )}
              {ledger?.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{l.reason}</div>
                    <div className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleDateString()}</div>
                  </div>
                  <div
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
                      l.delta >= 0 ? "bg-success/12 text-success" : "bg-destructive/12 text-destructive"
                    }`}
                  >
                    {l.delta >= 0 ? "+" : ""}{l.delta}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-soft">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
                <Gift className="h-4 w-4 text-primary" /> Featured prizes
              </h2>
              <Link to="/catalog" className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                See all <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <ul className="divide-y divide-border">
              {(featured ?? []).length === 0 && (
                <li className="px-5 py-8 text-center text-sm text-muted-foreground">No prizes available right now.</li>
              )}
              {featured?.map((p) => {
                const can = balance >= p.point_cost;
                const pct = Math.min(100, (balance / Math.max(1, p.point_cost)) * 100);
                return (
                  <li key={p.id} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <Gift className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${can ? "bg-success" : "bg-primary/60"}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{p.point_cost.toLocaleString()} pts</div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        can ? "bg-success/12 text-success" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {can ? "Ready" : "Locked"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-border px-5 py-3.5">
              <Link to="/catalog" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                Browse full catalog <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  to,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  hint: string;
  to?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" /> {label}
      </div>
      <div className="mt-2 text-3xl font-bold tabular-nums">{value}</div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </>
  );
  return to ? (
    <Link to={to} className="block rounded-2xl border border-border bg-gradient-card p-5 shadow-soft transition hover:shadow-glow">
      {body}
    </Link>
  ) : (
    <div className="rounded-2xl border border-border bg-gradient-card p-5 shadow-soft">{body}</div>
  );
}
