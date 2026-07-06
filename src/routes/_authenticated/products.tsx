import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Search, Sparkles, ChevronRight, Package } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
});

function ProductsPage() {
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["products-points"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sku_points")
        .select("id, sku, name, points_per_unit, image_url")
        .eq("is_active", true)
        .gt("points_per_unit", 0)
        .order("points_per_unit", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data ?? [];
    return (data ?? []).filter(
      (r) =>
        r.sku.toLowerCase().includes(term) ||
        (r.name ?? "").toLowerCase().includes(term),
    );
  }, [data, q]);

  return (
    <AppShell>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Products with points</h1>
        <p className="text-sm text-muted-foreground">
          Every purchase of these products earns you loyalty points.
        </p>
      </div>

      <div className="relative mt-6 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by SKU or name"
          className="w-full rounded-xl border border-input bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 ring-ring"
        />
      </div>

      {isLoading ? (
        <div className="mt-6 rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-soft">
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-soft">
          {q ? "No products match your search." : "No products with points yet."}
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link
                to="/products/$sku"
                params={{ sku: r.sku }}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <div className="relative aspect-square w-full overflow-hidden bg-muted">
                  {r.image_url ? (
                    <img
                      src={r.image_url}
                      alt={r.name || r.sku}
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-muted-foreground">
                      <Package className="h-10 w-10" />
                    </div>
                  )}
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold text-primary shadow-sm backdrop-blur tabular-nums">
                    <Sparkles className="h-3 w-3" />
                    {r.points_per_unit.toLocaleString()} pts
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-1 p-4">
                  <div className="line-clamp-2 text-sm font-semibold leading-snug">
                    {r.name || "—"}
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <span className="truncate font-mono text-xs text-muted-foreground">{r.sku}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
