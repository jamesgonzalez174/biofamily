import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef } from "react";
import { Plus, Trash2, MapPin, Upload, Users, Coins, X } from "lucide-react";

import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { setPharmacyTotal } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/pharmacies")({
  component: PharmaciesPage,
});

function parseCSV(text: string): Array<{ name: string; address: string | null }> {
  const rows: Array<Array<string>> = [];
  let cur: Array<string> = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (field.length || cur.length) { cur.push(field); rows.push(cur); cur = []; field = ""; }
        if (c === "\r" && text[i + 1] === "\n") i++;
      } else field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf("name");
  const addrIdx = header.indexOf("address");
  const hasHeader = nameIdx !== -1;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  return dataRows
    .map((r) => ({
      name: (hasHeader ? r[nameIdx] : r[0])?.trim() || "",
      address: (hasHeader && addrIdx !== -1 ? r[addrIdx] : r[1])?.trim() || null,
    }))
    .filter((p) => p.name);
}

function PharmaciesPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const setTotal = useServerFn(setPharmacyTotal);
  const [adj, setAdj] = useState<{ id: string; name: string; current: number; members: number } | null>(null);
  const [newTotal, setNewTotal] = useState(0);
  const [reason, setReason] = useState("");

  const submitTotal = async () => {
    if (!adj || !reason.trim()) return;
    try {
      await setTotal({ data: { pharmacyId: adj.id, newTotal, reason } });
      toast.success("Pharmacy points redistributed");
      setAdj(null); setNewTotal(0); setReason("");
      qc.invalidateQueries({ queryKey: ["admin-pharmacies"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e: any) { toast.error(e.message); }
  };


  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const records = parseCSV(text);
      if (!records.length) { toast.error("No valid rows found"); return; }
      const { error } = await supabase.from("pharmacies").insert(records);
      if (error) throw error;
      toast.success(`Imported ${records.length} pharmac${records.length === 1 ? "y" : "ies"}`);
      qc.invalidateQueries({ queryKey: ["admin-pharmacies"] });
      qc.invalidateQueries({ queryKey: ["pharmacies-active"] });
    } catch (err: any) {
      toast.error(err.message || "Import failed");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const { data: items } = useQuery({
    queryKey: ["admin-pharmacies"],
    queryFn: async () => {
      const [pharmRes, profRes] = await Promise.all([
        supabase.from("pharmacies").select("*").order("name"),
        supabase.from("profiles").select("pharmacy_id, points_balance, lifetime_points"),
      ]);
      const totals = new Map();
      (profRes.data ?? []).forEach((p: any) => {
        if (!p.pharmacy_id) return;
        const t = totals.get(p.pharmacy_id) ?? { loyalty: 0, history: 0, members: 0 };
        t.loyalty += p.points_balance ?? 0;
        t.history += p.lifetime_points ?? 0;
        t.members += 1;
        totals.set(p.pharmacy_id, t);
      });
      return (pharmRes.data ?? []).map((ph: any) => ({
        ...ph,
        loyalty_points: totals.get(ph.id)?.loyalty ?? 0,
        history_points: totals.get(ph.id)?.history ?? 0,
        member_count: totals.get(ph.id)?.members ?? 0,
      }));
    },
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

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
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

        <div className="rounded-2xl border border-dashed border-border bg-card p-5 shadow-soft">
          <h2 className="font-semibold">Bulk import (CSV)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload a CSV with columns <code className="rounded bg-muted px-1">name</code> and optional <code className="rounded bg-muted px-1">address</code>. First row can be a header.
          </p>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-input bg-background px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
          >
            <Upload className="h-4 w-4" /> {importing ? "Importing…" : "Upload CSV"}
          </button>
        </div>

        <div className="space-y-2 lg:col-span-2">
          {(items ?? []).length > 0 && (
            <div className="hidden grid-cols-[minmax(0,1fr)_120px_120px_auto] items-center gap-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid">
              <div>Pharmacy</div>
              <div className="text-right">History</div>
              <div className="text-right">Loyalty</div>
              <div className="text-right">Actions</div>
            </div>
          )}
          {(items ?? []).length === 0 && <p className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">No pharmacies yet.</p>}
          {items?.map((p) => (
            <div key={p.id} className="rounded-xl border border-border bg-card p-4 shadow-soft">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_120px_120px_auto] md:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`grid h-9 w-9 place-items-center rounded-lg ${p.is_active ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.name}</div>
                    {p.address && <div className="truncate text-xs text-muted-foreground">{p.address}</div>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:contents">
                  <div className="rounded-lg bg-muted/50 px-3 py-2 md:rounded-none md:bg-transparent md:px-0 md:py-0 md:text-right">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground md:hidden">History</div>
                    <div className="text-sm font-semibold tabular-nums">{p.history_points.toLocaleString()}</div>
                  </div>
                  <div className="rounded-lg bg-muted/50 px-3 py-2 md:rounded-none md:bg-transparent md:px-0 md:py-0 md:text-right">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground md:hidden">Loyalty</div>
                    <div className="text-sm font-semibold tabular-nums">{p.loyalty_points.toLocaleString()}</div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Link
                    to="/admin/users"
                    search={{ pharmacy: p.id }}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                    title="Adjust loyalty points for members"
                  >
                    <Users className="h-3.5 w-3.5" /> Members
                  </Link>
                  <button onClick={() => toggle(p.id, p.is_active)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                    {p.is_active ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => remove(p.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
