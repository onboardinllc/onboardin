import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// When reseller program is approved, swap these for real Google Workspace Reseller API credentials.
// Until then this function records the intent and returns a referral link.
const GWS_REFERRAL_LINK = Deno.env.get('GWS_REFERRAL_LINK') ?? 'https://workspace.google.com/';
const GWS_RESELLER_MODE = Deno.env.get('GWS_RESELLER_MODE') === 'true';
const GWS_RESELLER_TOKEN = Deno.env.get('GWS_RESELLER_TOKEN') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { domain, plan = 'business_starter', seats = 1, adminEmail } = await req.json();

    // Record workspace intent on client profile regardless of mode
    await supabase.from('clients').update({
      workspace_plan: plan,
      workspace_seats: seats,
      workspace_domain: domain,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);

    if (GWS_RESELLER_MODE && GWS_RESELLER_TOKEN) {
      // Full reseller API path — create customer + subscription via Google Reseller API v1
      const customerRes = await fetch('https://reseller.googleapis.com/apps/reseller/v1/customers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GWS_RESELLER_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerDomain: domain,
          postalAddress: { contactName: adminEmail, countryCode: 'US' },
          alternateEmail: adminEmail,
        }),
      });
      const customer = await customerRes.json();
      if (customer.error) {
        return new Response(JSON.stringify({ mode: 'reseller', error: customer.error.message }), { status: 400, headers: corsHeaders });
      }

      const subRes = await fetch(`https://reseller.googleapis.com/apps/reseller/v1/subscriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GWS_RESELLER_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: customer.customerId,
          skuId: plan === 'business_starter' ? 'Google-Apps-For-Business' : 'Google-Apps-Unlimited',
          plan: { planName: 'FLEXIBLE' },
          seats: { numberOfSeats: seats, maximumNumberOfSeats: seats + 10 },
        }),
      });
      const sub = await subRes.json();
      return new Response(JSON.stringify({ mode: 'reseller', customerId: customer.customerId, subscriptionId: sub.subscriptionId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Referral mode — return link for client to complete signup; we track intent in DB
    return new Response(JSON.stringify({
      mode: 'referral',
      referralUrl: GWS_REFERRAL_LINK,
      message: 'Workspace account will be set up by your Onboardin team within 24 hours.',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
