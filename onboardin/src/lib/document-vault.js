/**
 * Vault storage paths + upsert for autofilled working copies (all templates).
 */
import { sortCojDocsNewestFirst } from './coj-documents.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Documents table category for a template row. */
export function templateDocumentCategory(template) {
  if (template?.provider === 'coj') return template.kind;
  return template?.vault_card_id || template?.kind || 'documents';
}

/** Canonical autofilled PDF path — one working copy per template slot. */
export function workingCopyCanonicalPath(clientId, template) {
  if (!UUID_RE.test(clientId)) throw new Error('Invalid clientId in working copy path.');
  const category = templateDocumentCategory(template);
  if (template?.provider === 'coj') {
    return `${clientId}/articles/${category}/working-latest.pdf`;
  }
  return `${clientId}/${category}/working-latest.pdf`;
}

export async function upsertWorkingCopy(supabase, {
  clientId,
  template,
  pdfBytes,
  displayName,
  fileSize,
}) {
  const path = workingCopyCanonicalPath(clientId, template);
  const category = templateDocumentCategory(template);
  const bytes = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  const size = fileSize ?? bytes.byteLength;

  const { error: uploadErr } = await supabase.storage
    .from('client-documents')
    .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

  const { data: existing } = await supabase
    .from('documents')
    .select('id, name, path, size, category, created_at')
    .eq('client_id', clientId)
    .eq('category', category)
    .eq('path', path)
    .maybeSingle();

  if (existing?.id) {
    const { data: updated, error: updateErr } = await supabase
      .from('documents')
      .update({ name: displayName, size, uploaded_by: clientId })
      .eq('id', existing.id)
      .select('id, name, path, size, category, created_at')
      .single();
    if (updateErr) throw new Error(`Vault update failed: ${updateErr.message}`);
    return updated;
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('documents')
    .insert({
      client_id: clientId,
      name: displayName,
      path,
      size,
      category,
      uploaded_by: clientId,
    })
    .select('id, name, path, size, category, created_at')
    .single();

  if (insertErr) {
    await supabase.storage.from('client-documents').remove([path]);
    throw new Error(`Vault record failed: ${insertErr.message}`);
  }

  return inserted;
}

export { sortCojDocsNewestFirst as sortWorkingCopiesNewestFirst };