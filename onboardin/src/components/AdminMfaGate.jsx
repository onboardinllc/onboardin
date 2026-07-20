import { useCallback, useEffect, useState } from 'react';
import {
  adminConsoleUnlocked,
  adminNeedsMfaStep,
  enrollAdminTotp,
  getAdminAssuranceLevel,
  listAdminTotpFactors,
  verifyAdminTotpCode,
} from '../lib/admin-mfa-gate';

/**
 * Blocks Admin Console until the crew account is at Supabase AAL2 (TOTP verified).
 * Compliance item #2 engineering slice; org MFA still required in Supabase dashboard.
 */
export default function AdminMfaGate({ supabase, session, onReady, onSignOut }) {
  const [phase, setPhase] = useState('loading');
  const [error, setError] = useState('');
  const [enroll, setEnroll] = useState(null);
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const finishIfReady = useCallback(async () => {
    const aal = await getAdminAssuranceLevel(supabase);
    if (adminConsoleUnlocked(aal)) {
      onReady();
      return true;
    }
    return false;
  }, [supabase, onReady]);

  const bootstrap = useCallback(async () => {
    setError('');
    setPhase('loading');
    try {
      if (await finishIfReady()) return;

      const aal = await getAdminAssuranceLevel(supabase);
      const { verifiedTotp, unverifiedTotp } = await listAdminTotpFactors(supabase);

      if (verifiedTotp && adminNeedsMfaStep(aal)) {
        setFactorId(verifiedTotp.id);
        setPhase('verify');
        return;
      }

      if (unverifiedTotp) {
        setFactorId(unverifiedTotp.id);
        setEnroll({
          qr_code: null,
          secret: null,
          resume: true,
        });
        setPhase('enroll');
        return;
      }

      setPhase('intro');
    } catch (e) {
      setError(e.message || 'Could not load MFA status.');
      setPhase('error');
    }
  }, [supabase, finishIfReady]);

  useEffect(() => {
    if (!supabase || !session?.user?.id) return;
    bootstrap();
  }, [supabase, session?.user?.id, bootstrap]);

  const startEnroll = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await enrollAdminTotp(supabase);
      setFactorId(data.id);
      setEnroll({
        qr_code: data.totp?.qr_code ?? null,
        secret: data.totp?.secret ?? null,
        resume: false,
      });
      setPhase('enroll');
    } catch (e) {
      setError(e.message || 'Enrollment failed. Confirm MFA is enabled in Supabase Auth settings.');
    }
    setBusy(false);
  };

  const submitCode = async () => {
    if (!factorId) return;
    setBusy(true);
    setError('');
    try {
      await verifyAdminTotpCode(supabase, factorId, code);
      setCode('');
      onReady();
    } catch (e) {
      setError(e.message || 'Invalid code. Try again.');
    }
    setBusy(false);
  };

  const email = session?.user?.email ?? 'admin';

  return (
    <div className="pt-32 px-4 sm:px-8 md:px-16 min-h-screen relative z-10">
      <div className="max-w-lg mx-auto bg-black/40 border border-white/10 rounded-2xl p-8 backdrop-blur-xl">
        <p className="text-xs uppercase tracking-widest text-purple-300 mb-2">Admin Console</p>
        <h1 className="text-2xl font-bold text-white mb-2">Multi-factor sign-in required</h1>
        <p className="text-sm text-gray-400 mb-6">
          Crew access to member tax IDs and government IDs requires an authenticator app. Password alone is not enough.
        </p>
        <p className="text-xs text-gray-500 mb-6">{email}</p>

        {error && (
          <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {phase === 'loading' && (
          <p className="text-sm text-gray-500">Checking MFA status…</p>
        )}

        {phase === 'intro' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-300">
              Set up a TOTP app (1Password, Google Authenticator, Authy) for this admin account. You will scan a QR code once, then enter a 6-digit code each session.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={startEnroll}
              className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold uppercase tracking-wider transition-colors disabled:opacity-50"
            >
              Set up authenticator
            </button>
          </div>
        )}

        {(phase === 'enroll' || phase === 'verify') && (
          <div className="space-y-4">
            {phase === 'enroll' && enroll?.qr_code && (
              <div className="flex flex-col items-center gap-3 bg-black/30 rounded-xl p-4">
                <img src={enroll.qr_code} alt="Authenticator QR code" className="w-44 h-44 bg-white rounded-lg p-2" />
                {enroll.secret && (
                  <p className="text-xs text-gray-500 break-all text-center font-mono">{enroll.secret}</p>
                )}
              </div>
            )}
            {phase === 'enroll' && enroll?.resume && !enroll.qr_code && (
              <p className="text-sm text-gray-400">Finish verifying the authenticator you started. Enter the current 6-digit code.</p>
            )}
            {phase === 'verify' && (
              <p className="text-sm text-gray-400">Enter the 6-digit code from your authenticator app.</p>
            )}
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-center text-lg tracking-[0.3em] text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50"
            />
            <button
              type="button"
              disabled={busy || !code.trim()}
              onClick={submitCode}
              className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold uppercase tracking-wider transition-colors disabled:opacity-50"
            >
              Verify and open console
            </button>
          </div>
        )}

        {phase === 'error' && (
          <button
            type="button"
            onClick={bootstrap}
            className="w-full py-3 rounded-xl border border-white/20 text-gray-300 text-sm uppercase tracking-wider hover:bg-white/5"
          >
            Retry
          </button>
        )}

        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="mt-6 w-full text-xs uppercase tracking-widest text-gray-600 hover:text-gray-400"
          >
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}
