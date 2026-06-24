/**
 * Unified autofill service (Ticket #10).
 * runDocumentAutofill() is the single entry point for all vault autofill.
 * COJ and future statutory forms delegate here; behavior matches legacy coj-prefill.js.
 *
 * Tiers:
 *   A — field_map complete + all facts in entity_profile/draft → deterministic, 0 credits
 *   C — missing acro map or BRF1-style XFA → throws; caller shows "upload manually" message
 *
 * No LLM calls in this module. document-fill edge is intentionally not imported.
 */
import { resolveCojFieldValues, resolveEntityFacts, syncFormationDraftToProfile } from './company-context.js';
import { fetchTemplatePdfBytes } from './document-sign-pdf.js';
import { buildCojFilledPdf, hasCojAcroFieldMap } from './coj-pdf-fill.js';
import { removeLegacyPrefilledCojDocs, upsertCojWorkingCopy } from './coj-documents.js';
import { workingCopyCanonicalPath, COJ_FORM_STATUSES } from './coj-formation-packet.js';

/**
 * @typedef {{
 *   doc: object,
 *   fieldValues: Record<string, string>,
 *   storagePath: string,
 *   filledBy: string,
 *   creditsCharged: number,
 *   removedLegacy: object[],
 * }} AutofillResult
 */

/**
 * Run deterministic (0-credit) autofill for one vault form template.
 *
 * @param {{
 *   supabase: import('@supabase/supabase-js').SupabaseClient,
 *   session: { user: { id: string } },
 *   clientProfile: object,
 *   formationDraft?: object,
 *   template: object,
 *   jobId?: string,
 *   formId: string,
 * }} opts
 * @returns {Promise<AutofillResult>}
 */
export async function runDocumentAutofill({
  supabase,
  session,
  clientProfile,
  formationDraft,
  template,
  jobId,
  formId,
}) {
  if (!supabase || !session?.user?.id) throw new Error('Not signed in.');
  if (!template?.id) throw new Error('Template required.');
  if (!hasCojAcroFieldMap(template.field_map)) {
    throw new Error('This form is not configured for autofill yet.');
  }

  const clientId = session.user.id;

  // Merge entity_profile + formation_draft + clients.* into resolution context.
  const entityProfile = clientProfile?.entity_profile ?? {};
  const context = resolveEntityFacts({
    client: clientProfile,
    entityProfile,
    formationDraft,
    complianceIntake: {},
  });

  const fieldValues = resolveCojFieldValues(template, context);

  const templatePdfBytes = await fetchTemplatePdfBytes(template, supabase);

  const { pdfBytes, filledCount } = await buildCojFilledPdf({
    templatePdfBytes,
    fieldMap: template.field_map ?? {},
    fieldValues,
    placements: {},
  });

  if (filledCount === 0) {
    throw new Error('No form fields could be filled. Check Company Details and try again.');
  }

  const removedLegacy = await removeLegacyPrefilledCojDocs(supabase, clientId, formId);

  const storagePath = workingCopyCanonicalPath(clientId, formId);
  const displayName = `${template.label} — working copy.pdf`;

  const insertedDoc = await upsertCojWorkingCopy(supabase, {
    clientId,
    formId,
    pdfBytes,
    displayName,
  });

  if (jobId) {
    const { error: jobErr } = await supabase
      .from('document_jobs')
      .update({
        status: COJ_FORM_STATUSES.WORKING_SAVED,
        field_values: fieldValues,
        filled_path: storagePath,
        filled_by: 'autofill',
        credits_charged: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    if (jobErr) throw new Error(`Job update failed: ${jobErr.message}`);
  }

  // Harvest resolved facts back into entity_profile (non-blocking; best-effort).
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
