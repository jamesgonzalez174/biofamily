import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Gift, Package, Truck, CheckCircle2, XCircle, Clock } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/history")({
  component: History,
});

const STATUS_META: Record<string, { label: string; icon: any; cls: string }> = {
  pending:   { label: "Pending",   icon: Clock,        cls: "bg-warning/15 text-warning-foreground border-warning/30" },
  shipped:   { label: "Shipped",   icon: Truck,        cls: "bg-primary/15 text-primary border-primary/30" },
  claimed:   { label: "Claimed",   icon: CheckCircle2, cls: "bg-success/15 text-success border-success/30" },
  cancelled: { label: "Cancelled", icon: XCircle,      cls: "bg-destructive/15 text-destructive border-destructive/30" },
};

function History() {
  const { user } = useAuth();
  const { data: redemptions } = useQuery({
    queryKey: ["redemptions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("redemptions").select("*").eq("user_id", user!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const { data: ledger } = useQuery({
    queryKey: ["ledger-full", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("points_ledger").select("*").eq("user_id", user!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <AppShell>
      <h1 className="text-3xl font-semibold tracking-tight">Activity</h1>
      <p className="text-sm text-muted-foreground">Your redemptions and point history.</p>

      <section className="mt-8">
        <h2 className="font-semibold">Redemptions</h2>
        <div className="mt-3 space-y-2">
          {(redemptions ?? []).length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              <Package className="mx-auto mb-2 h-6 w-6" /> No redemptions yet.
            </div>
          )}
          {redemptions?.map((r) => {
            const meta = STATUS_META[r.status] ?? STATUS_META.pending;
            const Icon = meta.icon;
            return (
              <div key={r.id} className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-soft">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-accent-foreground"><Gift className="h-5 w-5" /></div>
                <div className="flex-1">
                  <div className="font-medium">{r.prize_name}</div>
                  <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()} · {r.points_spent.toLocaleString()} pts</div>
                  {r.tracking_info && <div className="mt-1 text-xs text-primary">Tracking: {r.tracking_info}</div>}
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}>
                  <Icon className="h-3.5 w-3.5" />{meta.label}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-semibold">Point history</h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
          {(ledger ?? []).length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No transactions.</p>}
          {ledger?.map((l, i) => (
            <div key={l.id} className={`flex items-center justify-between p-4 ${i > 0 ? "border-t border-border" : ""}`}>
              <div>
                <div className="text-sm font-medium">{l.reason}</div>
                <div className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()} · {l.source}</div>
              </div>
              <div className={`font-semibold tabular-nums ${l.delta >= 0 ? "text-success" : "text-destructive"}`}>
                {l.delta >= 0 ? "+" : ""}{l.delta.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
