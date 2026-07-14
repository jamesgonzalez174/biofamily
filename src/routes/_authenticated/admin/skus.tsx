import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Search, Sparkles, ImagePlus, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { logAdminAction } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/skus")({
  component: SkusPage,
});

async function uploadProductImage(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `products/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("prize-images")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from("prize-images").getPublicUrl(path);
  return data.publicUrl;
}

function SkusPage() {
  const qc = useQueryClient();
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [points, setPoints] = useState<number>(0);
  const [active, setActive] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: items } = useQuery({
    queryKey: ["admin-skus"],
    queryFn: async () => (await supabase.from("sku_points").select("*").order("sku")).data ?? [],
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items ?? [];
    return (items ?? []).filter(
      (s) => s.sku.toLowerCase().includes(term) || (s.name ?? "").toLowerCase().includes(term),
    );
  }, [items, q]);

  const handleNewImage = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadProductImage(file);
      setImageUrl(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const add = async () => {
    const trimmedSku = sku.trim();
    if (!trimmedSku) return toast.error("SKU is required");
    if (trimmedSku.length > 120) return toast.error("SKU is too long");
    if (!Number.isFinite(points) || points < 0) return toast.error("Points must be 0 or greater");
    setSaving(true);
    const { error } = await supabase.from("sku_points").insert({
      sku: trimmedSku,
      name: name.trim() || null,
      points_per_unit: Math.floor(points),
      is_active: active,
      image_url: imageUrl,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Product added");
    setSku(""); setName(""); setPoints(0); setActive(true); setImageUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    qc.invalidateQueries({ queryKey: ["admin-skus"] });
    qc.invalidateQueries({ queryKey: ["products-points"] });
  };

  const updateField = async (
    id: string,
    patch: Partial<{ name: string | null; points_per_unit: number; is_active: boolean; image_url: string | null }>,
  ) => {
    const { error } = await supabase.from("sku_points").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-skus"] });
    qc.invalidateQueries({ queryKey: ["products-points"] });
  };

  const uploadRowImage = async (id: string, file: File) => {
    try {
      const url = await uploadProductImage(file);
      await updateField(id, { image_url: url });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const remove = async (id: string, label: string) => {
    if (!confirm(`Remove ${label}? This stops it from earning points.`)) return;
    const { error } = await supabase.from("sku_points").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["admin-skus"] });
    qc.invalidateQueries({ queryKey: ["products-points"] });
  };

  return (
    <AppShell admin>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Products with points</h1>
        <p className="text-sm text-muted-foreground">
          Add every Zoho SKU that should earn loyalty points and set how many points customers get per unit.
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft">
        <h2 className="text-sm font-semibold">Add a product</h2>
        <div className="mt-3 flex gap-4">
          <div className="shrink-0">
            <label className="relative grid h-24 w-24 cursor-pointer place-items-center overflow-hidden rounded-xl border border-dashed border-input bg-muted/40 text-muted-foreground hover:border-primary hover:text-primary">
              {imageUrl ? (
                <>
                  <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setImageUrl(null); }}
                    className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 text-foreground shadow"
                    aria-label="Remove image"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-1 text-xs">
                  <ImagePlus className="h-5 w-5" />
                  {uploading ? "…" : "Photo"}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleNewImage(f);
                }}
              />
            </label>
          </div>
          <div className="grid flex-1 gap-2 sm:grid-cols-[1fr,1fr,160px,auto]">
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="SKU code (from Zoho)"
              maxLength={120}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 ring-ring"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Display name (optional)"
              maxLength={200}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 ring-ring"
            />
            <input
              type="number"
              min={0}
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
              placeholder="Points / unit"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 ring-ring"
            />
            <button
              onClick={add}
              disabled={saving || uploading}
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:opacity-95 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" /> {saving ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
        <label className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Visible to users right away
        </label>
      </div>

      <div className="relative mt-6 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products"
          className="w-full rounded-xl border border-input bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 ring-ring"
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-3">Image</th>
              <th className="p-3">SKU</th>
              <th className="p-3">Name</th>
              <th className="p-3">Points / unit</th>
              <th className="p-3">Active</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="p-3">
                  <label className="relative grid h-14 w-14 cursor-pointer place-items-center overflow-hidden rounded-lg border border-input bg-muted/40 text-muted-foreground hover:border-primary">
                    {s.image_url ? (
                      <img src={s.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImagePlus className="h-4 w-4" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadRowImage(s.id, f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {s.image_url && (
                    <button
                      onClick={() => updateField(s.id, { image_url: null })}
                      className="mt-1 text-[10px] text-muted-foreground hover:text-destructive"
                    >
                      Remove
                    </button>
                  )}
                </td>
                <td className="p-3 font-mono text-xs">{s.sku}</td>
                <td className="p-3">
                  <input
                    defaultValue={s.name ?? ""}
                    placeholder="—"
                    maxLength={200}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if ((s.name ?? "") !== v) updateField(s.id, { name: v || null });
                    }}
                    className="w-full rounded border border-input bg-background px-2 py-1"
                  />
                </td>
                <td className="p-3">
                  <div className="inline-flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <input
                      type="number"
                      min={0}
                      defaultValue={s.points_per_unit}
                      onBlur={(e) => {
                        const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                        if (v !== s.points_per_unit) updateField(s.id, { points_per_unit: v });
                      }}
                      className="w-24 rounded border border-input bg-background px-2 py-1 tabular-nums"
                    />
                  </div>
                </td>
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={s.is_active}
                    onChange={(e) => updateField(s.id, { is_active: e.target.checked })}
                  />
                </td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => remove(s.id, s.name || s.sku)}
                    className="rounded p-1.5 text-destructive hover:bg-muted"
                    aria-label="Remove product"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">
                  {q ? "No products match your search." : "No products yet. Add one above."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
