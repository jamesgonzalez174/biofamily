import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
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
  const { user, profile } = useAuth();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["my-pharmacies", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: access, error: accessErr } = await supabase
        .from("user_pharmacy_access")
        .select("pharmacy_id")
        .eq("user_id", user!.id);
      if (accessErr) throw accessErr;
      const ids = new Set<string>((access ?? []).map((r: any) => r.pharmacy_id));
      if (profile?.pharmacy_id) ids.add(profile.pharmacy_id);
      if (ids.size === 0) return [];
      const { data: pharms, error: pErr } = await supabase
        .from("pharmacies")
        .select("id, name, address, loyalty_points, history_points, is_active")
        .in("id", [...ids])
        .order("name");
      if (pErr) throw pErr;
      return pharms ?? [];
    },
    staleTime: 30_000,
  });

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
      {!isLoading && !isError && (data ?? []).length === 0 && (
        <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          You don't have access to any pharmacies yet.
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(data ?? []).map((p: any) => (
          <div key={p.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-primary shadow-glow">
                <MapPin className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <div className="truncate font-semibold">{p.name}</div>
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
          </div>
        ))}
      </div>
    </AppShell>
  );
}
