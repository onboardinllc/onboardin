/** Member signature PNG — server-side only (client-documents + member_signatures). */

export function signatureStoragePath(userId) {
  return `${userId}/signatures/signature.png`;
}

export async function fetchActiveMemberSignature(supabase, userId) {
  const { data, error } = await supabase
    .from('member_signatures')
    .select('storage_path, uploaded_at')
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function signaturePreviewUrl(supabase, storagePath) {
  if (!storagePath) return null;
  const { data, error } = await supabase.storage
    .from('client-documents')
    .createSignedUrl(storagePath, 3600);
  if (error) return null;
  return data?.signedUrl || null;
}

/**
 * Upload/replace signature PNG. Uses remove+upload (storage has no client UPDATE policy).
 * DB: insert new active row, then deactivate others.
 */
export async function uploadMemberSignaturePng(supabase, session, file) {
  if (!file || !session?.user?.id) return { error: 'Not signed in.' };
  if (file.type && file.type !== 'image/png') return { error: 'Please upload a PNG file.' };

  const userId = session.user.id;
  const path = signatureStoragePath(userId);

  const existing = await fetchActiveMemberSignature(supabase, userId).catch(() => null);
  if (existing?.storage_path) {
    await supabase.storage.from('client-documents').remove([existing.storage_path]);
  }

  const { error: uploadErr } = await supabase.storage
    .from('client-documents')
    .upload(path, file, { contentType: 'image/png', upsert: false });
  if (uploadErr) return { error: uploadErr.message || 'Upload failed.' };

  const { data: inserted, error: insertErr } = await supabase
    .from('member_signatures')
    .insert({
      user_id: userId,
      storage_path: path,
      mime_type: 'image/png',
      active: true,
    })
    .select('id, storage_path')
    .single();
  if (insertErr) {
    await supabase.storage.from('client-documents').remove([path]);
    return { error: insertErr.message || 'Could not save signature record.' };
  }

  if (inserted?.id) {
    await supabase
      .from('member_signatures')
      .update({ active: false })
      .eq('user_id', userId)
      .neq('id', inserted.id);
  }

  const previewUrl = await signaturePreviewUrl(supabase, path);
  return { storagePath: path, previewUrl };
}