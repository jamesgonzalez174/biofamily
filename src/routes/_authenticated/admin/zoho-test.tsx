import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { testZohoConnection } from "@/lib/zoho.functions";

export const Route = createFileRoute("/_authenticated/admin/zoho-test")({
  component: ZohoTestPage,
});

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-right break-all">{value}</span>
    </div>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        ok ? "bg-emerald-500/15 text-emerald-600" : "bg-destructive/15 text-destructive"
      }`}
    >
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

function ZohoTestPage() {
  const testFn = useServerFn(testZohoConnection);
  const mutation = useMutation({ mutationFn: () => testFn() });
  const r = mutation.data;

  return (
    <AppShell admin>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Test Zoho Connection</h1>
          <p className="text-sm text-muted-foreground">
            Validates the stored refresh token against every Zoho data center and verifies the organization ID.
          </p>
        </div>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft disabled:opacity-50"
        >
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Run test
        </button>
      </div>

      {mutation.isError && (
        <div className="mt-6 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <span>{(mutation.error as Error).message}</span>
        </div>
      )}

      {r && (
        <div className="mt-6 space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge ok={r.ok} label={r.ok ? "Connection OK" : "Connection failed"} />
              {r.matchedDc && (
                <StatusBadge
                  ok={r.dcMatchesConfig === true}
                  label={
                    r.dcMatchesConfig
                      ? `Region match (${r.matchedDc})`
                      : `Region mismatch — configured ${r.configuredDc}, token works on ${r.matchedDc}`
                  }
                />
              )}
              {r.orgIdPresent && r.orgIdMatches !== null && (
                <StatusBadge
                  ok={r.orgIdMatches}
                  label={r.orgIdMatches ? "Org ID match" : "Org ID mismatch"}
                />
              )}
            </div>

            {r.missing.length > 0 && (
              <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                Missing secrets: {r.missing.join(", ")}
              </div>
            )}

            <div className="mt-4">
              <Row label="Configured ZOHO_DC" value={r.configuredDc} />
              <Row label="Matched DC" value={r.matchedDc ?? "—"} />
              <Row label="Client ID prefix" value={r.clientIdPrefix ?? "—"} />
              <Row label="Client secret length" value={r.clientSecretLength} />
              <Row label="Refresh token prefix" value={r.refreshTokenPrefix ?? "—"} />
              <Row label="Refresh token length" value={r.refreshTokenLength} />
              <Row label="Organization ID" value={r.orgIdConfigured ?? "—"} />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <h2 className="font-semibold">Per-region attempts</h2>
            <p className="text-xs text-muted-foreground">
              Refresh tokens are bound to the DC that issued them. Exactly one row should succeed.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-3">DC</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">HTTP</th>
                    <th className="py-2 pr-3">Error code</th>
                    <th className="py-2">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {r.attempts.map((a: any) => (
                    <tr key={a.dc} className="border-t border-border align-top">
                      <td className="py-2 pr-3 font-mono">{a.dc}</td>
                      <td className="py-2 pr-3">
                        <StatusBadge ok={a.ok} label={a.ok ? "OK" : "Fail"} />
                      </td>
                      <td className="py-2 pr-3 font-mono">{a.status}</td>
                      <td className="py-2 pr-3 font-mono">{a.ok ? "—" : a.errorCode}</td>
                      <td className="py-2 text-muted-foreground">{a.ok ? "Access token issued" : a.errorDescription}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {r.organizations && r.organizations.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <h2 className="font-semibold">Organizations visible to this token</h2>
              <div className="mt-3 space-y-2">
                {r.organizations.map((o: any) => (
                  <div
                    key={o.organization_id}
                    className={`flex items-center justify-between rounded-lg border p-3 text-sm ${
                      o.organization_id === r.orgIdConfigured
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-border bg-background"
                    }`}
                  >
                    <span className="font-medium">{o.name}</span>
                    <span className="font-mono text-xs">{o.organization_id}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
