import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Pencil, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { logAdminAction } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/prizes")({
  component: AdminPrizes,
});

type Prize = { id?: string; name: string; description: string; image_url: string; point_cost: number; stock: number; is_active: boolean };
const empty: Prize = { name: "", description: "", image_url: "", point_cost: 100, stock: 1, is_active: true };

function AdminPrizes() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Prize | null>(null);
  const [uploading, setUploading] = useState(false);
  const log = useServerFn(logAdminAction);

  const { data: prizes } = useQuery({
    queryKey: ["admin-prizes"],
    queryFn: async () => {
      const { data } = await supabase.from("prizes").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const save = async () => {
    if (!editing) return;
    const isCreate = !editing.id;
    const payload = { ...editing, point_cost: Number(editing.point_cost), stock: Number(editing.stock) };
    const { data: saved, error } = editing.id
      ? await supabase.from("prizes").update(payload).eq("id", editing.id).select().maybeSingle()
      : await supabase.from("prizes").insert(payload).select().maybeSingle();
    if (error) return toast.error(error.message);
    toast.success("Saved");
    try {
      await log({ data: {
        action: isCreate ? "prize_create" : "prize_update",
        targetType: "prize",
        targetId: (saved?.id as string) ?? editing.id,
        targetLabel: editing.name,
        details: { point_cost: payload.point_cost, stock: payload.stock, is_active: payload.is_active },
      } });
    } catch {}
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["admin-prizes"] });
    qc.invalidateQueries({ queryKey: ["prizes"] });
  };

  const remove = async (id: string) => {
    const target = (prizes ?? []).find((p: any) => p.id === id);
    if (!confirm("Delete this prize?")) return;
    const { error } = await supabase.from("prizes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    try {
      await log({ data: { action: "prize_delete", targetType: "prize", targetId: id, targetLabel: (target as any)?.name } });
    } catch {}
    qc.invalidateQueries({ queryKey: ["admin-prizes"] });
  };

  const upload = async (file: File) => {
    if (!editing) return;
    setUploading(true);
    const path = `${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("prize-images").upload(path, file, { upsert: false });
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data: { publicUrl } } = supabase.storage.from("prize-images").getPublicUrl(path);
    setEditing({ ...editing, image_url: publicUrl });
    setUploading(false);
  };

  return (
    <AppShell admin>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Prizes</h1>
          <p className="text-sm text-muted-foreground">Manage the catalog.</p>
        </div>
        <button onClick={() => setEditing(empty)} className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:opacity-95">
          <Plus className="h-4 w-4" /> New prize
        </button>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-3">Prize</th>
              <th className="p-3">Cost</th>
              <th className="p-3">Stock</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(prizes ?? []).map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 overflow-hidden rounded-lg bg-muted">
                      {p.image_url && <img src={p.image_url} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">{p.description}</div>
                    </div>
                  </div>
                </td>
                <td className="p-3 tabular-nums">{p.point_cost.toLocaleString()}</td>
                <td className="p-3 tabular-nums">{p.stock}</td>
                <td className="p-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${p.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                    {p.is_active ? "Active" : "Hidden"}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <button onClick={() => setEditing(p as Prize)} className="rounded-lg p-2 hover:bg-muted"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => remove(p.id!)} className="rounded-lg p-2 text-destructive hover:bg-muted"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
            {(prizes ?? []).length === 0 && <tr><td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">No prizes yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-glow" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{editing.id ? "Edit prize" : "New prize"}</h2>
              <button onClick={() => setEditing(null)} className="rounded-lg p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 space-y-3">
              <Field label="Name" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} />
              <Field label="Description" value={editing.description ?? ""} onChange={(v) => setEditing({ ...editing, description: v })} textarea />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Point cost" type="number" value={String(editing.point_cost)} onChange={(v) => setEditing({ ...editing, point_cost: Number(v) })} />
                <Field label="Stock" type="number" value={String(editing.stock)} onChange={(v) => setEditing({ ...editing, stock: Number(v) })} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Image</label>
                <div className="flex items-center gap-3">
                  {editing.image_url && <img src={editing.image_url} alt="" className="h-16 w-16 rounded-lg object-cover" />}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted">
                    <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                  </label>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} /> Active in catalog
              </label>
            </div>
            <div className="mt-6 flex gap-2">
              <button onClick={() => setEditing(null)} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
              <button onClick={save} className="flex-1 rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-95">Save</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Field({ label, value, onChange, type = "text", textarea }: { label: string; value: string; onChange: (v: string) => void; type?: string; textarea?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 ring-ring" />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 ring-ring" />
      )}
    </label>
  );
}
