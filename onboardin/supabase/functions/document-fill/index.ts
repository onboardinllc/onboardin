import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { encode as encodeBase64, decode as decodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as mupdf from 'npm:mupdf@1.27.0';
import { PDFDocument, StandardFonts } from 'npm:pdf-lib@1.17.1';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_FIELD_VALUE_LEN = 2000;
const MAX_FIELD_COUNT = 64;

type FieldMapDef = {
  acroField?: string;
  acroIndex?: number;
  acroIndices?: number[];
  page?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  type?: string;
  fontSize?: number;
};

function hasAcroFieldMap(fieldMap: Record<string, FieldMapDef>): boolean {
  return Object.values(fieldMap || {}).some(
    (def) => def && (
      def.acroField != null
      || typeof def.acroIndex === 'number'
      || Array.isArray(def.acroIndices)
    ),
  );
}

function hasCoordinateFieldMap(fieldMap: Record<string, FieldMapDef>): boolean {
  return Object.values(fieldMap || {}).some(
    (def) => def && typeof def.x === 'number' && typeof def.y === 'number',
  );
}

const FORM6_PDF_FIELDS: Record<string, string | { day: string; month: string; year: string }> = {
  proposed_company_name: 'NAME 1',
  applicant_name: 'REQUESTED BY',
  applicant_address: 'STREET 1',
  reservation_date: { day: 'DAY', month: 'MONTH', year: 'YEAR' },
};

function splitReservationDate(value: string) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [year, month, day] = v.split('-');
    return { day, month, year: year.slice(-2) };
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) {
    const [d, m, y] = v.split('/');
    return { day: d.padStart(2, '0'), month: m.padStart(2, '0'), year: y.slice(-2) };
  }
  return null;
}

function cojPdfFieldNameValues(
  formKind: string,
  fieldValues: Record<string, string>,
  fieldMap: Record<string, { acroField?: string }> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  if (formKind === 'coj_form_6') {
    for (const [key, pdfName] of Object.entries(FORM6_PDF_FIELDS)) {
      if (typeof pdfName === 'string') {
        const v = String(fieldValues?.[key] ?? '').trim();
        if (v) out[pdfName] = v;
      }
    }
    const dateSpec = FORM6_PDF_FIELDS.reservation_date;
    const parts = splitReservationDate(fieldValues?.reservation_date ?? '');
    if (dateSpec && typeof dateSpec === 'object' && parts) {
      if (parts.day) out[dateSpec.day] = parts.day;
      if (parts.month) out[dateSpec.month] = parts.month;
      if (parts.year) out[dateSpec.year] = parts.year;
    }
  }
  for (const [key, def] of Object.entries(fieldMap || {})) {
    if (!def?.acroField || out[def.acroField]) continue;
    const v = String(fieldValues?.[key] ?? '').trim();
    if (v) out[String(def.acroField)] = v;
  }
  return out;
}

function sanitizeFieldValues(
  fieldValues: Record<string, string>,
  allowedKeys: Set<string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  let count = 0;
  for (const [key, raw] of Object.entries(fieldValues || {})) {
    if (!allowedKeys.has(key)) continue;
    const v = String(raw ?? '').trim();
    if (!v) continue;
    if (v.length > MAX_FIELD_VALUE_LEN) {
      throw new Error(`Field "${key}" exceeds maximum length`);
    }
    out[key] = v;
    count += 1;
    if (count > MAX_FIELD_COUNT) throw new Error('Too many field values');
  }
  return out;
}

async function loadActiveTemplate(supabase: ReturnType<typeof createClient>, templateId: string) {
  const { data: template, error: tErr } = await supabase
    .from('legal_templates')
    .select('id, kind, provider, template_path, placeholder_map, field_map')
    .eq('id', templateId)
    .eq('active', true)
    .maybeSingle();
  if (tErr || !template?.template_path) return null;
  return template;
}

function fillAcroPdfMupdf(templateBytes: Uint8Array, pdfFieldValues: Record<string, string>) {
  if (templateBytes.byteLength > MAX_PDF_BYTES) {
    throw new Error('Template PDF exceeds maximum size');
  }
  const doc = mupdf.Document.openDocument(templateBytes, 'application/pdf');
  let filledCount = 0;
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i);
    for (const widget of page.getWidgets()) {
      const name = widget.getName();
      const value = pdfFieldValues[name];
      if (!value) continue;
      widget.setTextValue(value);
      filledCount += 1;
    }
  }
  const buffer = doc.saveToBuffer('pdf');
  const pdfBytes = buffer.asUint8Array ? new Uint8Array(buffer.asUint8Array()) : new Uint8Array(buffer);
  return { pdfBytes, filledCount };
}

