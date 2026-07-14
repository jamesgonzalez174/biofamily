import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, Download, CheckCircle2, XCircle, Clock, ShieldOff, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { listEmailLog, retryEmailFromDlq } from "@/lib/admin.functions";
import { useAuth } from "@/lib/auth-context";
import { toCSV, downloadCSV } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/admin/emails")({
  component: EmailsPage,
});

const RANGES = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

const STATUS_TONES: Record<string, { cls: string; icon: any }> = {
  sent: { cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", icon: CheckCircle2 },
  pending: { cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400", icon: Clock },
  dlq: { cls: "bg-destructive/10 text-destructive", icon: XCircle },
  failed: { cls: "bg-destructive/10 text-destructive", icon: XCircle },
  bounced: { cls: "bg-destructive/10 text-destructive", icon: XCircle },
  suppressed: { cls: "bg-muted text-muted-foreground", icon: ShieldOff },
};

function EmailsPage() {
  const { user, loading } = useAuth();
  const fetchLog = useServerFn(listEmailLog);
  const [days, setDays] = useState(7);
  const [template, setTemplate] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const qc = useQueryClient();
  const retry = useServerFn(retryEmailFromDlq);
  const [retrying, setRetrying] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-emails", days, template, status],
    enabled: !!user && !loading,
    queryFn: () => fetchLog({ data: { days, template: template || undefined, status: status || undefined, limit: 300 } }),
    staleTime: 15_000,
  });

  const rows = (data as any)?.rows as any[] | undefined;
  const stats = (data as any)?.stats;
  const templates = (data as any)?.templates as string[] | undefined;

  const doRetry = async (r: any) => {
    if (!r.message_id) return toast.error("No message id");
    setRetrying(r.message_id);
    try {
      const res = await retry({ data: { messageId: r.message_id, recipient: r.recipient_email, template: r.template_name } });
      if (res.ok) {
        toast.success("Re-queued — sending on next cycle");
        qc.invalidateQueries({ queryKey: ["admin-emails"] });
      } else {
        toast.warning(res.message ?? "Not found in DLQ");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Retry failed");
    } finally {
      setRetrying(null);
    }
  };

  const exportCsv = () => {
    if (!rows?.length) return;
    const csv = toCSV(rows.map((r: any) => ({
      created_at: r.created_at,
      template: r.template_name,
      recipient: r.recipient_email,
      status: r.status,
      error: r.error_message ?? "",
    })));
    downloadCSV(`emails-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const cards = [
    { label: "Total", value: stats?.total ?? 0, tone: "text-foreground" },
    { label: "Sent", value: stats?.sent ?? 0, tone: "text-emerald-600 dark:text-emerald-400" },
    { label: "Failed", value: stats?.failed ?? 0, tone: "text-destructive" },
    { label: "Suppressed", value: stats?.suppressed ?? 0, tone: "text-muted-foreground" },
    { label: "Pending", value: stats?.pending ?? 0, tone: "text-amber-600 dark:text-amber-400" },
  ];

  return (
    <AppShell admin>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" /> Email log
          </h1>
          <p className="text-sm text-muted-foreground">Delivery status and errors, deduplicated per message.</p>
        </div>
        <button
          onClick={exportCsv}
          disabled={!rows?.length}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-border bg-background p-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${days === r.days ? "bg-gradient-primary text-primary-foreground shadow-glow" : "text-foreground/70 hover:bg-muted"}`}
            >{r.label}</button>
          ))}
        </div>
        <select value={template} onChange={(e) => setTemplate(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
          <option value="">All templates</option>
          {templates?.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
          <option value="">All statuses</option>
          <option value="sent">Sent</option>
          <option value="dlq">Failed (DLQ)</option>
          <option value="suppressed">Suppressed</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-gradient-card p-4 shadow-soft">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">{c.label}</div>
            <div className={`mt-1 text-2xl font-bold tabular-nums ${c.tone}`}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Template</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!isLoading && (rows ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No emails in this range.</td></tr>
              )}
              {rows?.map((r: any) => {
                const tone = STATUS_TONES[r.status] ?? STATUS_TONES.pending;
                const Icon = tone.icon;
                return (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs">{r.template_name}</td>
                    <td className="px-4 py-3 text-xs">{r.recipient_email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone.cls}`}>
                        <Icon className="h-3 w-3" /> {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-destructive max-w-xs truncate" title={r.error_message ?? ""}>
                      {r.error_message ?? ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
