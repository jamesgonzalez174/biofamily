// Returns the public Zoho client id so the frontend can build the consent URL.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const clientId = Deno.env.get("ZOHO_CLIENT_ID");
  if (!clientId) {
    return new Response(JSON.stringify({ error: "ZOHO_CLIENT_ID not set" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ clientId }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