async function fillCoordinatePdfLib(
  templateBytes: Uint8Array,
  fieldMap: Record<string, FieldMapDef>,
  fieldValues: Record<string, string>,
) {
  if (templateBytes.byteLength > MAX_PDF_BYTES) {
    throw new Error('Template PDF exceeds maximum size');
  }
  const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let filledCount = 0;
  for (const [key, def] of Object.entries(fieldMap || {})) {
    if (def.type !== 'text' && def.type !== 'date') continue;
    const text = String(fieldValues?.[key] ?? '').trim();
    if (!text) continue;
    const page = pdfDoc.getPages()[def.page ?? 0];
    if (!page) continue;
    const { height: pageHeight } = page.getSize();
    const x = def.x ?? 72;
    const h = def.h ?? 24;
    const uiY = def.y ?? 0;
    const pdfY = pageHeight - uiY - h;
    const fontSize = def.fontSize ?? 10;
    page.drawText(text, { x, y: pdfY + 4, size: fontSize, font });
    filledCount += 1;
  }
  const pdfBytes = new Uint8Array(await pdfDoc.save({ useObjectStreams: false }));
  return { pdfBytes, filledCount };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const { action, job_id, template_id } = body;

    if (action === 'fill_acro_pdf' || action === 'fill_coj_pdf') {
      const { form_id, field_values } = body as {
        form_id?: string;
        field_values?: Record<string, string>;
        template_id?: string;
      };
      if (!field_values || !template_id) return json({ error: 'template_id and field_values required' }, 400);

      const template = await loadActiveTemplate(supabase, template_id);
      if (!template) return json({ error: 'Template not found' }, 404);

      const fieldMap = (template.field_map || {}) as Record<string, FieldMapDef>;
      if (!hasAcroFieldMap(fieldMap)) return json({ error: 'Template has no AcroForm field map' }, 400);

      const formKind = form_id || template.kind;
      if (form_id && form_id !== template.kind) {
        return json({ error: 'Template does not match form' }, 400);
      }

      const allowedKeys = new Set(Object.keys(
        (template.placeholder_map || {}) as Record<string, unknown>,
      ));
      let safeFieldValues: Record<string, string>;
      try {
        safeFieldValues = sanitizeFieldValues(field_values, allowedKeys);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Invalid field values';
        return json({ error: msg }, 400);
      }
      if (!Object.keys(safeFieldValues).length) return json({ error: 'No fillable field values' }, 400);

      const templateBytes = await fetchTemplateBytes(template.template_path);
      const pdfFieldValues = cojPdfFieldNameValues(formKind, safeFieldValues, fieldMap);
      if (!Object.keys(pdfFieldValues).length) return json({ error: 'No fillable field values' }, 400);

      let pdfBytes: Uint8Array;
      let filledCount: number;
      try {
        ({ pdfBytes, filledCount } = fillAcroPdfMupdf(templateBytes, pdfFieldValues));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'PDF fill failed';
        return json({ error: msg }, 422);
      }
      if (filledCount === 0) return json({ error: 'No PDF fields could be filled' }, 422);

      return json({ filled_count: filledCount, pdf_base64: encodeBase64(pdfBytes) });
    }

    if (action === 'fill_coordinate_pdf') {
      const { field_values } = body as {
        field_values?: Record<string, string>;
        template_id?: string;
      };
      if (!field_values || !template_id) return json({ error: 'template_id and field_values required' }, 400);

      const template = await loadActiveTemplate(supabase, template_id);
      if (!template) return json({ error: 'Template not found' }, 404);

      const fieldMap = (template.field_map || {}) as Record<string, FieldMapDef>;
      if (!hasCoordinateFieldMap(fieldMap)) {
        return json({ error: 'Template has no coordinate field map' }, 400);
      }

      const allowedKeys = new Set(Object.keys(
        (template.placeholder_map || {}) as Record<string, unknown>,
      ));
      let safeFieldValues: Record<string, string>;
      try {
        safeFieldValues = sanitizeFieldValues(field_values, allowedKeys);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Invalid field values';
        return json({ error: msg }, 400);
      }
      if (!Object.keys(safeFieldValues).length) return json({ error: 'No fillable field values' }, 400);

      const templateBytes = await fetchTemplateBytes(template.template_path);
      let pdfBytes: Uint8Array;
      let filledCount: number;
      try {
        ({ pdfBytes, filledCount } = await fillCoordinatePdfLib(templateBytes, fieldMap, safeFieldValues));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'PDF fill failed';
        return json({ error: msg }, 422);
      }
      if (filledCount === 0) return json({ error: 'No PDF fields could be filled' }, 422);

      return json({ filled_count: filledCount, pdf_base64: encodeBase64(pdfBytes) });
    }

    if (action === 'fetch_template') {
      if (!template_id) return json({ error: 'template_id required' }, 400);
      const { data: template, error: tErr } = await supabase
        .from('legal_templates')
        .select('id, template_path, active')
        .eq('id', template_id)
        .eq('active', true)
        .maybeSingle();
      if (tErr || !template) return json({ error: 'Template not found' }, 404);
      const pdfBytes = await fetchTemplateBytes(template.template_path);
      return json({ template_id, pdf_base64: encodeBase64(pdfBytes) });
    }

    if (!job_id || !template_id) return json({ error: 'job_id and template_id required' }, 400);

    // Load template
    const { data: template, error: tErr } = await supabase
      .from('legal_templates')
      .select('*')
      .eq('id', template_id)
      .eq('active', true)
      .maybeSingle();
    if (tErr || !template) return json({ error: 'Template not found' }, 404);

    // COJ forms are deterministic-only (Phase B client-side). Reject any LLM request.
    if (template.provider === 'coj') {
      const hasLlmField = Object.values((template.placeholder_map || {}) as Record<string, { llm?: boolean }>)
        .some((def) => def?.llm === true);
      if (hasLlmField) {
        return json({ error: 'COJ templates do not support LLM fill. Use client-side autofill.' }, 400);
      }
      return json({ error: 'COJ templates use client-side autofill. Call coj-prefill directly.' }, 400);
    }

    // Load job (must belong to user or admin)
    const { data: job, error: jErr } = await supabase
      .from('document_jobs')
      .select('*')
      .eq('id', job_id)
      .maybeSingle();
    if (jErr || !job) return json({ error: 'Job not found' }, 404);

    const { data: profile } = await supabase.from('clients').select('*').eq('id', user.id).single();
    const isAdmin = profile?.is_admin ?? false;
    if (!isAdmin && job.client_id !== user.id) return json({ error: 'Forbidden' }, 403);

    // Load client profile for context
    const { data: clientProfile } = await supabase.from('clients').select('*').eq('id', job.client_id).single();

    const formation_draft = clientProfile?.formation_draft || {};
    const complianceIntake = await loadComplianceIntake(supabase, job.client_id);

    const context = resolveCompanyContext({ client: clientProfile, formationDraft: formation_draft, complianceIntake });
    const placeholderMap = template.placeholder_map || {};

    // Determine which keys need LLM
    const llmKeys: string[] = [];
    const deterministicValues: Record<string, string> = {};
    for (const [key, def] of Object.entries(placeholderMap) as [string, { source: string; llm?: boolean }][]) {
      if (def.llm) {
        llmKeys.push(key);
      } else {
        deterministicValues[key] = resolveField(def.source, context);
      }
    }

    // Credit check for LLM path (3 per day, refresh if new day)
    const lastRefresh = clientProfile?.last_credit_refresh ? new Date(clientProfile.last_credit_refresh) : new Date(0);
    const isNewDay = lastRefresh.toDateString() !== new Date().toDateString();
    let currentCredits = isNewDay ? 3 : (clientProfile?.daily_ai_credits ?? 0);

    let llmValues: Record<string, string> = {};
    let creditsCharged = 0;

    if (llmKeys.length > 0) {
      if (!isAdmin) {
        if (currentCredits <= 0) {
          return json({ error: 'out_of_credits', message: 'Daily AI credits used. Try again tomorrow.' }, 402);
        }
        creditsCharged = 1;
        currentCredits -= 1;

        const refreshFields: Record<string, unknown> = { daily_ai_credits: currentCredits };
        if (isNewDay) { refreshFields.last_credit_refresh = new Date().toISOString(); refreshFields.daily_ai_credits = 2; }
        await supabase.from('clients').update(refreshFields).eq('id', job.client_id);
      }

      llmValues = await fillWithLlm(llmKeys, template, context);
    }

    const fieldValues = { ...deterministicValues, ...llmValues };

    // Update job to filled
    const { error: updateErr } = await supabase
      .from('document_jobs')
      .update({
        status: 'filled',
        filled_by: isAdmin ? 'admin' : 'assistant',
        field_values: fieldValues,
        credits_charged: creditsCharged,
        admin_user_id: isAdmin ? user.id : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job_id);
    if (updateErr) return json({ error: updateErr.message }, 500);

    return json({ job_id, field_values: fieldValues, credits_charged: creditsCharged });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});

