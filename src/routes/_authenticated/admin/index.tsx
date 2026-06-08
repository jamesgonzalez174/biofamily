import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, Gift, Sparkles, Package, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminHome,
});

function formatRelative(iso: string | null) {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function AdminHome() {
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [users, prizes, redemptions, ledger] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("prizes").select("*", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("redemptions").select("*", { count: "exact", head: true }),
        supabase.from("points_ledger").select("delta"),
      ]);
      const issued = (ledger.data ?? []).filter((l) => l.delta > 0).reduce((a, b) => a + b.delta, 0);
      const spent = (ledger.data ?? []).filter((l) => l.delta < 0).reduce((a, b) => a + Math.abs(b.delta), 0);
      return {
        users: users.count ?? 0,
        prizes: prizes.count ?? 0,
        redemptions: redemptions.count ?? 0,
        pointsIssued: issued,
        pointsSpent: spent,
      };
    },
  });

  const { data: recent } = useQuery({
    queryKey: ["admin-recent-redemptions"],
    queryFn: async () => {
      const { data } = await supabase.from("redemptions").select("*").order("created_at", { ascending: false }).limit(8);
      return data ?? [];
    },
  });

  const { data: syncHealth } = useQuery({
    queryKey: ["admin-zoho-sync-health"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [lastOkRes, lastRunRes, recentRes, settingsRes] = await Promise.all([
        supabase.from("zoho_sync_runs").select("*").eq("ok", true).order("started_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("zoho_sync_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("zoho_sync_runs").select("ok").order("started_at", { ascending: false }).limit(10),
        supabase.from("settings").select("sync_timezone, sync_hour, sync_minute").eq("id", 1).maybeSingle(),
      ]);
      const recent = recentRes.data ?? [];
      const failures = recent.filter((r) => r.ok === false).length;
      return {
        lastOk: lastOkRes.data,
        lastRun: lastRunRes.data,
        recentCount: recent.length,
        recentFailures: failures,
        schedule: settingsRes.data,
      };
    },
  });

  const cards = [
    { label: "Active users", value: stats?.users ?? 0, icon: Users },
    { label: "Active prizes", value: stats?.prizes ?? 0, icon: Gift },
    { label: "Total redemptions", value: stats?.redemptions ?? 0, icon: Package },
    { label: "Points issued", value: (stats?.pointsIssued ?? 0).toLocaleString(), icon: Sparkles },
  ];

  const lastRun = syncHealth?.lastRun;
  const lastOk = syncHealth?.lastOk;
  const hoursSinceOk = lastOk ? (Date.now() - new Date(lastOk.started_at).getTime()) / 3_600_000 : Infinity;
  let healthLabel: string;
  let healthTone: "ok" | "warn" | "bad";
  let HealthIcon = CheckCircle2;
  if (!lastRun) {
    healthLabel = "No syncs yet"; healthTone = "warn"; HealthIcon = AlertTriangle;
  } else if (!lastOk || hoursSinceOk > 36) {
    healthLabel = "Stale — last success >36h ago"; healthTone = "bad"; HealthIcon = XCircle;
  } else if ((syncHealth?.recentFailures ?? 0) >= 3) {
    healthLabel = `Degraded — ${syncHealth?.recentFailures} of last ${syncHealth?.recentCount} failed`; healthTone = "warn"; HealthIcon = AlertTriangle;
  } else if (lastRun.ok === false) {
    healthLabel = "Last run failed"; healthTone = "warn"; HealthIcon = AlertTriangle;
  } else {
    healthLabel = "Healthy"; healthTone = "ok"; HealthIcon = CheckCircle2;
  }
  const toneClass = healthTone === "ok"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : healthTone === "warn"
    ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
    : "border-destructive/30 bg-destructive/10 text-destructive";

  return (
    <AppShell admin>
      <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
      <p className="text-sm text-muted-foreground">Loyalty program at a glance.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-gradient-card p-5 shadow-soft">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <c.icon className="h-3.5 w-3.5" />{c.label}
            </div>
            <div className="mt-2 text-3xl font-bold tabular-nums">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">Zoho Books sync</h2>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}>
            <HealthIcon className="h-3.5 w-3.5" /> {healthLabel}
          </span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Last successful sync</div>
            <div className="mt-1 text-lg font-semibold">{formatRelative(lastOk?.started_at ?? null)}</div>
            <div className="text-xs text-muted-foreground">
              {lastOk ? new Date(lastOk.started_at).toLocaleString() : "—"}
            </div>
            {lastOk && (
              <div className="mt-2 text-xs text-muted-foreground tabular-nums">
                {lastOk.fetched} fetched · {lastOk.upserted} upserted · {lastOk.notified_count} notified
              </div>
            )}
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Last run</div>
            <div className="mt-1 flex items-center gap-2 text-lg font-semibold">
              {lastRun ? (lastRun.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-destructive" />) : <Clock className="h-4 w-4 text-muted-foreground" />}
              {formatRelative(lastRun?.started_at ?? null)}
            </div>
            <div className="text-xs text-muted-foreground capitalize">
              {lastRun ? `${lastRun.source} · ${lastRun.ok ? "ok" : "failed"}` : "—"}
            </div>
            {lastRun && Array.isArray(lastRun.errors) && lastRun.errors.length > 0 && (
              <div className="mt-2 truncate text-xs text-destructive" title={String((lastRun.errors as any[])[0])}>
                {String((lastRun.errors as any[])[0])}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Recent reliability</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {syncHealth ? `${syncHealth.recentCount - syncHealth.recentFailures}/${syncHealth.recentCount} ok` : "—"}
            </div>
            <div className="text-xs text-muted-foreground">last {syncHealth?.recentCount ?? 0} runs</div>
            {syncHealth?.schedule && (
              <div className="mt-1 text-xs text-muted-foreground">
                Next run: {String(syncHealth.schedule.sync_hour).padStart(2, "0")}:{String(syncHealth.schedule.sync_minute).padStart(2, "0")} {syncHealth.schedule.sync_timezone}
              </div>
            )}
            <Link to="/admin/zoho-connect" className="mt-2 inline-block text-xs text-primary hover:underline">Manage connection →</Link>
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Recent redemptions</h2>
          <Link to="/admin/fulfillment" className="text-xs text-primary hover:underline">Manage fulfillment</Link>
        </div>
        <div className="mt-4 space-y-2">
          {(recent ?? []).length === 0 && <p className="text-sm text-muted-foreground">No redemptions yet.</p>}
          {recent?.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-border bg-background p-3 text-sm">
              <div>
                <div className="font-medium">{r.prize_name}</div>
                <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs">{r.status}</span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
