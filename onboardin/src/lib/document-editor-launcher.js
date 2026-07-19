/**
 * Universal document editor launcher.
 * One code path resolves any member PDF (vault file row, COJ packet form,
 * fill panel) to the template + job context DocumentEditor needs.
 */
import { COJ_FORM_IDS } from './coj-formation-packet.js';
import { canOpenInAppEditor } from './pdf-field-map.js';
import { resolveTemplate } from './document-templates.js';

function isPdfDocument(doc) {
  const name = String(doc?.name || doc?.path || '').toLowerCase();
  return name.endsWith('.pdf');
}

async function fetchTemplateForDocument(supabase, clientProfile, doc) {
  const category = doc?.category;
  if (!category) return null;

  if (COJ_FORM_IDS.includes(category)) {
    const { data } = await supabase
      .from('legal_templates')
      .select('*')
      .eq('provider', 'coj')
      .eq('kind', category)
      .eq('active', true)
      .limit(1)
      .maybeSingle();
    return data || null;
  }

  return resolveTemplate({
    vaultCardId: category,
    jurisdiction: clientProfile?.jurisdiction || '',
    country: clientProfile?.country || '',
    entityType: clientProfile?.entity_type || '',
  }, supabase);
}

async function fetchOrCreateJob(supabase, clientId, template) {
  const { data: existing } = await supabase
    .from('document_jobs')
    .select('*')
    .eq('client_id', clientId)
    .eq('template_id', template.id)
    .neq('status', 'voided')
    .maybeSingle();
  if (existing) return existing;

  const isCoj = template.provider === 'coj';
  const { data: created } = await supabase
    .from('document_jobs')
    .insert({
      client_id: clientId,
      template_id: template.id,
      status: isCoj ? 'draft' : 'context_preview',
      field_values: {},
      credits_charged: 0,
    })
    .select('*')
    .single();
  return created || null;
}

/**
 * Resolve everything DocumentEditor needs from whatever the caller has.
 * Pass a vault `document` row, or a known `template` (+ optional `job`).
 * Returns { template, job, mode: 'fielded' | 'generic' } or null when the
 * file cannot open in-app (not a PDF, or nothing resolvable).
 */
export async function resolveEditorContext({
  supabase,
  clientProfile,
  document: doc,
  template: knownTemplate,
  job: knownJob,
}) {
  if (!supabase || !clientProfile?.id) return null;

  let template = knownTemplate || null;
  if (!template && doc) {
    if (!isPdfDocument(doc)) return null;
    template = await fetchTemplateForDocument(supabase, clientProfile, doc);
  }
  if (!template) return null;

  const mode = canOpenInAppEditor(template) ? 'fielded' : 'generic';
  const job = knownJob || await fetchOrCreateJob(supabase, clientProfile.id, template);
  if (!job) return null;

  return { template, job, mode };
}
