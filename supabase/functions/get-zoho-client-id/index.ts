// Returns the public Zoho client id plus the configured Zoho data center and
// exact callback URL so the frontend builds the OAuth URL from one source.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeZohoDc(input: string | null) {
  const raw = (input || "com").trim().toLowerCase();
  const withoutProtocol = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (withoutProtocol.startsWith("accounts.zoho.")) return withoutProtocol.slice("accounts.zoho.".length);
  if (withoutProtocol.startsWith("www.zohoapis.")) return withoutProtocol.slice("www.zohoapis.".length);
  if (withoutProtocol.startsWith("zohoapis.")) return withoutProtocol.slice("zohoapis.".length);
  if (withoutProtocol.startsWith("zoho.")) return withoutProtocol.slice("zoho.".length);
  return withoutProtocol.replace(/^\.+/, "") || "com";
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const clientId = Deno.env.get("ZOHO_CLIENT_ID");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!clientId) {
    return new Response(JSON.stringify({ error: "ZOHO_CLIENT_ID not set" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!supabaseUrl) {
    return new Response(JSON.stringify({ error: "SUPABASE_URL not set" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const dc = normalizeZohoDc(Deno.env.get("ZOHO_DC"));
  const redirectUri = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/zoho-oauth-callback`;

  return new Response(JSON.stringify({
    clientId,
    dc,
    redirectUri,
    accountsUrl: `https://accounts.zoho.${dc}`,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
