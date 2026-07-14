import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ScrollText, Download, X } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { listAuditLog } from "@/lib/admin.functions";
import { useAuth } from "@/lib/auth-context";
import { toCSV, downloadCSV } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  validateSearch: z.object({
    target: z.string().optional(),
    targetType: z.string().optional(),
    targetLabel: z.string().optional(),
  }),
  component: AuditPage,
});

const ACTION_LABELS: Record<string, string> = {
  adjust_points: "Adjust points",
  grant_role: "Grant role",
  revoke_role: "Revoke role",
  pharmacy_points: "Pharmacy points",
  delete_user: "Delete user",
  bulk_import_points: "Bulk import",
  prize_create: "Prize created",
  prize_update: "Prize updated",
  prize_delete: "Prize deleted",
  sku_create: "SKU added",
  sku_update: "SKU updated",
  sku_delete: "SKU deleted",
  settings_update: "Settings updated",
  fulfillment_update: "Fulfillment updated",
  email_retry: "Email retried",
};

const ACTION_TONES: Record<string, string> = {
  adjust_points: "bg-primary/10 text-primary",
  grant_role: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  revoke_role: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  pharmacy_points: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  delete_user: "bg-destructive/10 text-destructive",
  bulk_import_points: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  prize_create: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  prize_update: "bg-primary/10 text-primary",
  prize_delete: "bg-destructive/10 text-destructive",
  sku_create: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  sku_update: "bg-primary/10 text-primary",
  sku_delete: "bg-destructive/10 text-destructive",
  settings_update: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  fulfillment_update: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  email_retry: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
};

function AuditPage() {
  const { user, loading } = useAuth();
  const fetchAudit = useServerFn(listAuditLog);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [action, setAction] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-audit", action, search.target, search.targetType],
    enabled: !!user && !loading,
    queryFn: () => fetchAudit({
      data: {
        action: action || undefined,
        targetId: search.target,
        targetType: search.targetType,
        limit: 300,
      },
    }),
    staleTime: 15_000,
  });

  const rows = (data as any)?.rows as any[] | undefined;
  const actions = useMemo(() => Array.from(new Set((rows ?? []).map((r: any) => r.action))).sort(), [rows]);

  const exportCsv = () => {
    if (!rows?.length) return;
    const csv = toCSV(
      rows.map((r: any) => ({
        created_at: r.created_at,
        actor: r.actor_email ?? r.actor_user_id,
        action: r.action,
        target_type: r.target_type,
        target_label: r.target_label,
        details: JSON.stringify(r.details ?? {}),
      })),
    );
    downloadCSV(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <AppShell admin>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-primary" /> Audit log
          </h1>
          <p className="text-sm text-muted-foreground">Every admin action, in one immutable feed.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">All actions</option>
            {actions.map((a: string) => (
              <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
            ))}
          </select>
          <button
            onClick={exportCsv}
            disabled={!rows?.length}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>

      {search.target && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
          <span>
            Filtered to{" "}
            <span className="font-semibold">
              {search.targetLabel ?? search.target.slice(0, 8)}
            </span>
            {search.targetType && (
              <span className="ml-1 text-xs uppercase tracking-widest text-muted-foreground">
                {search.targetType}
              </span>
            )}
          </span>
          <button
            onClick={() => navigate({ search: {} })}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <X className="h-3 w-3" /> Clear filter
          </button>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!isLoading && (rows ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No entries yet.</td></tr>
              )}
              {rows?.map((r: any) => (
                <tr key={r.id} className="border-t border-border/60 align-top">
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.actor_email ?? <span className="text-muted-foreground">{r.actor_user_id.slice(0, 8)}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_TONES[r.action] ?? "bg-muted text-foreground"}`}>
                      {ACTION_LABELS[r.action] ?? r.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.target_id ? (
                      <Link
                        to="/admin/audit"
                        search={{ target: r.target_id, targetType: r.target_type ?? undefined, targetLabel: r.target_label ?? undefined }}
                        className="hover:underline"
                      >
                        {r.target_label ?? r.target_id.slice(0, 8)}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {r.target_type && (
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{r.target_type}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                      {formatDetails(r.details)}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

function formatDetails(d: any): string {
  if (!d || typeof d !== "object") return "";
  return Object.entries(d)
    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
    .join(" · ");
}
