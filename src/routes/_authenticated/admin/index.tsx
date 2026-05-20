import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, Gift, Sparkles, Package } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminHome,
});

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

  const cards = [
    { label: "Active users", value: stats?.users ?? 0, icon: Users },
    { label: "Active prizes", value: stats?.prizes ?? 0, icon: Gift },
    { label: "Total redemptions", value: stats?.redemptions ?? 0, icon: Package },
    { label: "Points issued", value: (stats?.pointsIssued ?? 0).toLocaleString(), icon: Sparkles },
  ];

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
