import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/pharmacies")({
  component: PharmaciesPage,
});

function PharmaciesPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: items } = useQuery({
    queryKey: ["admin-pharmacies"],
    queryFn: async () => (await supabase.from("pharmacies").select("*").order("name")).data ?? [],
  });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("pharmacies").insert({ name: name.trim(), address: address.trim() || null });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Pharmacy added");
    setName(""); setAddress("");
    qc.invalidateQueries({ queryKey: ["admin-pharmacies"] });
    qc.invalidateQueries({ queryKey: ["pharmacies-active"] });
  };

  const toggle = async (id: string, is_active: boolean) => {
    await supabase.from("pharmacies").update({ is_active: !is_active }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-pharmacies"] });
    qc.invalidateQueries({ queryKey: ["pharmacies-active"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("pharmacies").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["admin-pharmacies"] });
    qc.invalidateQueries({ queryKey: ["pharmacies-active"] });
  };

  return (
    <AppShell admin>
      <h1 className="text-3xl font-semibold tracking-tight">Pharmacies</h1>
      <p className="text-sm text-muted-foreground">Manage the list of pharmacies users can belong to.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
        <form onSubmit={create} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h2 className="font-semibold">Add pharmacy</h2>
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Address (optional)</span>
              <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </label>
            <button disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-95 disabled:opacity-50">
              <Plus className="h-4 w-4" /> {busy ? "Adding…" : "Add"}
            </button>
          </div>
        </form>

        <div className="space-y-2">
          {(items ?? []).length === 0 && <p className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">No pharmacies yet.</p>}
          {items?.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-soft">
              <div className="flex items-center gap-3">
                <div className={`grid h-9 w-9 place-items-center rounded-lg ${p.is_active ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-medium">{p.name}</div>
                  {p.address && <div className="text-xs text-muted-foreground">{p.address}</div>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggle(p.id, p.is_active)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                  {p.is_active ? "Disable" : "Enable"}
                </button>
                <button onClick={() => remove(p.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
