import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });

    const { data: profile } = await supabase.from('clients').select('*').eq('id', user.id).single();

    const { question } = await req.json();

    const systemPrompt = `You are the Onboardin formation assistant — a concise, practical advisor helping founders structure their business correctly from day one. You have full context about this client's business and give direct, actionable answers. Never give legal disclaimers beyond a single sentence. Always end with one clear next step.

Client profile:
- Company: ${profile?.company_name || 'Unknown'}
- Founder: ${profile?.founder_name || 'Unknown'}
- Stage: ${profile?.funding_stage || 'Pre-Seed'}
- Location: ${profile?.jurisdiction ? `${profile.jurisdiction}, ${profile?.country}` : profile?.country || 'Unknown'}
- Entity type: ${profile?.entity_type || 'Not yet determined'}
- Business: ${profile?.business_intent || 'Not provided'}
- Sells to: ${profile?.sells_to || 'Not provided'}
- Plan: ${profile?.plan || 'starter'}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: 'user', content: question }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return new Response(JSON.stringify({ error: 'Claude API error', detail: err }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const result = await response.json();
    const answer = result.content?.[0]?.text ?? '';

    return new Response(JSON.stringify({ answer }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
