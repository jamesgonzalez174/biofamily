import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthScene } from "@/components/AuthScene";

type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;

function sameOriginPath(input: string | null): string | null {
  if (!input || !input.startsWith("/") || input.startsWith("//")) return null;
  return input;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/login", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  errorComponent: ({ error }) => (
    <AuthScene>
      <div className="auth-glass rounded-2xl p-8 text-center">
        <h1 className="text-xl font-semibold">Could not load this authorization request</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {String((error as Error)?.message ?? error)}
        </p>
      </div>
    </AuthScene>
  ),
  component: Consent,
});

function Consent() {
  const details = Route.useLoaderData() as any;
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) { setBusy(false); setError(error.message); return; }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) { setBusy(false); setError("No redirect returned by the authorization server."); return; }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? details?.client?.client_name ?? "an app";
  const redirectUri = details?.client?.redirect_uris?.[0] ?? details?.client?.redirect_uri ?? null;
  const scopes: string[] = Array.isArray(details?.scopes)
    ? details.scopes
    : typeof details?.scope === "string" ? details.scope.split(/\s+/).filter(Boolean) : [];

  return (
    <AuthScene>
      <div className="auth-pop mb-8 flex items-center justify-center gap-2">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-primary shadow-glow">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-lg font-semibold tracking-tight">Biomed Family</span>
      </div>
      <div className="auth-glass auth-pop-sm rounded-2xl p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Connect {clientName} to your account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This lets {clientName} use Biomed Family as you. It does not bypass this app's permissions or data policies.
        </p>
        {redirectUri && (
          <p className="mt-3 break-all rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">
            Redirect URI: {redirectUri}
          </p>
        )}
        {scopes.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm">
            {scopes.map((s) => (
              <li key={s} className="text-muted-foreground">• {s}</li>
            ))}
          </ul>
        )}
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex gap-3">
          <button
            disabled={busy}
            onClick={() => decide(true)}
            className="flex-1 rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition hover:opacity-95 disabled:opacity-60"
          >
            {busy ? "Working…" : "Approve"}
          </button>
          <button
            disabled={busy}
            onClick={() => decide(false)}
            className="flex-1 rounded-xl border border-input bg-background py-2.5 text-sm font-medium transition hover:bg-accent disabled:opacity-60"
          >
            Cancel connection
          </button>
        </div>
      </div>
    </AuthScene>
  );
}

export { sameOriginPath };
