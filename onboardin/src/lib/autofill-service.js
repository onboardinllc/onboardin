/**
 * Unified autofill service — all vault templates with acro or coordinate field_map.
 * Deterministic (0 credits). LLM fields are filled separately before calling with full values.
 */
import { resolveCojFieldValues, resolveEntityFacts, syncFormationDraftToProfile } from './company-context.js';
import { fetchTemplatePdfBytes } from './document-sign-pdf.js';
import { buildFilledPdf, canAutofillTemplate } from './pdf-fill.js';
import { removeLegacyPrefilledCojDocs } from './coj-documents.js';
import { COJ_FORM_STATUSES } from './coj-formation-packet.js';
import { upsertWorkingCopy, workingCopyCanonicalPath } from './document-vault.js';

/**
 * @param {{
 *   supabase: import('@supabase/supabase-js').SupabaseClient,
 *   session: { user: { id: string } },
 *   clientProfile: object,
 *   formationDraft?: object,
 *   complianceIntake?: object,
 *   template: object,
 *   jobId?: string,
 *   formId?: string,
 *   fieldValues?: Record<string, string>,
 * }} opts
 */
export async function runDocumentAutofill({
  supabase,
  session,
  clientProfile,
  formationDraft,
  complianceIntake,
  template,
  jobId,
  formId,
  fieldValues: fieldValuesOverride,
}) {
  if (!supabase || !session?.user?.id) throw new Error('Not signed in.');
  if (!template?.id) throw new Error('Template required.');
  if (!canAutofillTemplate(template)) {
    throw new Error('This form is not configured for autofill yet.');
  }

  const clientId = session.user.id;
  const entityProfile = clientProfile?.entity_profile ?? {};
  const context = resolveEntityFacts({
    client: clientProfile,
    entityProfile,
    formationDraft,
    complianceIntake: complianceIntake ?? {},
  });

  const fieldValues = fieldValuesOverride ?? resolveCojFieldValues(template, context);

  const templatePdfBytes = await fetchTemplatePdfBytes(template, supabase);

  const { pdfBytes, filledCount } = await buildFilledPdf({
    templatePdfBytes,
    fieldMap: template.field_map ?? {},
    fieldValues,
    formKind: formId || template.kind,
    supabase,
    template,
  });

  if (filledCount === 0) {
    throw new Error('No form fields could be filled. Check your profile details and try again.');
  }

  const isCoj = template.provider === 'coj';
  const removedLegacy = isCoj
    ? await removeLegacyPrefilledCojDocs(supabase, clientId, formId || template.kind)
    : [];

  const storagePath = workingCopyCanonicalPath(clientId, template);
  const displayName = `${template.label} — working copy.pdf`;

  const insertedDoc = await upsertWorkingCopy(supabase, {
    clientId,
    template,
    pdfBytes,
    displayName,
  });

  if (jobId) {
    const jobPatch = {
      field_values: fieldValues,
      filled_path: storagePath,
      filled_by: 'autofill',
      credits_charged: 0,
      updated_at: new Date().toISOString(),
    };
    if (isCoj) {
      jobPatch.status = COJ_FORM_STATUSES.WORKING_SAVED;
    } else {
      jobPatch.status = 'filled';
    }
    const { error: jobErr } = await supabase
      .from('document_jobs')
      .update(jobPatch)
      .eq('id', jobId);
    if (jobErr) throw new Error(`Job update failed: ${jobErr.message}`);
  }

  syncFormationDraftToProfile(supabase, clientId, formationDraft, fieldValues).catch((err) => {
    console.warn('[autofill] profile harvest failed:', err?.message || err);
  });

  return {
    doc: insertedDoc,
    fieldValues,
    storagePath,
    filledBy: 'autofill',
    creditsCharged: 0,
    removedLegacy,
  };
}