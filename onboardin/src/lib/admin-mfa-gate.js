/**
 * Admin Console MFA gate (compliance #2, FTC Safeguards).
 * Crew with is_admin must reach AAL2 before member PII loads in Admin Console.
 */

/** @returns {Promise<{ currentLevel: string|null, nextLevel: string|null }>} */
export async function getAdminAssuranceLevel(supabase) {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return {
    currentLevel: data?.currentLevel ?? null,
    nextLevel: data?.nextLevel ?? null,
  };
}

/** @returns {Promise<{ verifiedTotp: object|null, unverifiedTotp: object|null }>} */
export async function listAdminTotpFactors(supabase) {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const totp = data?.totp ?? [];
  return {
    verifiedTotp: totp.find((f) => f.status === 'verified') ?? null,
    unverifiedTotp: totp.find((f) => f.status === 'unverified') ?? null,
  };
}

export function adminConsoleUnlocked(aal) {
  return aal?.currentLevel === 'aal2';
}

export function adminNeedsMfaStep(aal) {
  return aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2';
}

export async function enrollAdminTotp(supabase, friendlyName = 'Onboardin Admin') {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName,
    issuer: 'Onboardin',
  });
  if (error) throw error;
  return data;
}

export async function verifyAdminTotpCode(supabase, factorId, code) {
  const trimmed = String(code || '').replace(/\s/g, '');
  if (!trimmed) throw new Error('Enter the 6-digit code from your authenticator app.');
  const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeErr) throw challengeErr;
  const { error: verifyErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: trimmed,
  });
  if (verifyErr) throw verifyErr;
  const aal = await getAdminAssuranceLevel(supabase);
  if (!adminConsoleUnlocked(aal)) {
    throw new Error('Verification did not upgrade this session. Try signing out and back in.');
  }
  return aal;
}
