import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await supabase.from("settings").select("*").eq("id", 1).single()).data,
  });

  const [rate, setRate] = useState<number>(1);
  const [fallback, setFallback] = useState<boolean>(true);

  useEffect(() => {
    if (settings) { setRate(Number(settings.points_per_dollar)); setFallback(settings.enable_invoice_total_fallback); }
  }, [settings]);

  const save = async () => {
    const { error } = await supabase.from("settings").update({ points_per_dollar: rate, enable_invoice_total_fallback: fallback }).eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["settings"] });
  };

  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/public/zoho-webhook` : "";

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
      </div>
    </AppShell>
  );
}