async function fetchTemplateBytes(templatePath: string): Promise<Uint8Array> {
  if (!templatePath) throw new Error('Template path missing');
  const res = await fetch(templatePath);
  if (!res.ok) throw new Error(`Template fetch failed (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

async function loadComplianceIntake(supabase: ReturnType<typeof createClient>, clientId: string): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from('compliance_artifacts')
    .select('artifact_path')
    .eq('client_id', clientId)
    .eq('kind', 'compliance_intake')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.artifact_path) return {};
  try { const parsed = JSON.parse(data.artifact_path); if (parsed && typeof parsed === 'object') return parsed; } catch {}
  return {};
}

function resolveCompanyContext({ client, formationDraft, complianceIntake }: {
  client: Record<string, unknown> | null;
  formationDraft: Record<string, unknown>;
  complianceIntake: Record<string, unknown>;
}): Record<string, unknown> & { _computed: Record<string, string> } {
  const base = {
    company_name: client?.company_name ?? '',
    founder_name: client?.founder_name ?? '',
    jurisdiction: client?.jurisdiction ?? '',
    country: client?.country ?? '',
    entity_type: client?.entity_type ?? '',
    business_intent: client?.business_intent ?? '',
    sells_to: client?.sells_to ?? '',
  };
  const merged = { ...base, ...formationDraft, ...complianceIntake };
  const jurisdiction = String(merged.jurisdiction || merged.country || '');
  const country = String(merged.country || '');
  let governing_law = '';
  if (country === 'Jamaica' || jurisdiction === 'Jamaica') governing_law = 'Jamaica';
  else if (jurisdiction) governing_law = `the State of ${jurisdiction}`;
  else if (country) governing_law = country;
  merged._computed = { today: new Date().toISOString().slice(0, 10), governing_law };
  return merged as Record<string, unknown> & { _computed: Record<string, string> };
}

function resolveField(source: string, context: Record<string, unknown> & { _computed: Record<string, string> }): string {
  if (!source) return '';
  for (const prefix of ['clients.', 'formation_draft.', 'compliance_intake.']) {
    if (source.startsWith(prefix)) {
      const col = source.slice(prefix.length);
      return String((context as Record<string, unknown>)[col] ?? '');
    }
  }
  if (source.startsWith('computed.')) {
    const col = source.slice('computed.'.length);
    return String(context._computed[col] ?? '');
  }
  return '';
}

async function fillWithLlm(llmKeys: string[], template: Record<string, unknown>, context: Record<string, unknown> & { _computed: Record<string, string> }): Promise<Record<string, string>> {
  if (!ANTHROPIC_API_KEY) return Object.fromEntries(llmKeys.map((k) => [k, '']));

  const contextSummary = [
    `Company: ${context.company_name}`,
    `Jurisdiction: ${context.jurisdiction}, ${context.country}`,
    `Entity type: ${context.entity_type}`,
  ].join('\n');

  const prompt = `Fill the following legal document placeholder fields for a ${context.entity_type} in ${context.jurisdiction}. Return a JSON object with only these keys: ${llmKeys.join(', ')}.

Context:
${contextSummary}

Template: ${template.label}
Kind: ${template.kind}

Rules:
- Fill placeholders only. Never draft new legal clauses.
- Keep values concise (one word to one sentence).
- governing_law: use the jurisdiction's formal law name (e.g. "the State of Delaware").

Return only valid JSON.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    const text = data?.content?.[0]?.text || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return Object.fromEntries(llmKeys.map((k) => [k, String(parsed[k] ?? '')]));
    }
  } catch {}
  return Object.fromEntries(llmKeys.map((k) => [k, '']));
}
