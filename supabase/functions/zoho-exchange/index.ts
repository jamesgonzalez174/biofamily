import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { code, dc } = await req.json();
    if (!code) throw new Error("Missing 'code' in request body");

    const clientId = Deno.env.get("ZOHO_CLIENT_ID")!;
    const clientSecret = Deno.env.get("ZOHO_CLIENT_SECRET")!;
    const region = (dc || Deno.env.get("ZOHO_DC") || "com").trim();

    const tokenUrl = `https://accounts.zoho.${region}/oauth/v2/token`;
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
    });

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const data = await res.json();

    return new Response(
      JSON.stringify({
        url: tokenUrl,
        client_id_prefix: clientId.substring(0, 15),
        ok: !!data.refresh_token,
        refresh_token: data.refresh_token ?? null,
        access_token_present: !!data.access_token,
        api_domain: data.api_domain ?? null,
        error: data.error ?? null,
        raw: data,
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
