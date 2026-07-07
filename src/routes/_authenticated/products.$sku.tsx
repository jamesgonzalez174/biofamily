import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Sparkles, Package, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/products/$sku")({
  component: ProductDetail,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm">
        {error.message}
      </div>
    </AppShell>
  ),
});

function NotFoundView({ sku }: { sku: string }) {
  return (
    <AppShell>
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <h1 className="text-2xl font-semibold">Product not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          No active product matches SKU <span className="font-mono">{sku}</span>.
        </p>
        <Link to="/products" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-95">
          <ArrowLeft className="h-4 w-4" /> Back to products
        </Link>
      </div>
    </AppShell>
  );
}

function ProductDetail() {
  const { sku } = Route.useParams();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ["product-detail", sku],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sku_points")
        .select("id, sku, name, points_per_unit, is_active, image_url, updated_at")
        .eq("sku", sku)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <AppShell>
        <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }
  if (!data || !data.is_active) return <NotFoundView sku={sku} />;

  const pts = data.points_per_unit;

  return (
    <AppShell>
      <button
        onClick={() => router.history.back()}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        {data.image_url && (
          <div className="flex aspect-square w-full items-center justify-center overflow-hidden bg-gradient-to-br from-muted/60 to-muted p-6 sm:aspect-[4/3]">
            <img
              src={data.image_url}
              alt={data.name || data.sku}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        )}
        <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-primary-glow/10 p-8">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-primary shadow-glow">
              <Package className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {data.name || data.sku}
              </h1>
              <p className="mt-1 font-mono text-xs text-muted-foreground">SKU {data.sku}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-baseline gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 text-sm font-semibold text-primary tabular-nums">
              <Sparkles className="h-4 w-4" />
              {pts.toLocaleString()} points / unit
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> Earning active
            </span>
          </div>
        </div>

        <dl className="divide-y divide-border">
          <Row label="Product name" value={data.name || "—"} />
          <Row label="SKU" value={<span className="font-mono">{data.sku}</span>} />
          <Row label="Points per unit" value={<span className="tabular-nums">{pts.toLocaleString()}</span>} />
          <Row label="Points per 10 units" value={<span className="tabular-nums">{(pts * 10).toLocaleString()}</span>} />
          <Row label="Points per 100 units" value={<span className="tabular-nums">{(pts * 100).toLocaleString()}</span>} />
        </dl>
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-soft">
        Points for this product post to your balance automatically after a purchase syncs from Zoho.
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}
