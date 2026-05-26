import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, Trash2, Image as ImageIcon, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { syncZohoCustomers, diagnoseZohoBooks } from "@/lib/zoho.functions";



export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const [origin, setOrigin] = useState("");
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await supabase.from("settings").select("*").eq("id", 1).single()).data,
  });

  const [rate, setRate] = useState<number>(1);
  const [fallback, setFallback] = useState<boolean>(true);
  const [expireAt, setExpireAt] = useState<string>("");

  useEffect(() => {
    if (settings) {
      setRate(Number(settings.points_per_dollar));
      setFallback(settings.enable_invoice_total_fallback);
      setExpireAt((settings as any).points_expire_at ? new Date((settings as any).points_expire_at).toISOString().slice(0, 10) : "");
    }
  }, [settings]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const save = async () => {
    const { error } = await supabase.from("settings").update({
      points_per_dollar: rate,
      enable_invoice_total_fallback: fallback,
      points_expire_at: expireAt ? new Date(expireAt).toISOString() : null,
    } as any).eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["settings"] });
  };

  const webhookPath = "/api/public/zoho-webhook";
  const webhookUrl = origin ? `${origin}${webhookPath}` : webhookPath;

  return (
    <AppShell admin>
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h2 className="font-semibold">Points calculation</h2>
          <p className="mt-1 text-sm text-muted-foreground">Per-SKU mapping always wins. The fallback rate applies when an invoice item has no SKU mapping (and only if enabled).</p>
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Points per $1 (fallback)</span>
              <input type="number" step="0.01" value={rate} onChange={(e) => setRate(Number(e.target.value))} className="w-40 rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={fallback} onChange={(e) => setFallback(e.target.checked)} /> Use invoice-total fallback when no SKU matches
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Points expiration date</span>
              <div className="flex items-center gap-2">
                <input type="date" value={expireAt} onChange={(e) => setExpireAt(e.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
                {expireAt && (
                  <button type="button" onClick={() => setExpireAt("")} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
                )}
              </div>
              <span className="mt-1 block text-xs text-muted-foreground">All accumulated points expire on this date. Leave empty for no expiration.</span>
            </label>
            <button onClick={save} className="mt-2 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-95">Save</button>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h2 className="font-semibold">Zoho webhook</h2>
          <p className="mt-1 text-sm text-muted-foreground">Configure this URL in Zoho Books (Invoice → Sent, or Payment → Received).</p>
          <div className="mt-3 break-all rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs">{webhookUrl}</div>
          <p className="mt-3 text-xs text-muted-foreground">
            Optional: add <code className="rounded bg-muted px-1">ZOHO_WEBHOOK_SECRET</code> in backend secrets, then send it in header <code className="rounded bg-muted px-1">x-zoho-webhook-secret</code>. If unset, the endpoint accepts all calls (use only for testing).
          </p>
        </section>


        <section className="lg:col-span-2">
          <SyncCustomers />
        </section>






        <section className="lg:col-span-2">
          <StatusManager />
        </section>
      </div>
    </AppShell>
  );
}

function StatusManager() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: statuses } = useQuery({
    queryKey: ["admin-statuses"],
    queryFn: async () => {
      const { data } = await supabase
        .from("statuses")
        .select("*")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const onFile = (f: File | null) => {
    setPendingFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const publish = async () => {
    if (!pendingFile || !user) return;
    setBusy(true);
    try {
      const ext = pendingFile.name.split(".").pop() || "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const up = await supabase.storage.from("statuses").upload(path, pendingFile, {
        contentType: pendingFile.type,
        upsert: false,
      });
      if (up.error) throw up.error;
      const { data: pub } = supabase.storage.from("statuses").getPublicUrl(path);
      const { error } = await supabase.from("statuses").insert({
        image_url: pub.publicUrl,
        caption: caption.trim() || null,
        created_by: user.id,
      });
      if (error) throw error;
      toast.success("Status posted — visible for 24 hours");
      setCaption("");
      setPendingFile(null);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["admin-statuses"] });
      qc.invalidateQueries({ queryKey: ["statuses-active"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("statuses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["admin-statuses"] });
    qc.invalidateQueries({ queryKey: ["statuses-active"] });
  };

  const isActive = (s: any) => new Date(s.expires_at).getTime() > Date.now();

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Status updates</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Post WhatsApp-style stories. Auto-expires after 24 hours. Visible to all signed-in users on their dashboard.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[260px_1fr]">
        {/* uploader */}
        <div>
          <label className="group relative grid aspect-[9/16] cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-gradient-to-br from-muted/40 to-muted/10 transition hover:border-primary">
            {preview ? (
              <img src={preview} alt="preview" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow">
                  <Upload className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-medium">Tap to upload</p>
                <p className="text-xs text-muted-foreground">JPG, PNG · 9:16 looks best</p>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>

          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Add a caption (optional)"
            rows={2}
            className="mt-3 w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />

          <button
            onClick={publish}
            disabled={!pendingFile || busy}
            className="mt-3 w-full rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-soft hover:opacity-95 disabled:opacity-50"
          >
            {busy ? "Posting…" : "Post status"}
          </button>
        </div>

        {/* list */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Recent</h3>
          {(statuses ?? []).length === 0 ? (
            <div className="mt-3 grid place-items-center rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              <ImageIcon className="mb-2 h-6 w-6 opacity-50" />
              No statuses yet.
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {statuses!.map((s: any) => {
                const active = isActive(s);
                return (
                  <div key={s.id} className="group relative aspect-[9/16] overflow-hidden rounded-xl border border-border bg-muted">
                    <img src={s.image_url} alt="" className={`h-full w-full object-cover ${active ? "" : "opacity-40 grayscale"}`} />
                    <div className="absolute inset-x-0 top-0 flex items-center justify-between p-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${active ? "bg-success/90 text-success-foreground" : "bg-black/60 text-white"}`}>
                        {active ? "Live" : "Expired"}
                      </span>
                      <button
                        onClick={() => remove(s.id)}
                        className="rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100 hover:bg-destructive"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {s.caption && (
                      <div className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/80 to-transparent p-2 text-[11px] text-white">
                        {s.caption}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}




function SyncCustomers() {
  const sync = useServerFn(syncZohoCustomers);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const res = await sync({});
      if (!res.ok) {
        toast.error(res.errors[0] ?? "Sync failed");
      } else if (res.errors.length) {
        toast.warning(`Synced ${res.upserted} (with ${res.errors.length} errors)`);
      } else {
        toast.success(`Synced ${res.upserted} customers from Zoho`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Sync customers from Zoho</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pulls contacts from Zoho Books using your stored refresh token and stores them in the customers table.
          </p>
        </div>
        <button
          onClick={run}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:opacity-95 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Syncing…" : "Sync customers"}
        </button>
      </div>
    </div>
  );
}


function ZohoDiagnostic() {
  const diagnose = useServerFn(diagnoseZohoBooks);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await diagnose({});
      setResult(res);
      if (!res.tokenOk) {
        toast.error(`Token error: ${res.tokenError}`);
      } else if (res.booksStatus >= 200 && res.booksStatus < 300) {
        toast.success(`Books API OK (${res.booksStatus})`);
      } else {
        toast.warning(`Books API ${res.booksStatus} — check scopes/org id`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Diagnostic failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">Zoho Books diagnostic</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Calls <code className="rounded bg-muted px-1">/books/v3/organizations</code> with your refresh token to verify the token has Books scopes and the org id is valid. If you get <code className="rounded bg-muted px-1">INVALID_TOKEN</code> or <code className="rounded bg-muted px-1">OAUTH_SCOPE_MISMATCH</code>, regenerate the refresh token with Books scopes (e.g. <code className="rounded bg-muted px-1">ZohoBooks.contacts.READ,ZohoBooks.settings.READ</code>).
          </p>
        </div>
        <button
          onClick={run}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Checking…" : "Run diagnostic"}
        </button>
      </div>

      {result && (
        <pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs">
{JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
