import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/sales-reps")({
  head: () => ({ meta: [{ title: "Sales reps — Biomed Family admin" }] }),
  component: SalesRepsPage,
});

const SOURCE_LABELS: Record<string, string> = {
  email: "Email", sales_rep: "Sales rep", social_media: "Social media",
  friend: "Friend or colleague", pharmacy: "At my pharmacy", other: "Other",
};

function SalesRepsPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["admin-sales-reps"],
    queryFn: async () => {
      const [reps, profiles] = await Promise.all([
        supabase.from("sales_reps").select("id, name, is_active, created_at").order("name"),
        supabase.from("profiles").select("referral_source, sales_rep_id"),
      ]);
      const repCounts: Record<string, number> = {};
      const sourceCounts: Record<string, number> = {};
      for (const p of profiles.data ?? []) {
        if (p.sales_rep_id) repCounts[p.sales_rep_id] = (repCounts[p.sales_rep_id] ?? 0) + 1;
        const k = p.referral_source ?? "unknown";
        sourceCounts[k] = (sourceCounts[k] ?? 0) + 1;
      }
      return { reps: reps.data ?? [], repCounts, sourceCounts };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-sales-reps"] });

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setSaving(true);
    const { error } = await supabase.from("sales_reps").insert({ name: n });
    setSaving(false);
    if (error) return toast.error(error.message);
    setName(""); toast.success("Sales rep added"); refresh();
  };
  const toggle = async (id: string, is_active: boolean) => {
    const { error } = await supabase.from("sales_reps").update({ is_active }).eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };
  const remove = async (id: string) => {
    if (!confirm("Remove this sales rep? Members who picked them will keep their account but lose the link.")) return;
    const { error } = await supabase.from("sales_reps").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  return (
    <AppShell admin>
      <h1 className="text-2xl font-semibold tracking-tight">Sales reps</h1>
      <p className="mt-1 text-sm text-muted-foreground">Active reps appear in the sign-up form when a member picks "Sales rep".</p>

      <form onSubmit={add} className="mt-6 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sales rep full name"
          className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2" />
        <button disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
          <Plus className="h-4 w-4" /> Add
        </button>
      </form>

      <div className="mt-6 overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Sign-ups</th><th className="px-4 py-2">Shown at sign-up</th><th /></tr>
          </thead>
          <tbody>
            {(data?.reps ?? []).map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-2 font-medium">{r.name}</td>
                <td className="px-4 py-2">{data?.repCounts[r.id] ?? 0}</td>
                <td className="px-4 py-2">
                  <input type="checkbox" checked={r.is_active} onChange={(e) => toggle(r.id, e.target.checked)} aria-label={`Show ${r.name} at sign-up`} />
                </td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => remove(r.id)} aria-label={`Remove ${r.name}`} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
            {data && data.reps.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No sales reps yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-lg font-semibold">How members found the app</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {Object.entries(data?.sourceCounts ?? {}).map(([k, v]) => (
          <div key={k} className="rounded-xl border border-border p-4">
            <div className="text-xs text-muted-foreground">{SOURCE_LABELS[k] ?? "Not answered"}</div>
            <div className="text-2xl font-semibold">{v}</div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
