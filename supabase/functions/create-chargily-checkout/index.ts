// Supabase Edge Function: create-chargily-checkout
// Server-side Chargily V2 checkout creation with JWT auth & DB-authoritative pricing.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://teachmelearn.netlify.app',
  'https://teach-me-app-one.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://localhost',
  'capacitor://localhost'
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const extraOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const allowed = new Set([...DEFAULT_ALLOWED_ORIGINS, ...extraOrigins]);
  const allowOrigin = allowed.has(origin) ? origin : DEFAULT_ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

const CHARGILY_TEST_API_URL = 'https://pay.chargily.net/test/api/v2';
const CHARGILY_LIVE_API_URL = 'https://pay.chargily.net/api/v2';

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const authHeader = req.headers.get('authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'invalid_token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json().catch(() => ({}));
    const packageCode = typeof body.packageId === 'string' ? body.packageId.trim().toLowerCase() : '';
    const paymentMethod = body.paymentMethod === 'cib' ? 'cib' : 'edahabia';

    if (!/^[a-z0-9_-]{2,32}$/.test(packageCode)) {
      return new Response(JSON.stringify({ error: 'invalid_package' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Look up authoritative price from public.packages on the server
    const { data: pkg, error: pkgErr } = await supabaseAdmin
      .from('packages')
      .select('id, code, name, price_cents, is_active')
      .eq('code', packageCode)
      .eq('is_active', true)
      .maybeSingle();

    if (pkgErr || !pkg || Number(pkg.price_cents) <= 0) {
      return new Response(JSON.stringify({ error: 'package_not_found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const secretKey = Deno.env.get('CHARGILY_SECRET_KEY') || '';
    const isLive = (Deno.env.get('CHARGILY_MODE') || 'test') === 'live';

    if (!secretKey) {
      return new Response(
        JSON.stringify({ isSandboxMode: true, status: 'pending' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const appOrigin = Deno.env.get('PUBLIC_APP_URL') || 'https://teachmelearn.netlify.app';
    const apiUrl = isLive ? CHARGILY_LIVE_API_URL : CHARGILY_TEST_API_URL;
    const amountDZD = Number(pkg.price_cents);

    const response = await fetch(`${apiUrl}/checkouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: amountDZD,
        currency: 'dzd',
        payment_method: paymentMethod,
        success_url: `${appOrigin}/?payment=success&pkg=${encodeURIComponent(pkg.code)}`,
        failure_url: `${appOrigin}/?payment=failure`,
        metadata: [
          {
            user_id: userData.user.id,
            package_id: pkg.id,
            package_code: pkg.code
          }
        ]
      })
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: 'gateway_error' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const checkout = await response.json();
    return new Response(
      JSON.stringify({
        checkoutId: checkout.id,
        checkoutUrl: checkout.checkout_url,
        status: checkout.status || 'pending',
        isSandboxMode: !isLive
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: 'internal_error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
