/**
 * Unified autofill service - all vault templates with acro or coordinate field_map.
 * Deterministic (0 credits). LLM fields are filled separately before calling with full values.
 */
import { resolveCojFieldValues, resolveEntityFacts } from './company-context.js';
import { harvestAfterAutofill } from './profile-harvest.js';
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

  const { pdfBytes, filledCount } = await buildFilledPdf({
    templatePdfBytes: null,
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
  const displayName = `${template.label} - working copy.pdf`;

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

  // Harvest filled values into the reusable profile so the next form already knows
  // them. Awaited so the caller can refresh React state with the merged profile,
  // but a harvest failure never fails the autofill the member just ran.
  let harvestedProfile = null;
  try {
    harvestedProfile = await harvestAfterAutofill(supabase, clientId, {
      fieldValues,
      formationDraft,
      template,
      scope: { jurisdiction: clientProfile?.jurisdiction, entityType: clientProfile?.entity_type },
    });
  } catch (err) {
    console.warn('[autofill] profile harvest failed:', err?.message || err);
  }

  return {
    doc: insertedDoc,
    fieldValues,
    storagePath,
    filledBy: 'autofill',
    creditsCharged: 0,
    removedLegacy,
    entityProfile: harvestedProfile,
  };
}