/**
 * Client-side COJ deterministic autofill pipeline.
 * Never calls document-fill edge (0 credits; no LLM).
 * Burns field_values onto template PDF using existing buildSignedPdf engine.
 */
import { resolveCompanyContext, resolveCojFieldValues } from './company-context.js';
import { fetchTemplatePdfBytes, buildSignedPdf } from './document-sign-pdf.js';
import { COJ_FORM_STATUSES } from './coj-formation-packet.js';

/**
 * Build storage path for a prefilled COJ PDF.
 * Pattern: {clientId}/articles/{form_id}/prefilled-{timestamp}.pdf
 */
export function prefilledPath(clientId, formId, ts) {
  return `${clientId}/articles/${formId}/prefilled-${ts || Date.now()}.pdf`;
}

/**
 * Full autofill run for one COJ form template.
 * Resolves values → burns PDF → uploads to storage → inserts documents row → updates job.
 * Returns { doc, fieldValues } on success; throws on error.
 *
 * @param {{
 *   supabase: object,
 *   session: object,
 *   clientProfile: object,
 *   formationDraft: object,
 *   template: object,       — legal_templates row with placeholder_map + field_map
 *   jobId: string,
 *   formId: string,
 * }} opts
 */
export async function applyCojAutofill({ supabase, session, clientProfile, formationDraft, template, jobId, formId }) {
  if (!supabase || !session?.user?.id) throw new Error('Not signed in.');
  if (!template?.id) throw new Error('Template required.');

  const clientId = session.user.id;

  // 1. Build context + resolve field values (deterministic, 0 credits)
  const context = resolveCompanyContext({
    client: clientProfile,
    formationDraft,
    complianceIntake: {},
  });
  const fieldValues = resolveCojFieldValues(template, context);

  // 2. Fetch template PDF bytes
  const templatePdfBytes = await fetchTemplatePdfBytes(template, supabase);

  // 3. Burn text fields onto PDF (no signatures, no placements needed)
  const pdfBytes = await buildSignedPdf({
    templatePdfBytes,
    fieldMap: template.field_map ?? {},
    fieldValues,
    placements: {},
  });

  // 4. Upload prefilled PDF
  const ts = Date.now();
  const storagePath = prefilledPath(clientId, formId, ts);

  const { error: uploadErr } = await supabase.storage
    .from('client-documents')
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: false });
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

  // 5. Insert documents row — roll back storage on failure
  const docRow = {
    client_id: clientId,
    name: `${template.label} — autofilled.pdf`,
    path: storagePath,
    size: pdfBytes.byteLength,
    category: formId,
    uploaded_by: clientId,
  };

  const { data: insertedDoc, error: dbErr } = await supabase
    .from('documents')
    .insert(docRow)
    .select('id, name, path, size, category, created_at')
    .maybeSingle();

  if (dbErr) {
    await supabase.storage.from('client-documents').remove([storagePath]);
    throw new Error(`Vault record failed: ${dbErr.message}`);
  }

  // 6. Update document_jobs — roll back vault + storage if job update fails
  if (jobId) {
    const { error: jobErr } = await supabase
      .from('document_jobs')
      .update({
        status: COJ_FORM_STATUSES.PREFILLED,
        field_values: fieldValues,
        filled_path: storagePath,
        filled_by: 'autofill',
        credits_charged: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    if (jobErr) {
      if (insertedDoc?.id) {
        await supabase.from('documents').delete().eq('id', insertedDoc.id);
      }
      await supabase.storage.from('client-documents').remove([storagePath]);
      throw new Error(`Job update failed: ${jobErr.message}`);
    }
  }

  return { doc: insertedDoc || { ...docRow, created_at: new Date().toISOString() }, fieldValues };
}
