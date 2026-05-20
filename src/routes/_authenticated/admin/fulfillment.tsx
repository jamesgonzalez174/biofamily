import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/fulfillment")({
  component: Fulfillment,
});

const STATUSES = ["pending", "shipped", "claimed", "cancelled"] as const;

function Fulfillment() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("pending");

  const { data: items } = useQuery({
    queryKey: ["admin-fulfillment", filter],
    queryFn: async () => {
      let q = supabase.from("redemptions").select("*").order("created_at", { ascending: false });
      if (filter !== "all") q = q.eq("status", filter as any);
      const { data } = await q;
      return data ?? [];
    },
  });

  const update = async (id: string, patch: any) => {
    const { error } = await supabase.from("redemptions").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["admin-fulfillment"] });
  };

  return (
    <AppShell admin>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Fulfillment</h1>
          <p className="text-sm text-muted-foreground">Update statuses and add tracking info.</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1 shadow-soft">
          {(["all", ...STATUSES] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize ${filter === s ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>{s}</button>
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {(items ?? []).length === 0 && <p className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">Nothing here.</p>}
        {items?.map((r) => (
          <div key={r.id} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{r.prize_name}</div>
                <div className="text-xs text-muted-foreground">User: {r.user_id.slice(0, 8)}… · {r.points_spent} pts · {new Date(r.created_at).toLocaleString()}</div>
              </div>
              <select value={r.status} onChange={(e) => update(r.id, { status: e.target.value })} className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="mt-3 flex gap-2">
              <input
                defaultValue={r.tracking_info ?? ""}
                placeholder="Tracking info / notes…"
                onBlur={(e) => e.target.value !== (r.tracking_info ?? "") && update(r.id, { tracking_info: e.target.value })}
                className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
              />
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
