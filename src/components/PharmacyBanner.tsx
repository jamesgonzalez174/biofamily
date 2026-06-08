import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MapPin, Check, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export function PharmacyBanner() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).single();
      return data;
    },
  });

  const { data: pharmacies } = useQuery({
    queryKey: ["pharmacies-active"],
    queryFn: async () => {
      const { data } = await supabase.from("pharmacies").select("id, name, address").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const current = pharmacies?.find((p) => p.id === profile?.pharmacy_id);

  const save = async () => {
    if (!user || !selected) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ pharmacy_id: selected }).eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Pharmacy updated");
    setPicking(false);
    setSelected("");
    qc.invalidateQueries({ queryKey: ["profile"] });
  };

  if (!profile) return null;

  // No pharmacy yet — prompt prominently
  if (!profile.pharmacy_id) {
    return (
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 to-primary-glow/10 p-5 shadow-soft">
        <div className="flex flex-wrap items-start gap-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
            <MapPin className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="font-semibold">Select your pharmacy</div>
            <p className="text-sm text-muted-foreground">Pick the pharmacy you belong to so we can track your points correctly.</p>
            <div className="mt-3 flex flex-col gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search pharmacies by name or address…"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  size={Math.min(6, Math.max(3, (pharmacies?.filter((p) => {
                    const q = search.trim().toLowerCase();
                    if (!q) return true;
                    return p.name.toLowerCase().includes(q) || (p.address ?? "").toLowerCase().includes(q);
                  }).length ?? 0) + 1))}
                  className="min-w-[220px] flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  {pharmacies
                    ?.filter((p) => {
                      const q = search.trim().toLowerCase();
                      if (!q) return true;
                      return p.name.toLowerCase().includes(q) || (p.address ?? "").toLowerCase().includes(q);
                    })
                    .map((p) => (
                      <option key={p.id} value={p.id}>{p.name}{p.address ? ` — ${p.address}` : ""}</option>
                    ))}
                  {pharmacies && pharmacies.filter((p) => {
                    const q = search.trim().toLowerCase();
                    if (!q) return true;
                    return p.name.toLowerCase().includes(q) || (p.address ?? "").toLowerCase().includes(q);
                  }).length === 0 && (
                    <option value="" disabled>No matches</option>
                  )}
                </select>
                <button
                  onClick={save}
                  disabled={!selected || saving}
                  className="rounded-lg bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:opacity-95 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Has pharmacy — compact chip with change action
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-sm shadow-soft">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-accent-foreground">
          <MapPin className="h-3.5 w-3.5" />
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Your pharmacy</span>
          <div className="font-medium leading-tight">{current?.name ?? "Unknown"}</div>
        </div>
      </div>
      <span className="text-xs text-muted-foreground">Contact an admin to change</span>
    </div>
  );
}
