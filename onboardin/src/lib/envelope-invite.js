/**
 * Token crypto, validation, email match for envelope invite links.
 * No Supabase imports - pure helpers callable in Node and browser.
 *
 * Security model:
 * - 32-byte random token → base64url raw URL once; DB stores sha256(token) only.
 * - Token validated server-side (sign-portal edge). Client only holds raw token from URL.
 * - Email binding enforced on every sign-portal action.
 */

const TOKEN_BYTES = 32;
const TOKEN_TTL_DAYS = 14;

// ---------------------------------------------------------------------------
// Token generation (browser + Node ≥18 via Web Crypto)
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random base64url token (32 bytes).
 * Returns { token: string, expiresAt: Date }.
 */
export async function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  const token = base64urlEncode(bytes);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  return { token, expiresAt };
}

/**
 * SHA-256 hash of a raw token string. Returns hex string.
 * DB stores this; never stores the raw token.
 */
export async function hashToken(token) {
  const encoded = new TextEncoder().encode(token);
  const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Validation helpers (pure - no DB access)
// ---------------------------------------------------------------------------

/**
 * Whether the envelope accepts signatures for this signer.
 * Initiator may sign while envelope is draft; invitees only when pending.
 */
export function envelopeOpenForSigning(envelope, signer) {
  if (!envelope) return false;
  if (envelope.status === 'pending') return true;
  if (envelope.status === 'draft' && signer?.is_initiator) return true;
  return false;
}

/**
 * Validate an invite token row fetched from DB (after hash lookup).
 * Returns { ok: true } | { error: string }.
 *
 * Caller must fetch the row by token_hash before calling this.
 *   invite:   { expires_at, revoked_at, opened_at }
 *   signer:   { status, is_initiator }
 *   envelope: { status }
 */
export function validateInviteToken(invite, signer, envelope) {
  if (!invite) return { error: 'Invite not found.' };
  if (invite.revoked_at) return { error: 'This invite link has been revoked.' };
  if (new Date(invite.expires_at) < new Date()) return { error: 'This invite link has expired.' };
  if (!envelopeOpenForSigning(envelope, signer)) return { error: 'Envelope is not open for signing.' };
  if (!signer || !['pending', 'opened'].includes(signer.status)) return { error: 'This signature slot is no longer available.' };
  return { ok: true };
}

/**
 * Assert signer email matches session email (case-insensitive).
 * Returns { ok: true } | { error: string }.
 * Call after auth on every sign-portal action.
 */
export function assertSignerEmailMatch(sessionEmail, signerEmail) {
  if (!sessionEmail || !signerEmail) return { error: 'Email identity missing.' };
  if (sessionEmail.toLowerCase() !== signerEmail.toLowerCase()) {
    return { error: 'Signed in email does not match this invite. Sign in as ' + signerEmail + '.' };
  }
  return { ok: true };
}

/**
 * Client-side pre-check before calling sign-portal actions.
 * Does not replace server enforcement - just surfaces errors early.
 */
export function assertSignerInviteContext(session, signerEmail) {
  if (!session?.user?.id) return { error: 'Not signed in.' };
  if (!session.user.email) return { error: 'Session email missing.' };
  return assertSignerEmailMatch(session.user.email, signerEmail);
}

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

/**
 * Build an invite URL for a given raw token.
 * Format: {origin}/#sign?token={token}
 * Works with SPA hash routing and current App.jsx route matching.
 */
export function buildInviteUrl(rawToken, origin = 'https://onboardin.llc') {
  if (!rawToken) throw new Error('rawToken required');
  return `${origin}/#sign?token=${encodeURIComponent(rawToken)}`;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function base64urlEncode(bytes) {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
