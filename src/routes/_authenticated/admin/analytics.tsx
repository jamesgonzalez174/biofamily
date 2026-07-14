import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { BarChart3, Trophy, Gift, Building2, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getAdminAnalytics } from "@/lib/admin.functions";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  component: AnalyticsPage,
});

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
];

function AnalyticsPage() {
  const { user, loading } = useAuth();
  const fetchAnalytics = useServerFn(getAdminAnalytics);
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-analytics", days],
    enabled: !!user && !loading,
    queryFn: () => fetchAnalytics({ data: { days } }),
    staleTime: 60_000,
  });

  const a = data as any;

  const kpis = [
    { label: "Points issued", value: (a?.pointsIssued ?? 0).toLocaleString(), icon: TrendingUp },
    { label: "Points spent", value: (a?.pointsSpent ?? 0).toLocaleString(), icon: Gift },
    { label: "Redemption rate", value: `${a?.redemptionRate ?? 0}%`, icon: BarChart3 },
    { label: "Active earners", value: (a?.activeEarners ?? 0).toLocaleString(), icon: Trophy },
  ];

  return (
    <AppShell admin>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" /> Analytics
          </h1>
          <p className="text-sm text-muted-foreground">Loyalty program performance over the selected window.</p>
        </div>
        <div className="inline-flex rounded-xl border border-border bg-background p-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${days === r.days ? "bg-gradient-primary text-primary-foreground shadow-glow" : "text-foreground/70 hover:bg-muted"}`}
            >{r.label}</button>
          ))}
        </div>
      </div>

      {isLoading && <div className="mt-8 text-sm text-muted-foreground">Loading…</div>}

      {a && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((c) => (
              <div key={c.label} className="rounded-2xl border border-border bg-gradient-card p-5 shadow-soft">
                <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                  <c.icon className="h-3.5 w-3.5" /> {c.label}
                </div>
                <div className="mt-2 text-3xl font-bold tabular-nums">{c.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <Panel title="Top earners" icon={Trophy} empty="No points issued in this window.">
              {a.topEarners.map((u: any, i: number) => (
                <Row
                  key={u.userId}
                  rank={i + 1}
                  name={u.name}
                  value={`+${u.earned.toLocaleString()}`}
                  max={a.topEarners[0]?.earned ?? 1}
                  current={u.earned}
                />
              ))}
            </Panel>

            <Panel title="Top prizes" icon={Gift} empty="No redemptions in this window.">
              {a.topPrizes.map((p: any, i: number) => (
                <Row
                  key={p.name + i}
                  rank={i + 1}
                  name={p.name}
                  value={`${p.count}× · ${p.points.toLocaleString()} pts`}
                  max={a.topPrizes[0]?.count ?? 1}
                  current={p.count}
                />
              ))}
            </Panel>

            <Panel title="Pharmacy leaderboard" icon={Building2} empty="No pharmacies with members yet.">
              {a.pharmacyLeaderboard.map((p: any, i: number) => (
                <Row
                  key={p.name + i}
                  rank={i + 1}
                  name={p.name}
                  value={`${p.lifetime.toLocaleString()} lifetime · ${p.members} member${p.members === 1 ? "" : "s"}`}
                  max={a.pharmacyLeaderboard[0]?.lifetime ?? 1}
                  current={p.lifetime}
                />
              ))}
            </Panel>

            <Panel title="Redemption status" icon={BarChart3} empty="No redemptions in this window.">
              {Object.entries(a.statusCounts as Record<string, number>).map(([status, count]) => {
                const max = Math.max(...Object.values(a.statusCounts as Record<string, number>), 1);
                return (
                  <Row
                    key={status}
                    rank={0}
                    name={status}
                    value={String(count)}
                    max={max}
                    current={count}
                  />
                );
              })}
            </Panel>
          </div>
        </>
      )}
    </AppShell>
  );
}

function Panel({ title, icon: Icon, empty, children }: { title: string; icon: any; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">{title}</h2>
      </div>
      {hasChildren ? <div className="space-y-2">{children}</div> : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function Row({ rank, name, value, max, current }: { rank: number; name: string; value: string; max: number; current: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 truncate">
          {rank > 0 && <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-bold tabular-nums text-muted-foreground">{rank}</span>}
          <span className="truncate capitalize">{name}</span>
        </span>
        <span className="ml-2 shrink-0 tabular-nums text-xs text-muted-foreground">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-gradient-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
