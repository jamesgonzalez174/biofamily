import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Shield, ShieldOff, Plus, Minus, X, Download, Trash2 } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { listUsers, adjustPoints, setUserRole, deleteUser } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { toCSV, downloadCSV } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/admin/users")({
  validateSearch: z.object({ pharmacy: z.string().uuid().optional() }),
  component: UsersPage,
});

function UsersPage() {
  const qc = useQueryClient();
  const { pharmacy } = Route.useSearch();
  const navigate = Route.useNavigate();
  const fetchUsers = useServerFn(listUsers);
  const adjust = useServerFn(adjustPoints);
  const setRole = useServerFn(setUserRole);
  const [adj, setAdj] = useState<{ id: string; name: string } | null>(null);
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState("");

  const { data: allUsers } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers({}),
  });

  const { data: pharmacies } = useQuery({
    queryKey: ["pharmacies-all"],
    queryFn: async () => {
      const { data } = await supabase.from("pharmacies").select("id, name").order("name");
      return data ?? [];
    },
  });

  const users = useMemo(
    () => (pharmacy ? (allUsers ?? []).filter((u: any) => u.pharmacy_id === pharmacy) : allUsers),
    [allUsers, pharmacy],
  );
  const currentPharmacy = pharmacies?.find((p) => p.id === pharmacy);


  const toggleAdmin = async (id: string, isAdmin: boolean) => {
    await setRole({ data: { targetUserId: id, role: "admin", grant: !isAdmin } });
    toast.success(isAdmin ? "Admin revoked" : "Admin granted");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const changePharmacy = async (userId: string, pharmacyId: string) => {
    const { error } = await supabase.from("profiles").update({ pharmacy_id: pharmacyId || null }).eq("id", userId);
    if (error) return toast.error(error.message);
    toast.success("Pharmacy updated");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const submitAdjust = async () => {
    if (!adj || delta === 0 || !reason.trim()) return;
    try {
      await adjust({ data: { targetUserId: adj.id, delta, reason } });
      toast.success("Points adjusted");
      setAdj(null); setDelta(0); setReason("");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e: any) { toast.error(e.message); }
  };

  const exportCSV = () => {
    const pmap = new Map((pharmacies ?? []).map((p) => [p.id, p.name]));
    const rows = (users ?? []).map((u: any) => ({
      full_name: u.full_name ?? "",
      email: u.email,
      pharmacy: u.pharmacy_id ? pmap.get(u.pharmacy_id) ?? "" : "",
      tier: u.tier,
      points_balance: u.points_balance,
      lifetime_points: u.lifetime_points,
      roles: (u.roles ?? []).join("|"),
      created_at: u.created_at,
    }));
    downloadCSV(`users-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows));
  };

  return (
    <AppShell admin>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">Adjust loyalty balances and manage admin access.</p>
        </div>
        <button onClick={exportCSV} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium shadow-soft hover:bg-muted">
          <Download className="h-4 w-4" /> Download CSV
        </button>
      </div>


      {currentPharmacy && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
          <span>Filtered to <span className="font-semibold">{currentPharmacy.name}</span> — {users?.length ?? 0} member{users?.length === 1 ? "" : "s"}</span>
          <button onClick={() => navigate({ search: {} })} className="text-xs font-medium text-primary hover:underline">Clear filter</button>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">


        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="p-3">User</th><th className="p-3">Pharmacy</th><th className="p-3">Tier</th><th className="p-3">Balance</th><th className="p-3">Lifetime</th><th className="p-3">Role</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {(users ?? []).map((u: any) => {
              const isAdmin = u.roles.includes("admin");
              return (
                <tr key={u.id} className="border-t border-border">
                  <td className="p-3">
                    <div className="font-medium">{u.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </td>
                  <td className="p-3">
                    <select
                      value={u.pharmacy_id ?? ""}
                      onChange={(e) => changePharmacy(u.id, e.target.value)}
                      className="rounded-lg border border-input bg-background px-2 py-1 text-xs max-w-[160px]"
                    >
                      <option value="">— None —</option>
                      {(pharmacies ?? []).map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3">{u.tier}</td>
                  <td className="p-3 tabular-nums">{u.points_balance.toLocaleString()}</td>
                  <td className="p-3 tabular-nums">{u.lifetime_points.toLocaleString()}</td>
                  <td className="p-3">{isAdmin ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">Admin</span> : <span className="text-xs text-muted-foreground">User</span>}</td>
                  <td className="p-3 text-right">
                    <button onClick={() => setAdj({ id: u.id, name: u.full_name || u.email })} className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted">Adjust</button>
                    <button onClick={() => toggleAdmin(u.id, isAdmin)} className="ml-1 rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted">
                      {isAdmin ? <ShieldOff className="inline h-3.5 w-3.5" /> : <Shield className="inline h-3.5 w-3.5" />}
                    </button>
                  </td>
                </tr>
              );
            })}
            {(users ?? []).length === 0 && <tr><td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">No users.</td></tr>}
          </tbody>
        </table>
      </div>

      {adj && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setAdj(null)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-glow" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Adjust points</h2>
              <button onClick={() => setAdj(null)} className="rounded-lg p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">For: {adj.name}</p>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setDelta((d) => d - 100)} className="rounded-lg border border-border p-2 hover:bg-muted"><Minus className="h-4 w-4" /></button>
                <input type="number" value={delta} onChange={(e) => setDelta(Number(e.target.value))} className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-center text-lg font-semibold tabular-nums" />
                <button onClick={() => setDelta((d) => d + 100)} className="rounded-lg border border-border p-2 hover:bg-muted"><Plus className="h-4 w-4" /></button>
              </div>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div className="mt-6 flex gap-2">
              <button onClick={() => setAdj(null)} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
              <button onClick={submitAdjust} className="flex-1 rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-95">Apply</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
