import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { updateRedemptionStatus } from "@/lib/redemption.functions";
import { toCSV, downloadCSV } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/admin/fulfillment")({
  component: Fulfillment,
});

const STATUSES = ["pending", "shipped", "claimed", "cancelled"] as const;

function Fulfillment() {
  const qc = useQueryClient();
  const updateStatus = useServerFn(updateRedemptionStatus);
  const [filter, setFilter] = useState<string>("pending");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const { data: items } = useQuery({
    queryKey: ["admin-fulfillment", filter, fromDate, toDate],
    queryFn: async () => {
      let q = supabase.from("redemptions").select("*").order("created_at", { ascending: false });
      if (filter !== "all") q = q.eq("status", filter as any);
      if (fromDate) q = q.gte("created_at", new Date(fromDate).toISOString());
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        q = q.lte("created_at", end.toISOString());
      }
      const { data } = await q;
      return data ?? [];
    },
  });

  const update = async (id: string, patch: { status?: string; tracking_info?: string }) => {
    try {
      const current = items?.find((r) => r.id === id);
      await updateStatus({
        data: {
          redemptionId: id,
          status: (patch.status ?? current?.status ?? "pending") as any,
          tracking_info: patch.tracking_info,
        },
      });
      toast.success(patch.status === "claimed" ? "Marked claimed — points deducted" : "Updated");
      qc.invalidateQueries({ queryKey: ["admin-fulfillment"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    }
  };

  const exportCSV = async () => {
    const { data: all } = await supabase.from("redemptions").select("*").order("created_at", { ascending: false });
    const userIds = Array.from(new Set((all ?? []).map((r) => r.user_id)));
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const rows = (all ?? []).map((r) => {
      const p = pmap.get(r.user_id);
      return {
        created_at: r.created_at,
        customer_name: p?.full_name ?? "",
        customer_email: p?.email ?? "",
        prize_name: r.prize_name,
        points_spent: r.points_spent,
        status: r.status,
        tracking_info: r.tracking_info ?? "",
        notes: r.notes ?? "",
        redemption_id: r.id,
        user_id: r.user_id,
      };
    });
    downloadCSV(`fulfillment-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows));
  };

  return (
    <AppShell admin>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Fulfillment</h1>
          <p className="text-sm text-muted-foreground">Points are deducted only when status is set to <strong>claimed</strong>.</p>
        </div>
        <button onClick={exportCSV} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium shadow-soft hover:bg-muted">
          <Download className="h-4 w-4" /> Download CSV
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-3">

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
