import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Gift, Lock, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { redeemPrize } from "@/lib/redemption.functions";

export const Route = createFileRoute("/_authenticated/catalog")({
  component: Catalog,
});

function Catalog() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const redeem = useServerFn(redeemPrize);
  const [selected, setSelected] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: prizes, isLoading } = useQuery({
    queryKey: ["prizes"],
    queryFn: async () => {
      const { data } = await supabase.from("prizes").select("*").eq("is_active", true).order("point_cost");
      return data ?? [];
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("points_balance").eq("id", user!.id).single();
      return data;
    },
  });

  const balance = profile?.points_balance ?? 0;

  const confirm = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await redeem({ data: { prizeId: selected.id } });
      toast.success(`Redeemed ${selected.name}! ${selected.point_cost.toLocaleString()} points deducted.`);
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["prizes"] });
      qc.invalidateQueries({ queryKey: ["redemptions"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
      setSelected(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Redemption failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Prize catalog</h1>
          <p className="text-sm text-muted-foreground">Spend points on real rewards.</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-2 text-sm shadow-soft">
          <span className="text-muted-foreground">Balance: </span>
          <span className="font-semibold tabular-nums">{balance.toLocaleString()} pts</span>
        </div>
      </div>

      {isLoading ? (
        <p className="mt-12 text-center text-muted-foreground">Loading…</p>
      ) : (prizes ?? []).length === 0 ? (
        <p className="mt-12 text-center text-muted-foreground">No prizes available yet.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {prizes!.map((p) => {
            const afford = balance >= p.point_cost && p.stock > 0;
            return (
              <button
                key={p.id} onClick={() => setSelected(p)}
                className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-card text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-glow cursor-pointer"
              >
                <div className="relative aspect-[5/3] w-full bg-muted">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center">
                      <Gift className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                  {!afford && (
                    <div className="absolute right-2 top-2">
                      <div className="flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                        <Lock className="h-3 w-3" />
                        {p.stock <= 0 ? "Out of stock" : `${(p.point_cost - balance).toLocaleString()} more pts`}
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base font-semibold leading-tight">{p.name}</h2>
                    <div className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                      <Sparkles className="h-3 w-3" />{p.point_cost.toLocaleString()}
                    </div>
                  </div>
                  {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
                  <p className="mt-3 text-xs text-muted-foreground">{p.stock} in stock</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm" onClick={() => !busy && setSelected(null)}>
          <div className="my-8 w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-glow" onClick={(e) => e.stopPropagation()}>
            <div className="relative aspect-[16/9] w-full bg-muted">
              {selected.image_url ? (
                <img src={selected.image_url} alt={selected.name} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center"><Gift className="h-20 w-20 text-muted-foreground" /></div>
              )}
              <button onClick={() => !busy && setSelected(null)} aria-label="Close prize details" className="absolute right-3 top-3 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold">{selected.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{selected.stock} in stock</p>
                </div>
                <div className="flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">
                  <Sparkles className="h-4 w-4" />{selected.point_cost.toLocaleString()} pts
                </div>
              </div>
              {selected.description && <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{selected.description}</p>}
              <div className="mt-4 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                {balance < selected.point_cost
                  ? `You need ${(selected.point_cost - balance).toLocaleString()} more points to redeem this prize.`
                  : "Points are reserved now and deducted from your balance once the admin marks your reward as claimed."}
              </div>
              <div className="mt-6 flex gap-2">
                <button onClick={() => setSelected(null)} disabled={busy} className="flex-1 rounded-xl border border-border bg-background py-2.5 text-sm font-medium hover:bg-muted">Close</button>
                <button onClick={confirm} disabled={busy || balance < selected.point_cost || selected.stock <= 0} className="flex-1 rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-soft hover:opacity-95 disabled:opacity-60">
                  {busy ? "Redeeming…" : balance < selected.point_cost ? "Not enough points" : "Redeem"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
