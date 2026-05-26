import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef, useMemo } from "react";
import { Plus, Trash2, MapPin, Upload, Users, Coins, X, RefreshCw, Search, ChevronLeft, ChevronRight } from "lucide-react";

import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { setPharmacyTotal } from "@/lib/admin.functions";
import { syncZohoCustomers } from "@/lib/zoho.functions";

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
  const syncZoho = useServerFn(syncZohoCustomers);
  const [syncing, setSyncing] = useState(false);
  const [adj, setAdj] = useState<{ id: string; name: string; current: number; members: number } | null>(null);
  const [newTotal, setNewTotal] = useState(0);
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const runSync = async () => {
    setSyncing(true);
    try {
      const r = await syncZoho();
      if (r.ok) {
        toast.success(`Synced ${r.fetched} contacts from Zoho`);
      } else {
        toast.error(`Sync issues: ${r.errors.slice(0, 2).join("; ")}`);
      }
      qc.invalidateQueries({ queryKey: ["admin-pharmacies"] });
      qc.invalidateQueries({ queryKey: ["pharmacies-active"] });
    } catch (e: any) {
      toast.error(e.message ?? "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

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

  const { data: result, isFetching } = useQuery({
    queryKey: ["admin-pharmacies", search, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_pharmacies", {
        _search: search || undefined,
        _limit: PAGE_SIZE,
        _offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      const rows = (data ?? []).map((r: any) => ({
        id: r.id as string,
        name: r.name as string,
        address: (r.address ?? null) as string | null,
        is_active: r.is_active as boolean,
        zoho_contact_id: r.zoho_contact_id as string | null,
        loyalty_points: (r.loyalty_points || r.member_loyalty || 0) as number,
        history_points: (r.history_points || r.member_history || 0) as number,
        member_count: (r.member_count ?? 0) as number,
      }));
      const total = Number(data?.[0]?.total_count ?? 0);
      return { rows, total };
    },
    placeholderData: (prev) => prev,
  });

  const items = result?.rows;
  const total = result?.total ?? 0;
  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

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

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={runSync}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 rounded-xl border border-input bg-background px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Syncing…" : "Sync all from Zoho"}
        </button>
      </div>

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
          <form
            onSubmit={(e) => { e.preventDefault(); setPage(0); setSearch(searchInput.trim()); }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name or address…"
                className="w-full rounded-xl border border-input bg-background py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <button type="submit" className="rounded-xl border border-input bg-background px-4 py-2 text-sm font-semibold hover:bg-muted">Search</button>
            {search && (
              <button type="button" onClick={() => { setSearch(""); setSearchInput(""); setPage(0); }} className="rounded-xl border border-input bg-background px-3 py-2 text-sm hover:bg-muted">Clear</button>
            )}
          </form>
          <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
            <span>{total.toLocaleString()} pharmac{total === 1 ? "y" : "ies"}{isFetching ? " · loading…" : ""}</span>
            <span>Page {page + 1} of {pageCount}</span>
          </div>
          {(items ?? []).length > 0 && (
            <div className="hidden grid-cols-[minmax(0,1fr)_120px_120px_280px] items-center gap-4 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid">
              <div>Pharmacy</div>
              <div className="text-right">History</div>
              <div className="text-right">Loyalty</div>
              <div className="text-right">Actions</div>
            </div>
          )}
          {(items ?? []).length === 0 && <p className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">No pharmacies yet.</p>}
          {items?.map((p) => (
            <div key={p.id} className="rounded-xl border border-border bg-card p-4 shadow-soft">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_120px_120px_280px] md:items-center">
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
                  <button
                    onClick={() => { setAdj({ id: p.id, name: p.name, current: p.loyalty_points, members: p.member_count }); setNewTotal(p.loyalty_points); }}
                    disabled={p.member_count === 0}
                    title={p.member_count === 0 ? "No members assigned" : "Set pharmacy total — splits evenly across members"}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    <Coins className="h-3.5 w-3.5" /> Points
                  </button>
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

      {adj && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setAdj(null)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-glow" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Set pharmacy total</h2>
              <button onClick={() => setAdj(null)} className="rounded-lg p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{adj.name} — {adj.members} member{adj.members === 1 ? "" : "s"} · current {adj.current.toLocaleString()}</p>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">New total points</span>
                <input type="number" min={0} value={newTotal} onChange={(e) => setNewTotal(Math.max(0, Number(e.target.value)))} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-center text-lg font-semibold tabular-nums" />
              </label>
              <p className="text-xs text-muted-foreground">
                Splits evenly: ~{Math.floor(newTotal / Math.max(1, adj.members)).toLocaleString()} per member
                {newTotal % adj.members !== 0 && ` (+1 to first ${newTotal % adj.members})`}
              </p>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div className="mt-6 flex gap-2">
              <button onClick={() => setAdj(null)} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
              <button onClick={submitTotal} className="flex-1 rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-95">Apply</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
