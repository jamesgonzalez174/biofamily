import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, Link2, Unlink, AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getZohoConnection, disconnectZoho } from "@/lib/zoho.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/zoho-connect")({
  component: ZohoConnectPage,
});

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

function ZohoConnectPage() {
  const qc = useQueryClient();
  const getConn = useServerFn(getZohoConnection);
  const disconnect = useServerFn(disconnectZoho);
  const [connecting, setConnecting] = useState(false);

  const { data: conn, isLoading } = useQuery({
    queryKey: ["zoho-connection"],
    queryFn: () => getConn(),
  });

  const disconnectMut = useMutation({
    mutationFn: () => disconnect(),
    onSuccess: () => {
      toast.success("Zoho disconnected");
      qc.invalidateQueries({ queryKey: ["zoho-connection"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    let expectedOrigin = "";
    try {
      expectedOrigin = new URL(SUPABASE_URL).origin;
    } catch {
      expectedOrigin = "";
    }
    const handler = (ev: MessageEvent) => {
      if (ev.source !== null && ev.origin !== window.location.origin && ev.origin !== expectedOrigin) return;
      const d = ev.data;
      if (!d || typeof d !== "object") return;
      if ((d as any).ok === true && (d as any).orgId) {
        toast.success(`Connected to ${(d as any).orgName || (d as any).orgId}`);
        setConnecting(false);
        qc.invalidateQueries({ queryKey: ["zoho-connection"] });
      } else if ((d as any).ok === false && (d as any).error) {
        toast.error(`Connect failed: ${(d as any).error}`);
        setConnecting(false);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [qc]);

  const startConnect = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-zoho-client-id");
      if (error || !data?.clientId) {
        throw new Error(error?.message || "Could not load Zoho client id");
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id ?? "";
      const state = btoa(JSON.stringify({ user_id: userId, nonce: crypto.randomUUID() }));
      const redirectUri = typeof data.redirectUri === "string"
        ? data.redirectUri
        : `${SUPABASE_URL}/functions/v1/zoho-oauth-callback`;
      const accountsUrl = typeof data.accountsUrl === "string"
        ? data.accountsUrl
        : `https://accounts.zoho.${typeof data.dc === "string" ? data.dc : "com"}`;
      const authUrl = `${accountsUrl}/oauth/v2/auth?${new URLSearchParams({
        response_type: "code",
        client_id: data.clientId,
        scope: "ZohoBooks.fullaccess.all",
        redirect_uri: redirectUri,
        access_type: "offline",
        prompt: "consent",
        state,
      }).toString()}`;
      const popup = window.open(authUrl, "zoho-oauth", "width=600,height=720");
      if (!popup) {
        setConnecting(false);
        toast.error("Popup blocked — allow popups and try again");
      }
    } catch (e: any) {
      setConnecting(false);
      toast.error(e?.message ?? "Failed to start OAuth");
    }
  };

  const redirectUri = `${SUPABASE_URL}/functions/v1/zoho-oauth-callback`;

  return (
    <AppShell admin>
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Zoho Connection</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your Zoho Books organization via OAuth. Tokens are stored
            securely and refreshed automatically.
          </p>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
            <div className="space-y-1">
              <div className="font-medium">One-time setup in Zoho:</div>
              <p className="text-muted-foreground">
                Add this exact URL to your Zoho client's <strong>Authorized Redirect URIs</strong>:
              </p>
              <code className="block rounded bg-muted px-2 py-1 text-xs break-all">
                {redirectUri}
              </code>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border p-6">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : conn?.connected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span className="font-medium">Connected</span>
              </div>
              <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
                <dt className="text-muted-foreground">Organization</dt>
                <dd className="font-mono">{conn.orgName || conn.orgId}</dd>
                <dt className="text-muted-foreground">Org ID</dt>
                <dd className="font-mono text-xs">{conn.orgId}</dd>
                <dt className="text-muted-foreground">Region</dt>
                <dd className="font-mono">{conn.region}</dd>
                <dt className="text-muted-foreground">Token expires</dt>
                <dd className="font-mono text-xs">{conn.expiresAt}</dd>
                <dt className="text-muted-foreground">Connected at</dt>
                <dd className="font-mono text-xs">{conn.connectedAt}</dd>
              </dl>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={startConnect} disabled={connecting}>
                  {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
                  Reconnect
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => disconnectMut.mutate()}
                  disabled={disconnectMut.isPending}
                >
                  <Unlink className="h-4 w-4 mr-2" /> Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Not connected</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Click below to authorize this app in Zoho Books.
              </p>
              <Button onClick={startConnect} disabled={connecting}>
                {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
                Connect Zoho
              </Button>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
