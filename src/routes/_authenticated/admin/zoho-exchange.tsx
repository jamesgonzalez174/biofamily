import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CheckCircle2, XCircle, Loader2, Copy, AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { exchangeZohoGrantCode } from "@/lib/zoho.functions";

export const Route = createFileRoute("/_authenticated/admin/zoho-exchange")({
  component: ZohoExchangePage,
});

function ZohoExchangePage() {
  const fn = useServerFn(exchangeZohoGrantCode);
  const [code, setCode] = useState("");
  const [dc, setDc] = useState("com");

  const mutation = useMutation({
    mutationFn: () => fn({ data: { code: code.trim(), dc: dc.trim() } }),
  });

  const result = mutation.data;
  const refreshToken = result?.ok ? result.refreshToken : null;

  return (
    <AppShell admin>
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Zoho Grant Code Exchanger</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Paste a fresh grant code from Zoho Self Client to receive a permanent
            refresh token. Grant codes expire in minutes — exchange immediately.
          </p>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
            <div className="space-y-1">
              <div className="font-medium">Before generating the code:</div>
              <ul className="list-disc pl-4 text-muted-foreground space-y-0.5">
                <li>Region must match <code>ZOHO_DC</code> (currently <strong>{dc}</strong>)</li>
                <li>Scope: <code>ZohoBooks.fullaccess.all</code></li>
                <li>Time Duration: 10 minutes</li>
                <li>Exchange within 2 minutes of generation</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-border p-4">
          <div className="space-y-2">
            <Label htmlFor="dc">Data Center (DC)</Label>
            <Input
              id="dc"
              value={dc}
              onChange={(e) => setDc(e.target.value)}
              placeholder="com"
            />
            <p className="text-xs text-muted-foreground">
              Usually <code>com</code> (US), <code>eu</code>, <code>in</code>,{" "}
              <code>com.au</code>, <code>jp</code>.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="code">Grant Code</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="1000.xxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyy"
              className="font-mono"
            />
          </div>

          <Button
            onClick={() => mutation.mutate()}
            disabled={!code.trim() || mutation.isPending}
          >
            {mutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Exchanging…</>
            ) : (
              "Exchange for Refresh Token"
            )}
          </Button>
        </div>

        {result && (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-center gap-2">
              {result.ok ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              <span className="font-medium">
                {result.ok ? "Success" : `Failed (HTTP ${result.status})`}
              </span>
            </div>

            {refreshToken && (
              <div className="space-y-2">
                <Label>Refresh Token</Label>
                <div className="flex gap-2">
                  <code className="flex-1 rounded bg-muted p-3 text-xs break-all font-mono">
                    {refreshToken}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(refreshToken);
                      toast.success("Refresh token copied");
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Save this as the <code>ZOHO_REFRESH_TOKEN</code> secret (Project
                  Settings → Secrets → Update), then test at{" "}
                  <a href="/admin/zoho-test" className="underline">
                    /admin/zoho-test
                  </a>
                  .
                </p>
              </div>
            )}

            {result.error && (
              <div className="text-sm text-destructive">Error: {result.error}</div>
            )}

            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Raw response
              </summary>
              <pre className="mt-2 overflow-auto rounded bg-muted p-3">
                {JSON.stringify(result.raw, null, 2)}
              </pre>
            </details>
          </div>
        )}

        {mutation.isError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {(mutation.error as Error).message}
          </div>
        )}
      </div>
    </AppShell>
  );
}
