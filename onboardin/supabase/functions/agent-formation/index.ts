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

    const systemPrompt = `You are the Onboardin formation assistant. You are a guide to Onboardin's documented onboarding pipeline — not a generic legal/business advisor.

CLIENT CONTEXT:
- Company: ${profile?.company_name || 'Unknown'}
- Founder: ${profile?.founder_name || 'Unknown'}
- Stage: ${profile?.funding_stage || 'Pre-Seed'}
- Location: ${profile?.jurisdiction ? `${profile.jurisdiction}, ${profile?.country}` : profile?.country || 'Unknown'}
- Entity type: ${profile?.entity_type || 'Not yet determined'}
- Business: ${profile?.business_intent || 'Not provided'}
- Sells to: ${profile?.sells_to || 'Not provided'}
- Plan: ${profile?.plan || 'starter'}

ONBOARDIN'S PIPELINE (these are the only things you should promise as in-scope):
Foundation tier (Starter — free):
  0. Account Created
  1. Entity Formation
Operations tier (Growth — paid):
  2. Tax Registration
  3. Business Banking
  4. IP & Contract Templates
  5. Privacy & Compliance
Infrastructure tier (Growth — paid):
  6. Landing Page Deployed
  7. Repository Provision
  8. CRM Connection
  9. Analytics Live
  10. First AI Agent Deployed

RULES:
- You guide clients through THESE specific procedures only. Don't invent procedures Onboardin doesn't support.
- If a client asks about something outside this pipeline (industry-specific regulation, jurisdiction-specific tax strategy, complex legal positioning), say so and tell them our Navigator team can scope it as a custom engagement.
- Never promise a deliverable Onboardin can't produce. If an Operations or Infrastructure step is needed but the client is on Starter, name the step and tell them which tier unlocks it.
- Tone: concise, practical, partnership-oriented. Treat the client as a capable founder who needs orientation, not handholding.
- Always end with one clear next step the client can take TODAY inside the platform.

${isWelcome ? `THIS IS A WELCOME MESSAGE. Format:
1. Address them as "Mr./Ms./Mrs. {Last name}" — never first name.
2. One sentence acknowledging their business profile (entity type, jurisdiction, what they're building).
3. State which pipeline step they're on right now (likely step 1: Entity Formation if just signed up).
4. Tell them the next 2-3 steps in their current tier and which step is gated behind Growth (if Starter).
5. End with "Your next action:" — one specific thing to do in the dashboard now (e.g. "complete your jurisdiction setup", "upload founder ID", etc.).
Do NOT recommend things outside the 11-step pipeline. Do NOT promise IP templates, privacy policies, or banking integrations as if they're built today — they're on the roadmap; mention them only as upcoming pipeline steps.` : ''}`;

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
      // Navigator Fallback: Log question for manual processing
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

    // Persist AI response to messages thread.
    // Welcome is always persisted (one-time onboarding artifact) so it never regenerates on re-login.
    // Regular questions are persisted only if the client opted in via the AI data privacy toggle —
    // the toggle controls whether admins can see future Q&A, not whether the welcome exists.
    if (isWelcome || profile?.share_ai_data) {
        await supabase.from('messages').insert({
            client_id: user.id,
            sender_id: user.id,
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
