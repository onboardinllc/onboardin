import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const STRIPE_GROWTH_PRICE_ID = Deno.env.get('STRIPE_GROWTH_PRICE_ID') ?? '';
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://onboardin.llc';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { data: client } = await supabase
      .from('clients')
      .select('company_name, email, stripe_customer_id')
      .eq('id', user.id)
      .single();

    let customerId = client?.stripe_customer_id;

    // Create Stripe customer if one doesn't exist yet
    if (!customerId) {
      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          email: client?.email ?? user.email ?? '',
          name: client?.company_name ?? '',
          metadata: JSON.stringify({ supabase_uid: user.id }),
        }),
      });
      const customer = await customerRes.json();
      customerId = customer.id;

      // Persist on the client row
      await supabase
        .from('clients')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // Create Checkout session
    const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer: customerId,
        mode: 'subscription',
        'line_items[0][price]': STRIPE_GROWTH_PRICE_ID,
        'line_items[0][quantity]': '1',
        success_url: `${SITE_URL}/dashboard?upgraded=1`,
        cancel_url: `${SITE_URL}/dashboard`,
        'subscription_data[metadata][supabase_uid]': user.id,
      }),
    });

    const session = await sessionRes.json();

    if (!session.url) {
      return new Response(JSON.stringify({ error: 'Failed to create checkout session', detail: session }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
