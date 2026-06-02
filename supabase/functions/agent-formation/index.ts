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

    // Credit logic: 3 per day, refresh if needed
    const lastRefresh = profile?.last_credit_refresh ? new Date(profile.last_credit_refresh) : new Date(0);
    const isNewDay = lastRefresh.toDateString() !== new Date().toDateString();
    let currentCredits = isNewDay ? 3 : (profile?.daily_ai_credits ?? 0);

    const { question, isWelcome } = await req.json();

    if (!isWelcome && currentCredits <= 0) {
      // Log for tomorrow
      await supabase.from('messages').insert({
        client_id: user.id,
        sender_id: user.id,
        body: `[SYSTEM: Queued Inquiry] ${question}`,
        is_admin_message: false
      });
      return new Response(JSON.stringify({ 
        answer: "You've used your daily AI credits. I've logged your question for our team to review, and I'll have an answer for you here tomorrow morning when your credits refresh.",
        outOfCredits: true 
      }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const systemPrompt = `You are the Onboardin formation assistant. 
Your goal is to provide high-value, actionable advice to founders.
You have full context about this client:
- Company: ${profile?.company_name || 'Unknown'}
- Founder: ${profile?.founder_name || 'Unknown'}
- Stage: ${profile?.funding_stage || 'Pre-Seed'}
- Location: ${profile?.jurisdiction ? `${profile.jurisdiction}, ${profile?.country}` : profile?.country || 'Unknown'}
- Entity type: ${profile?.entity_type || 'Not yet determined'}
- Business: ${profile?.business_intent || 'Not provided'}
- Sells to: ${profile?.sells_to || 'Not provided'}

Tone: Concise, practical, partnership-oriented.
Assessment Rule: Evaluate their progress. If they are missing key info (jurisdiction, entity), tell them. If they are on track, say "so far so good" and give the next best step.
Priority Rule: Always mention that the Onboardin team is ready to help. If they have a complex issue, offer to send a priority message up the chain.
Privacy Rule: If they ask about data sharing, confirm that they can toggle visibility to the admin team in their dashboard settings.

${isWelcome ? 'This is a WELCOME message. Call them by Mr./Ms./Mrs. Lastname. Summarize what they have, what they need to fulfill for the free tier, and what they unlock if they upgrade.' : ''}`;

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
          messages: [{ role: 'user', content: question || (isWelcome ? 'Generate my welcome assessment.' : '') }],
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
            { role: 'user', content: question || (isWelcome ? 'Generate my welcome assessment.' : '') }
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
          body: isWelcome ? `[SYSTEM: Welcome Sent]` : `[SYSTEM: Assistant Inquiry] ${question}`,
          is_admin_message: false
      });
      answer = isWelcome 
        ? `Welcome to Onboardin, ${profile?.founder_name || 'Founder'}. We're reviewing your initial setup for ${profile?.company_name}. A specialist will post your custom roadmap here shortly.`
        : "I've passed your question to our formation specialists. They will review your profile and message you directly in the dashboard shortly.";
    }

    // Decrement credits and update last_refresh
    if (!isWelcome) {
      await supabase.from('clients').update({ 
        daily_ai_credits: currentCredits - 1,
        last_credit_refresh: new Date().toISOString()
      }).eq('id', user.id);
    }

    // Log AI response if user has opted in
    if (profile?.share_ai_data) {
        await supabase.from('messages').insert({
            client_id: user.id,
            sender_id: user.id, // Using user.id as recipient/thread owner
            body: answer,
            is_admin_message: true,
            is_ai_generated: true
        });
    }

    return new Response(JSON.stringify({ answer, isAi: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
