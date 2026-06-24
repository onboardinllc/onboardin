/** Member signature PNG - server-side only (client-documents + member_signatures). */

export const SIGNATURE_PREVIEW_TTL_SEC = 900;   // 15 min thumbnails
export const SIGNED_DOC_PREVIEW_TTL_SEC = 3600; // fill-panel view of signed doc

// ---------------------------------------------------------------------------
// Path format guards
// Security limits: RLS stops cross-user SELECT; signed URL still valid during TTL.
// ---------------------------------------------------------------------------

const SIG_PATH_RE = /^[0-9a-f-]{36}\/signatures\/signature-\d+\.png$/;
const SIGNED_DOC_PATH_RE = /^[0-9a-f-]{36}\/[\w]+\/signed-\d+\.pdf$/;
const VAULT_CARD_ID_RE = /^[\w]+$/; // alphanumeric + underscore

/**
 * Throws if path does not match ^{userId}/signatures/signature-\d+\.png$.
 * Call on upload and on every read before createSignedUrl / download.
 */
export function assertSignaturePathForUser(userId, path) {
  if (!userId || !path) throw new Error('Signature path or user id missing.');
  if (!SIG_PATH_RE.test(path)) throw new Error(`Signature path format invalid: ${path}`);
  if (!path.startsWith(`${userId}/`)) throw new Error('Signature path does not belong to this user.');
}

/**
 * Throws if path does not match ^{clientId}/{vaultCardId}/signed-\d+\.pdf$.
 * vaultCardId must be alphanumeric + underscore only.
 */
export function assertSignedDocumentPath(clientId, vaultCardId, path) {
  if (!clientId || !vaultCardId || !path) throw new Error('Signed document path args missing.');
  if (!VAULT_CARD_ID_RE.test(vaultCardId)) throw new Error(`Invalid vault card id: ${vaultCardId}`);
  if (!SIGNED_DOC_PATH_RE.test(path)) throw new Error(`Signed document path format invalid: ${path}`);
  if (!path.startsWith(`${clientId}/`)) throw new Error('Signed document path does not belong to this client.');
  if (!path.startsWith(`${clientId}/${vaultCardId}/`)) throw new Error('Signed document path vault card mismatch.');
}

/**
 * Returns { ok: true } or { error: string }.
 * Sign is blocked when clientProfile.id !== session.user.id (Phase D needs its own lane).
 */
export function assertMemberSignContext(session, clientProfile) {
  if (!session?.user?.id) return { error: 'Not signed in.' };
  if (!clientProfile?.id) return { error: 'Client profile missing.' };
  if (clientProfile.id !== session.user.id) {
    return { error: 'Sign context mismatch. Admin sign-on-behalf is not supported in this version.' };
  }
  return { ok: true };
}

/**
 * Validates PNG before storage upload.
 * Checks magic bytes (89 50 4E 47), size ≤ 500 KB, dimensions ≤ 2000×800.
 * Does not trust file.type alone - browsers may omit it.
 */
export async function validatePngFile(file) {
  if (!file) return { error: 'No file provided.' };
  if (file.size > 500 * 1024) return { error: 'Signature file must be 500 KB or smaller.' };

  // Magic bytes check
  const header = await readFileBytes(file, 4);
  if (!header || header[0] !== 0x89 || header[1] !== 0x50 || header[2] !== 0x4E || header[3] !== 0x47) {
    return { error: 'File is not a valid PNG.' };
  }

  // Dimension check via createImageBitmap (browser only; skip in non-browser env)
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const { width, height } = bitmap;
      bitmap.close();
      if (width > 2000 || height > 800) {
        return { error: `Signature image too large (${width}×${height}). Max 2000×800 px.` };
      }
    } catch {
      return { error: 'Could not read image dimensions. Please try a different PNG.' };
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

export function signatureStoragePath(userId, timestamp = Date.now()) {
  return `${userId}/signatures/signature-${timestamp}.png`;
}

export async function fetchActiveMemberSignature(supabase, userId) {
  const { data, error } = await supabase
    .from('member_signatures')
    .select('id, storage_path, uploaded_at')
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function signaturePreviewUrl(supabase, storagePath, userId) {
  if (!storagePath) return null;
  if (userId) assertSignaturePathForUser(userId, storagePath);
  const { data, error } = await supabase.storage
    .from('client-documents')
    .createSignedUrl(storagePath, SIGNATURE_PREVIEW_TTL_SEC);
  if (error) return null;
  return data?.signedUrl || null;
}

/**
 * Upload/replace signature PNG. Versioned storage path; deactivate-before-insert.
 * Old storage object removed only after new row is saved.
 */
export async function uploadMemberSignaturePng(supabase, session, file) {
  if (!file || !session?.user?.id) return { error: 'Not signed in.' };

  const validation = await validatePngFile(file);
  if (!validation.ok) return { error: validation.error };

  const userId = session.user.id;
  const path = signatureStoragePath(userId);

  assertSignaturePathForUser(userId, path); // guard before storage

  const existing = await fetchActiveMemberSignature(supabase, userId).catch(() => null);
  const previousId = existing?.id || null;
  const previousPath = existing?.storage_path || null;

  const { error: deactivateErr } = await supabase
    .from('member_signatures')
    .update({ active: false })
    .eq('user_id', userId)
    .eq('active', true);
  if (deactivateErr) {
    return { error: deactivateErr.message || 'Could not replace signature record.' };
  }

  const { error: uploadErr } = await supabase.storage
    .from('client-documents')
    .upload(path, file, { contentType: 'image/png', upsert: false });
  if (uploadErr) {
    if (previousId) {
      await supabase.from('member_signatures').update({ active: true }).eq('id', previousId);
    }
    return { error: uploadErr.message || 'Upload failed.' };
  }

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
    if (previousId) {
      await supabase.from('member_signatures').update({ active: true }).eq('id', previousId);
    }
    return { error: insertErr.message || 'Could not save signature record.' };
  }

  if (previousPath && previousPath !== path) {
    await supabase.storage.from('client-documents').remove([previousPath]);
  }

  const previewUrl = await signaturePreviewUrl(supabase, path, userId);
  return { storagePath: path, previewUrl };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function readFileBytes(file, count) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buf = e.target?.result;
      if (!buf || buf.byteLength < count) { resolve(null); return; }
      resolve(new Uint8Array(buf, 0, count));
    };
    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(file.slice(0, count));
  });
}
