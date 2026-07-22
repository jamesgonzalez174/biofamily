import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { InvoiceDetailsDrawer } from "@/components/InvoiceDetailsDrawer";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";


export const Route = createFileRoute("/_authenticated/pharmacies")({
  head: () => ({
    meta: [
      { title: "My Pharmacies | Biomed Family" },
      { name: "description", content: "Pharmacies you have access to view." },
    ],
  }),
  component: MyPharmaciesPage,
});

function MyPharmaciesPage() {
  const { user } = useAuth();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["my-pharmacies", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Include both explicit admin-granted access and the user's own selected pharmacy.
      const [accessRes, profileRes] = await Promise.all([
        supabase.from("user_pharmacy_access").select("pharmacy_id").eq("user_id", user!.id),
        supabase.from("profiles").select("pharmacy_id").eq("id", user!.id).maybeSingle(),
      ]);
      if (accessRes.error) throw accessRes.error;
      if (profileRes.error) throw profileRes.error;
      const ids = [
        ...new Set(
          [
            ...((accessRes.data ?? []).map((r: any) => r.pharmacy_id)),
            (profileRes.data as any)?.pharmacy_id,
          ].filter(Boolean),
        ),
      ];
      if (ids.length === 0) return { pharmacies: [] as any[] };
      const { data: pharms, error: pErr } = await supabase
        .from("pharmacies")
        .select("id, name, address, loyalty_points, history_points, is_active, invoice_references")
        .in("id", ids)
        .order("name");
      if (pErr) throw pErr;
      return { pharmacies: pharms ?? [] };
    },
    staleTime: 30_000,
  });

  const pharmacies = (data as any)?.pharmacies as any[] | undefined;

  return (
    <AppShell>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">My Pharmacies</h1>
        <p className="text-sm text-muted-foreground">
          Pharmacies you have access to view. Contact an admin to request more.
        </p>
      </div>

      {isLoading && (
        <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading…</div>
      )}
      {isError && (
        <div className="mt-8 rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          Failed to load: {(error as Error)?.message}
        </div>
      )}
      {!isLoading && !isError && (pharmacies ?? []).length === 0 && (
        <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          You don't have access to any pharmacies yet.
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(pharmacies ?? []).map((p: any) => (
          <div key={p.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-primary shadow-glow">
                <MapPin className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="truncate font-semibold">{p.name}</div>
                </div>
                {p.address && <div className="text-xs text-muted-foreground line-clamp-2">{p.address}</div>}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-border/60 bg-muted/40 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Loyalty</div>
                <div className="mt-1 flex items-center gap-1 font-semibold tabular-nums">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  {(p.loyalty_points ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/40 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Lifetime</div>
                <div className="mt-1 font-semibold tabular-nums">{(p.history_points ?? 0).toLocaleString()}</div>
              </div>
            </div>
            {Array.isArray(p.invoice_references) && p.invoice_references.length > 0 && (
              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Invoice references ({p.invoice_references.length})
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {p.invoice_references.slice(0, 8).map((ref: string) => (
                    <span
                      key={ref}
                      className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-foreground/80"
                    >
                      {ref}
                    </span>
                  ))}
                  {p.invoice_references.length > 8 && (
                    <span className="rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      +{p.invoice_references.length - 8} more
                    </span>
                  )}
                </div>
              </div>
            )}
            {Array.isArray(p.invoice_references) && p.invoice_references.length > 0 && (

              <div className="mt-3">
                <InvoiceDetailsDrawer
                  pharmacyId={p.id}
                  pharmacyName={p.name}
                  references={p.invoice_references}
                />
              </div>
            )}


          </div>
        ))}
      </div>
    </AppShell>
  );
}
