import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/skus")({
  component: SkusPage,
});

function SkusPage() {
  const qc = useQueryClient();
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [points, setPoints] = useState(0);

  const { data: items } = useQuery({
    queryKey: ["admin-skus"],
    queryFn: async () => (await supabase.from("sku_points").select("*").order("sku")).data ?? [],
  });

  const add = async () => {
    if (!sku.trim()) return toast.error("SKU required");
    const { error } = await supabase.from("sku_points").insert({ sku: sku.trim(), name: name || null, points_per_unit: points });
    if (error) return toast.error(error.message);
    toast.success("SKU added");
    setSku(""); setName(""); setPoints(0);
    qc.invalidateQueries({ queryKey: ["admin-skus"] });
  };

  const updateField = async (id: string, patch: any) => {
    await supabase.from("sku_points").update(patch).eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-skus"] });
  };

  const remove = async (id: string) => {
    await supabase.from("sku_points").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-skus"] });
  };

  return (
    <AppShell admin>
      <h1 className="text-3xl font-semibold tracking-tight">SKU → Points mapping</h1>
      <p className="text-sm text-muted-foreground">Define how many points each Zoho product SKU is worth per unit purchased.</p>

      <div className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="grid gap-2 sm:grid-cols-[1fr,1fr,140px,auto]">
          <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU code" className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name (optional)" className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          <input type="number" value={points} onChange={(e) => setPoints(Number(e.target.value))} placeholder="Points/unit" className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          <button onClick={add} className="inline-flex items-center gap-1 rounded-lg bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-95"><Plus className="h-4 w-4" />Add</button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="p-3">SKU</th><th className="p-3">Name</th><th className="p-3">Points / unit</th><th className="p-3">Active</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {(items ?? []).map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="p-3 font-mono text-xs">{s.sku}</td>
                <td className="p-3">{s.name || "—"}</td>
                <td className="p-3">
                  <input type="number" defaultValue={s.points_per_unit} onBlur={(e) => updateField(s.id, { points_per_unit: Number(e.target.value) })} className="w-24 rounded border border-input bg-background px-2 py-1" />
                </td>
                <td className="p-3"><input type="checkbox" checked={s.is_active} onChange={(e) => updateField(s.id, { is_active: e.target.checked })} /></td>
                <td className="p-3 text-right"><button onClick={() => remove(s.id)} className="rounded p-1.5 text-destructive hover:bg-muted"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
            {(items ?? []).length === 0 && <tr><td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">No SKUs mapped yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
