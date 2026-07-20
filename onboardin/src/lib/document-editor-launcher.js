/**
 * Universal entry into DocumentEditor for vault rows and formation forms.
 */
import { COJ_FORM_IDS } from './coj-formation-packet.js';
import { resolveTemplate } from './document-templates.js';
import { canOpenInAppEditor } from './pdf-field-map.js';

export { canOpenInAppEditor };

/**
 * Resolve template + job for a member document row or panel context.
 * @returns {Promise<{ template, job, mode: 'fielded' | 'generic', document? } | null>}
 */
export async function resolveEditorContext({
  supabase,
  session,
  clientProfile,
  document,
  template,
  job,
  formId,
}) {
  if (!supabase || !clientProfile?.id) return null;

  const clientId = clientProfile.id;
  let resolvedTemplate = template || null;
  let resolvedJob = job || null;
  const category = formId || document?.category || null;

  if (category && COJ_FORM_IDS.includes(category)) {
    if (!resolvedTemplate) {
      const { data: templates } = await supabase
        .from('legal_templates')
        .select('*')
        .eq('provider', 'coj')
        .eq('kind', category)
        .eq('active', true)
        .limit(1);
      resolvedTemplate = templates?.[0] || null;
    }
  } else if (category && !resolvedTemplate) {
    resolvedTemplate = await resolveTemplate({
      vaultCardId: category,
      jurisdiction: clientProfile.jurisdiction || '',
      country: clientProfile.country || '',
      entityType: clientProfile.entity_type || '',
    }, supabase);
  }

  if (resolvedTemplate?.id && !resolvedJob) {
    const { data: existingJob } = await supabase
      .from('document_jobs')
      .select('*')
      .eq('client_id', clientId)
      .eq('template_id', resolvedTemplate.id)
      .neq('status', 'voided')
      .maybeSingle();

    if (existingJob) {
      resolvedJob = existingJob;
    } else {
      const { data: newJob } = await supabase
        .from('document_jobs')
        .insert({
          client_id: clientId,
          template_id: resolvedTemplate.id,
          status: category && COJ_FORM_IDS.includes(category) ? 'draft' : 'context_preview',
          credits_charged: 0,
        })
        .select('*')
        .maybeSingle();
      resolvedJob = newJob || null;
    }
  }

  if (resolvedTemplate && canOpenInAppEditor(resolvedTemplate)) {
    return { template: resolvedTemplate, job: resolvedJob, mode: 'fielded', document };
  }

  if (document?.path?.toLowerCase().endsWith('.pdf')) {
    return { template: resolvedTemplate, job: resolvedJob, mode: 'generic', document };
  }

  return null;
}
