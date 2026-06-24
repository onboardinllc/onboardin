/**
 * COJ formation packet - vault document helpers (storage + documents rows).
 */
import { workingCopyCanonicalPath } from './coj-formation-packet.js';
import { pdfBytesToUploadBody } from './pdf-bytes.js';

export function isPrefilledCojPath(path) {
  return typeof path === 'string' && path.includes('/prefilled-');
}

export function isWorkingCopyPath(path) {
  return typeof path === 'string' && (path.endsWith('/working-latest.pdf') || path.includes('/working-'));
}

export function sortCojDocsNewestFirst(docs) {
  return [...(docs || [])].sort((a, b) => {
    const aCanon = a.path?.endsWith('/working-latest.pdf') ? 1 : 0;
    const bCanon = b.path?.endsWith('/working-latest.pdf') ? 1 : 0;
    if (aCanon !== bCanon) return bCanon - aCanon;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });
}

/** Remove documents from storage and documents table. */
export async function removeCojDocuments(supabase, docs) {
  const list = Array.isArray(docs) ? docs.filter((d) => d?.path || d?.id) : [];
  if (!list.length || !supabase) return;

  const paths = [...new Set(list.map((d) => d.path).filter(Boolean))];
  const ids = [...new Set(list.map((d) => d.id).filter(Boolean))];

  if (paths.length) {
    const { error } = await supabase.storage.from('client-documents').remove(paths);
    if (error) throw new Error(`Could not remove file: ${error.message}`);
  }
  if (ids.length) {
    const { error } = await supabase.from('documents').delete().in('id', ids);
    if (error) throw new Error(`Could not remove vault record: ${error.message}`);
  }
}

/** Remove legacy prefilled-* snapshots only (never working copies). */
export async function removeLegacyPrefilledCojDocs(supabase, clientId, formId) {
  const { data: docs, error } = await supabase
    .from('documents')
    .select('id, path')
    .eq('client_id', clientId)
    .eq('category', formId)
    .ilike('path', `%/prefilled-%`);

  if (error) throw new Error(`Could not list legacy autofills: ${error.message}`);
  const prefilled = (docs || []).filter((d) => isPrefilledCojPath(d.path));
  if (prefilled.length) await removeCojDocuments(supabase, prefilled);
  return prefilled;
}

/**
 * Upsert the canonical working copy in storage + documents table.
 * Requires 20260629 UPDATE RLS on storage.objects + public.documents.
 * Returns the vault documents row.
 */
export async function upsertCojWorkingCopy(supabase, {
  clientId,
  formId,
  pdfBytes,
  displayName,
  fileSize,
}) {
  const path = workingCopyCanonicalPath(clientId, formId);
  const bytes = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  const size = fileSize ?? bytes.byteLength;
  const body = pdfBytesToUploadBody(bytes);

  const { error: uploadErr } = await supabase.storage
    .from('client-documents')
    .upload(path, body, { contentType: 'application/pdf', upsert: true });
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

  const { data: existing } = await supabase
    .from('documents')
    .select('id, name, path, size, category, created_at')
    .eq('client_id', clientId)
    .eq('category', formId)
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
      category: formId,
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

/**
 * After deleting docs, reset job status when no working copies remain.
 */
export async function reconcileCojJobAfterDocRemoval(supabase, jobId, remainingDocs, COJ_FORM_STATUSES) {
  if (!jobId || !supabase) return null;

  const sorted = sortCojDocsNewestFirst(remainingDocs);
  if (sorted.length === 0) {
    const { error } = await supabase
      .from('document_jobs')
      .update({
        status: COJ_FORM_STATUSES.DRAFT,
        filled_path: null,
        filled_by: null,
        field_values: {},
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    if (error) throw new Error(`Could not update form status: ${error.message}`);
    return COJ_FORM_STATUSES.DRAFT;
  }

  const latest = sorted[0];
  const nextStatus = COJ_FORM_STATUSES.WORKING_SAVED;

  const { error } = await supabase
    .from('document_jobs')
    .update({
      status: nextStatus,
      filled_path: latest.path,
      filled_by: isPrefilledCojPath(latest.path) ? 'autofill' : 'upload',
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  if (error) throw new Error(`Could not update form status: ${error.message}`);
  return nextStatus;
}