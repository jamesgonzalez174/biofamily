import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get('ZOHO_CLIENT_ID');
    const clientSecret = Deno.env.get('ZOHO_CLIENT_SECRET');
    const refreshToken = Deno.env.get('ZOHO_REFRESH_TOKEN');

    console.log('Client ID starts with:', clientId?.substring(0, 15));
    console.log('Client Secret length:', clientSecret?.length);
    console.log('Refresh Token starts with:', refreshToken?.substring(0, 15));
    console.log('Refresh Token length:', refreshToken?.length);

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('Missing credentials');
    }

    const tokenUrl = 'https://accounts.zoho.com/oauth/v2/token';
    const formData = new URLSearchParams();
    formData.append('grant_type', 'refresh_token');
    formData.append('client_id', clientId);
    formData.append('client_secret', clientSecret);
    formData.append('refresh_token', refreshToken);

    console.log('Requesting token from:', tokenUrl);

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    const data = await response.json();
    console.log('Response:', JSON.stringify(data));

    return new Response(
      JSON.stringify({ 
        success: !data.error,
        has_access_token: !!data.access_token,
        error: data.error || null,
        client_id_prefix: clientId.substring(0, 15),
        refresh_token_prefix: refreshToken.substring(0, 15),
        refresh_token_length: refreshToken.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
