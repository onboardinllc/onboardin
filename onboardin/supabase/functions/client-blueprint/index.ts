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

function blueprintToClientPayload(blueprint: Record<string, unknown>) {
  const steps = (Array.isArray(blueprint?.steps) ? blueprint.steps : []) as Array<{ id?: string; title?: string; description?: string }>;
  const required_documents = steps.filter((s) => s.id && s.title).map((s) => ({
    id: String(s.id),
    label: String(s.title),
    desc: String(s.description || ''),
  }));
  let starter_questions: string[] = Array.isArray(blueprint?.starter_questions)
    ? (blueprint.starter_questions as string[]).filter(Boolean)
    : steps.slice(0, 4).map((s) => `What do I need for ${s.title}?`);
  const defaults = [
    'What entity type should I form?',
    'What are my first filing steps?',
    'Do I need a tax ID before opening a bank account?',
    'What documents do I need to collect first?',
  ];
  while (starter_questions.length < 4) starter_questions.push(defaults[starter_questions.length] || defaults[0]);
  return { starter_questions: starter_questions.slice(0, 4), required_documents: required_documents.slice(0, 8) };
}

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY') ?? '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const PROVIDER = Deno.env.get('MODEL_PROVIDER') ?? 'anthropic';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FALLBACK = {
  starter_questions: [
    'What entity type should I form?',
    'What are my first filing steps?',
    'Do I need a tax ID before opening a bank account?',
    'What documents do I need to collect first?',
  ],
  required_documents: [
    { id: 'gov_id', label: 'Government ID', desc: 'Passport or government-issued photo ID for each founder.' },
    { id: 'founder_docs', label: 'Founder Documents', desc: 'Proof of address and contact info for each founder.' },
    { id: 'formation', label: 'Formation Documents', desc: 'Entity registration paperwork specific to your jurisdiction.' },
    { id: 'tax_id', label: 'Tax Registration', desc: 'Tax ID or equivalent for your jurisdiction.' },
    { id: 'banking', label: 'Banking Setup', desc: 'Business bank account opening documents.' },
  ],
};

async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  if (PROVIDER === 'anthropic' && ANTHROPIC_API_KEY) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 900,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const json = await res.json();
    return json.content?.[0]?.text ?? '';
  }
  if ((PROVIDER === 'deepseek' && DEEPSEEK_API_KEY) || (PROVIDER === 'openai' && OPENAI_API_KEY)) {
    const isDS = PROVIDER === 'deepseek';
    const url = isDS ? 'https://api.deepseek.com/chat/completions' : 'https://api.openai.com/v1/chat/completions';
    const key = isDS ? DEEPSEEK_API_KEY : OPENAI_API_KEY;
    const model = isDS ? 'deepseek-chat' : 'gpt-4o';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 900,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error(`${PROVIDER} ${res.status}`);
    const json = await res.json();
    return json.choices?.[0]?.message?.content ?? '';
  }
  throw new Error('no provider configured');
}

function parseJSON(text: string): { starter_questions: string[]; required_documents: { id: string; label: string; desc: string }[] } | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.starter_questions) || !Array.isArray(parsed.required_documents)) return null;
    return parsed;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });

    const { data: profile } = await supabase.from('clients').select('*').eq('id', user.id).single();

    let body: { mode?: string } = {};
    try {
      const raw = await req.text();
      if (raw) body = JSON.parse(raw);
    } catch { /* empty body ok */ }

    const country = profile?.country || 'United States';
    const jurisdiction = profile?.jurisdiction || '';
    const entity = profile?.entity_type || 'LLC';
    const stage = profile?.funding_stage || 'Pre-Seed';
    const intent = profile?.business_intent || '';
    const sells = profile?.sells_to || '';
    const onboardingStep = profile?.onboarding_step ?? 0;

    if (body.mode === 'compliance') {
      if (onboardingStep < 5) {
        return new Response(JSON.stringify({ error: 'Compliance blueprint available from pipeline step 6 onward' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const complianceSlug = resolveComplianceSlug(country, jurisdiction, entity);
      if (complianceSlug) {
        const { data: guide } = await supabase
          .from('procedure_guides')
          .select('slug, name, blueprint')
          .eq('slug', complianceSlug)
          .eq('is_active', true)
          .maybeSingle();
        if (guide?.blueprint) {
          return new Response(JSON.stringify(guide.blueprint), { headers: { ...cors, 'Content-Type': 'application/json' } });
        }
      }
      return new Response(JSON.stringify({ error: 'No compliance procedure for this jurisdiction', concierge_only: true }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const slug = resolveProcedureSlug(country, jurisdiction, entity);
    if (slug) {
      const { data: guide } = await supabase
        .from('procedure_guides')
        .select('slug, name, blueprint')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();
      if (guide?.blueprint) {
        const payload = blueprintToClientPayload(guide.blueprint as Record<string, unknown>);
        if (payload.required_documents.length) {
          return new Response(JSON.stringify(payload), { headers: { ...cors, 'Content-Type': 'application/json' } });
        }
      }
    }

    const systemPrompt = `You are the Onboardin formation planner. Given a founder's profile, produce a tailored set of (a) the 4 most useful starter questions they'd ask a formation expert right now, and (b) the document categories they specifically need to collect to form their entity in their jurisdiction. Be jurisdiction-accurate — Jamaica requires TRN and Companies Office filing, France requires SAS capital + Kbis, Delaware requires EIN + operating agreement, etc.

Return ONLY a JSON object, no prose, in this exact shape:
{
  "starter_questions": ["...", "...", "...", "..."],
  "required_documents": [
    { "id": "snake_case_id", "label": "Short Title", "desc": "One sentence on what's needed and why." }
  ]
}

Constraints:
- starter_questions: exactly 4, each under 70 characters, phrased as a founder would ask
- required_documents: 5 to 8 items, ids are stable snake_case strings, descs are one sentence each`;

    const userPrompt = `Country: ${country}
Jurisdiction: ${jurisdiction}
Entity type: ${entity}
Funding stage: ${stage}
Business: ${intent}
Sells to: ${sells}`;

    try {
      const raw = await callLLM(systemPrompt, userPrompt);
      const parsed = parseJSON(raw);
      if (parsed) {
        return new Response(JSON.stringify(parsed), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
    } catch (_err) {
      // fall through to fallback
    }

    return new Response(JSON.stringify(FALLBACK), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err), ...FALLBACK }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});