import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function resolveProcedureSlug(country: string, jurisdiction: string, entityType: string): string | null {
  const isJamaica = country === 'Jamaica' || jurisdiction === 'Jamaica';
  if (isJamaica) return 'jamaica-ltd';
  if (jurisdiction === 'Wyoming' && (entityType === 'LLC' || entityType === 'S-Corp')) return 'us-wy-llc';
  if (entityType === 'C-Corp' && (jurisdiction === 'Delaware' || country === 'United States')) return 'us-de-c-corp';
  if ((entityType === 'LLC' || entityType === 'S-Corp') && jurisdiction === 'Wyoming') return 'us-wy-llc';
  if ((entityType === 'LLC' || entityType === 'S-Corp') && (jurisdiction === 'Delaware' || country === 'United States')) return 'us-de-llc';
  return null;
}

const COMPLIANCE_SLUG_SUFFIX: Record<string, string> = {
  'jamaica-ltd': 'jamaica-ltd-privacy',
  'us-de-c-corp': 'us-de-c-corp-privacy',
  'us-de-llc': 'us-de-llc-privacy',
  'us-wy-llc': 'us-wy-llc-privacy',
};

function resolveComplianceSlug(country: string, jurisdiction: string, entityType: string): string | null {
  const formation = resolveProcedureSlug(country, jurisdiction, entityType);
  if (!formation) return null;
  return COMPLIANCE_SLUG_SUFFIX[formation] ?? null;
}

function isComplianceQuestion(text: string): boolean {
  const q = (text || '').toLowerCase();
  return /privacy|compliance|cookie|dpa|oic|fincen|boi|data protection|gdpr|ccpa|termly/.test(q);
}

function blueprintToAgentContext(guide: { name: string; description?: string | null; blueprint: Record<string, unknown> }, kind: 'formation' | 'compliance' = 'formation') {
  const bp = guide.blueprint || {};
  const label = kind === 'compliance' ? 'AUTHORITATIVE COMPLIANCE PROCEDURE' : 'AUTHORITATIVE FORMATION PROCEDURE';
  const extra = kind === 'compliance'
    ? [
      'COMPLIANCE ADDENDUM (v1):',
      '- Do not promise automated Termly, OIC, or FinCEN filings — v1 is guided procedure with proof upload.',
      '- Do not generate legal policy text for the client. Termly manual or counsel path only.',
      '- Step 06 guides document prep and filing steps; it does not provide legal advice.',
      '- Cite compliance procedure step titles only; do not invent obligations outside this blueprint.',
    ]
    : [
      'Follow these jurisdiction-specific steps. Do not invent procedures outside this blueprint.',
      'Prefer on-platform actions (templates, uploads, vault steps) before external portals.',
    ];
  return [
    `${label}: ${guide.name}`,
    guide.description ? `Summary: ${guide.description}` : '',
    bp.estimated_total_cost ? `Estimated cost: ${bp.estimated_total_cost}` : '',
    bp.estimated_total_time ? `Estimated time: ${bp.estimated_total_time}` : '',
    '',
    ...extra,
    '',
    JSON.stringify(bp, null, 2),
  ].filter(Boolean).join('\n');
}

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
      await supabase.from('messages').insert({
        client_id: user.id,
        sender_id: user.id,
        body: `[SYSTEM: Queued Inquiry] ${question}`,
        is_admin_message: false,
        thread: 'assistant',
        share_with_admin: profile?.share_ai_data ?? false,
        sent_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ 
        answer: "You've used your daily AI credits. I've logged your question for our team to review, and I'll have an answer for you here tomorrow morning when your credits refresh.",
        outOfCredits: true 
      }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    let procedureContext = '';
    const onboardingStep = profile?.onboarding_step ?? 0;
    const useCompliance = onboardingStep >= 5 || isComplianceQuestion(question || '');
    const complianceSlug = resolveComplianceSlug(
      profile?.country || 'United States',
      profile?.jurisdiction || '',
      profile?.entity_type || 'LLC',
    );
    const formationSlug = resolveProcedureSlug(
      profile?.country || 'United States',
      profile?.jurisdiction || '',
      profile?.entity_type || 'LLC',
    );

    if (useCompliance && complianceSlug) {
      const { data: guide } = await supabase
        .from('procedure_guides')
        .select('name, description, blueprint')
        .eq('slug', complianceSlug)
        .eq('is_active', true)
        .maybeSingle();
      if (guide?.blueprint) {
        procedureContext = `\n\n${blueprintToAgentContext(guide as { name: string; description?: string | null; blueprint: Record<string, unknown> }, 'compliance')}`;
      }
    } else if (formationSlug) {
      const { data: guide } = await supabase
        .from('procedure_guides')
        .select('name, description, blueprint')
        .eq('slug', formationSlug)
        .eq('is_active', true)
        .maybeSingle();
      if (guide?.blueprint) {
        procedureContext = `\n\n${blueprintToAgentContext(guide as { name: string; description?: string | null; blueprint: Record<string, unknown> }, 'formation')}`;
      }
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
Do NOT recommend things outside the 11-step pipeline. Do NOT promise IP templates, privacy policies, or banking integrations as if they're built today — they're on the roadmap; mention them only as upcoming pipeline steps.` : ''}${procedureContext}`;

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
        console.error('formation provider error', response.status);
        throw new Error('provider_unavailable');
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
        console.error('formation provider error', PROVIDER, response.status);
        throw new Error('provider_unavailable');
      }
    } else {
      // Navigator Fallback: Log question for manual processing
      await supabase.from('messages').insert({
          client_id: user.id,
          sender_id: user.id,
          body: isWelcome ? `[SYSTEM: Welcome Sent]` : `[SYSTEM: Assistant Inquiry] ${question}`,
          is_admin_message: false,
          thread: 'assistant',
          share_with_admin: profile?.share_ai_data ?? false,
          sent_at: new Date().toISOString(),
      });
      answer = isWelcome 
        ? `Welcome to Onboardin, ${profile?.founder_name || 'Founder'}. We're reviewing your initial setup for ${profile?.company_name}. A specialist will post your custom roadmap here shortly.`
        : "I've passed your question to our formation specialists. They will review your profile and message you directly in the dashboard shortly.";
    }

    if (!isWelcome && question?.trim()) {
      await supabase.from('messages').insert({
        client_id: user.id,
        sender_id: user.id,
        body: question.trim(),
        is_admin_message: false,
        is_ai_generated: false,
        thread: 'assistant',
        share_with_admin: profile?.share_ai_data ?? false,
        sent_at: new Date().toISOString(),
      });
    }

    // Decrement credits and update last_refresh
    if (!isWelcome) {
      await supabase.from('clients').update({ 
        daily_ai_credits: currentCredits - 1,
        last_credit_refresh: new Date().toISOString()
      }).eq('id', user.id);
    }

    if (answer) {
        await supabase.from('messages').insert({
            client_id: user.id,
            sender_id: user.id,
            body: answer,
            is_admin_message: true,
            is_ai_generated: true,
            thread: 'assistant',
            share_with_admin: isWelcome ? true : (profile?.share_ai_data ?? false),
            sent_at: new Date().toISOString(),
        });
    }

    return new Response(JSON.stringify({ answer, isAi: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('agent-formation', err);
    return new Response(JSON.stringify({ error: 'Assistant temporarily unavailable. Try again shortly.' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
