import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Search, Sparkles } from "lucide-react";
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
        .select("id, sku, name, points_per_unit")
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

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        {isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {q ? "No products match your search." : "No products with points yet."}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden w-full text-sm sm:table">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3">Product</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3 text-right">Points / unit</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-3 font-medium">{r.name || "—"}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{r.sku}</td>
                    <td className="p-3 text-right">
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary tabular-nums">
                        <Sparkles className="h-3 w-3" />
                        {r.points_per_unit.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <ul className="divide-y divide-border sm:hidden">
              {filtered.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.name || "—"}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">{r.sku}</div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary tabular-nums">
                    <Sparkles className="h-3 w-3" />
                    {r.points_per_unit.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </AppShell>
  );
}
