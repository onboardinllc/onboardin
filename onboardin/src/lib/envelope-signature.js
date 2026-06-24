/**
 * Envelope signer PNG path assert + path builder.
 * No Supabase imports — pure helpers.
 *
 * Storage path format (invitees upload to their own uid prefix — RLS allows first segment = auth.uid()):
 *   {signerUserId}/envelope-signatures/{envelopeId}/{signerRowId}.png
 */

// Regex mirrors the storage path format exactly.
// All three UUID segments are required; no subdirectories beyond envelopeId.
export const ENVELOPE_SIG_PATH_RE =
  /^[0-9a-f-]{36}\/envelope-signatures\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Throws if the envelope signature path is invalid or does not belong to signerUserId.
 * Call on every upload and read of envelope signer PNGs.
 */
export function assertEnvelopeSignaturePathForUser(signerUserId, path) {
  if (!signerUserId || !path) throw new Error('Envelope signature path or signer user id missing.');
  if (!ENVELOPE_SIG_PATH_RE.test(path)) {
    throw new Error(`Envelope signature path format invalid: ${path}`);
  }
  if (!path.startsWith(`${signerUserId}/`)) {
    throw new Error('Envelope signature path does not belong to this signer.');
  }
}

/**
 * Build the storage path for a signer's envelope PNG.
 * All segments must be valid UUIDs.
 */
export function envelopeSignatureStoragePath(signerUserId, envelopeId, signerRowId) {
  if (!signerUserId || !envelopeId || !signerRowId) {
    throw new Error('All three UUID args required for envelope signature path.');
  }
  if (!UUID_RE.test(signerUserId)) throw new Error(`Invalid signerUserId: ${signerUserId}`);
  if (!UUID_RE.test(envelopeId)) throw new Error(`Invalid envelopeId: ${envelopeId}`);
  if (!UUID_RE.test(signerRowId)) throw new Error(`Invalid signerRowId: ${signerRowId}`);
  const path = `${signerUserId}/envelope-signatures/${envelopeId}/${signerRowId}.png`;
  // Self-assert before returning (belt and suspenders)
  assertEnvelopeSignaturePathForUser(signerUserId, path);
  return path;
}
