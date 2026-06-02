import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY') ?? '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const PROVIDER = Deno.env.get('MODEL_PROVIDER') ?? 'anthropic'; // 'anthropic' | 'deepseek' | 'openai'

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

    let answer = '';

    if (PROVIDER === 'anthropic' && ANTHROPIC_API_KEY) {
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
      if (response.ok) {
        const result = await response.json();
        answer = result.content?.[0]?.text ?? '';
      } else {
        throw new Error(`Anthropic error: ${await response.text()}`);
      }
    } else if ((PROVIDER === 'deepseek' && DEEPSEEK_API_KEY) || (PROVIDER === 'openai' && OPENAI_API_KEY)) {
      const isDeepSeek = PROVIDER === 'deepseek';
      const url = isDeepSeek ? 'https://api.deepseek.com/chat/completions' : 'https://api.openai.com/v1/chat/completions';
      const key = isDeepSeek ? DEEPSEEK_API_KEY : OPENAI_API_KEY;
      const model = isDeepSeek ? 'deepseek-chat' : 'gpt-4o';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: question }
          ],
          max_tokens: 600,
        }),
      });
      if (response.ok) {
        const result = await response.json();
        answer = result.choices?.[0]?.message?.content ?? '';
      } else {
        throw new Error(`${PROVIDER} error: ${await response.text()}`);
      }
    } else {
      // Concierge Fallback: Log question for manual processing
      await supabase.from('messages').insert({
          client_id: user.id,
          sender_id: user.id,
          body: `[SYSTEM: Assistant Inquiry] ${question}`,
          is_admin_message: false
      });
      answer = "I've passed your question to our formation specialists. They will review your profile and message you directly in the dashboard shortly.";
    }

    return new Response(JSON.stringify({ answer }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
