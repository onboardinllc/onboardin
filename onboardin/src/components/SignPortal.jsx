import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { LazySignatureCanvas } from '../lib/lazy-document-ui.jsx';

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhdGZpaWNwa3VuYWJwcGh3cWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzgyOTEsImV4cCI6MjA5NTkxNDI5MX0.00A9OEwex4Yeb4EXCy8vUtRXpCVPXmZDyXVHxl6XiVA';
const EDGE_BASE = 'https://qatfiicpkunabpphwqee.supabase.co/functions/v1';

function signedStorageKey(token) {
  return `sign-portal-signed-${token}`;
}

async function callPortal(accessToken, body) {
  const res = await fetch(`${EDGE_BASE}/sign-portal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || `sign-portal (${res.status})`), { status: res.status });
  return data;
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// phases: loading | invalid | needs_auth | otp_sent | context | signing | signed | error
export default function SignPortal({ token }) {
  const [phase, setPhase] = useState('loading');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isInitiator, setIsInitiator] = useState(false);
  const [context, setContext] = useState(null);
  const [session, setSession] = useState(null);
  const [otpEmail, setOtpEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sigFile, setSigFile] = useState(null);
  const [authMismatch, setAuthMismatch] = useState(false);
  const canvasKey = useRef(0);

  // Track auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // Step 1: validate_token
  useEffect(() => {
    if (!token) { setPhase('invalid'); return; }
    try {
      if (sessionStorage.getItem(signedStorageKey(token)) === '1') {
        setPhase('signed');
        return;
      }
    } catch { /* ignore */ }
    setPhase('loading');
    callPortal(null, { action: 'validate_token', token })
      .then((data) => {
        setMaskedEmail(data.masked_email);
        setDisplayName(data.display_name ?? '');
        setIsInitiator(data.is_initiator ?? false);
        if (data.already_signed) {
          try { sessionStorage.setItem(signedStorageKey(token), '1'); } catch { /* ignore */ }
          setPhase('signed');
          return;
        }
        setPhase('needs_auth');
      })
      .catch((e) => {
        try {
          if (sessionStorage.getItem(signedStorageKey(token)) === '1') {
            setPhase('signed');
            return;
          }
        } catch { /* ignore */ }
        setError(e.message);
        setPhase('invalid');
      });
  }, [token]);

  // Step 2: Once session is available after OTP, load context
  const loadContext = useCallback(async (activeSession) => {
    if (!token || !activeSession) return;
    setPhase('loading');
    setError('');
    try {
      const data = await callPortal(activeSession.access_token, { action: 'get_context', token });
      setContext(data);
      setPhase('context');
    } catch (e) {
      if (e.status === 403) {
        setAuthMismatch(true);
        setError('Signed-in email does not match this invite. Sign out to continue.');
        await supabase.auth.signOut();
        setSession(null);
        setPhase('needs_auth');
        return;
      }
      setError(e.message);
      setPhase('error');
    }
  }, [token]);

  // When session appears (after OTP redirect or already authed), go to context
  useEffect(() => {
    if (phase === 'needs_auth' && session) {
      loadContext(session);
    }
  }, [phase, session, loadContext]);

  const handleSendOtp = async () => {
    if (!otpEmail.trim()) return;
    setError('');
    setAuthMismatch(false);
    try {
      const origin = window.location.origin;
      const emailRedirectTo = `${origin}/#sign?token=${encodeURIComponent(token)}`;
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: otpEmail.trim(),
        options: { emailRedirectTo },
      });
      if (otpErr) throw otpErr;
      setOtpSent(true);
    } catch (e) {
      setError(e.message || 'Failed to send sign-in link.');
    }
  };

  const handleCanvasExport = useCallback((file) => {
    setSigFile(file);
  }, []);

  const handleSign = async () => {
    if (!sigFile || !session || !token) return;
    setSaving(true);
    setError('');
    try {
      const base64 = await fileToBase64(sigFile);
      await callPortal(session.access_token, {
        action: 'save_signature',
        token,
        png_base64: base64,
      });
      try {
        sessionStorage.setItem(signedStorageKey(token), '1');
      } catch { /* ignore */ }
      setPhase('signed');
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  // Shared shell
  return (
    <div className="min-h-screen flex items-start justify-center py-16 px-4">
      <div className="w-full max-w-md bg-[#0e0c1a] border border-white/10 rounded-2xl shadow-2xl">
        <div className="p-6 border-b border-white/5">
          <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">Document signing</p>
          <h1 className="text-lg font-bold text-white">
            {phase === 'signed' ? 'Signature submitted.' : 'Sign your document'}
          </h1>
        </div>

        <div className="p-6 space-y-4">
          {/* Loading */}
          {phase === 'loading' && (
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <i className="ph ph-spinner-gap animate-spin text-base"></i>
              Loading…
            </div>
          )}

          {/* Invalid / expired */}
          {phase === 'invalid' && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-300">
                {error || 'This invite link is invalid or has expired.'}
              </div>
            </div>
          )}

          {/* Needs auth */}
          {phase === 'needs_auth' && (
            <div className="space-y-4">
              {authMismatch && (
                <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-sm text-amber-200">
                  {error}
                </div>
              )}
              <p className="text-sm text-gray-400">
                You have been invited to sign as <span className="text-gray-200">{maskedEmail}</span>.
                Enter your email address to receive a sign-in link.
              </p>
              {!otpSent ? (
                <>
                  <input
                    type="email"
                    placeholder="Your email address"
                    value={otpEmail}
                    onChange={(e) => setOtpEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/40"
                  />
                  {error && <p className="text-sm text-red-300">{error}</p>}
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    className="w-full py-2.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-xl text-sm uppercase tracking-widest text-purple-200 transition-all"
                  >
                    Send sign-in link
                  </button>
                </>
              ) : (
                <div className="p-3 rounded-lg border border-white/5 bg-white/[0.02] text-sm text-gray-400">
                  Check your inbox for a sign-in link. The link will return you to this signing page.
                </div>
              )}
            </div>
          )}

          {/* Context: show fields + canvas */}
          {phase === 'context' && context && (
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">
                  {context.template_label}
                </p>
                {context.display_name && (
                  <p className="text-sm text-gray-400">Signing as {context.display_name}</p>
                )}
                {context.is_initiator && (
                  <div className="mt-2 px-2 py-1 rounded bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300 inline-block">
                    Initiator
                  </div>
                )}
              </div>

              {/* Read-only field preview */}
              {Object.entries(context.field_values || {}).length > 0 && (
                <div className="space-y-1">
                  {Object.entries(context.field_values).map(([key, val]) => {
                    if (!val || val === '__llm__') return null;
                    return (
                      <div key={key} className="flex justify-between gap-3 py-1.5 border-b border-white/5 last:border-0">
                        <span className="text-xs uppercase tracking-widest text-gray-600 capitalize flex-shrink-0">
                          {key.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-gray-400 text-right truncate">{String(val)}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Signature fields */}
              {context.signer_field_keys.filter((k) => {
                const def = context.assigned_field_map?.[k];
                return def?.type === 'signature';
              }).length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-widest text-gray-500">Your signature</p>
                  <LazySignatureCanvas
                    key={canvasKey.current}
                    compact
                    onExport={handleCanvasExport}
                    disabled={saving}
                  />
                  {sigFile && (
                    <p className="text-xs text-green-400">Signature captured. Press Sign to submit.</p>
                  )}
                </div>
              )}

              {error && <p className="text-sm text-red-300">{error}</p>}

              <button
                type="button"
                onClick={handleSign}
                disabled={!sigFile || saving}
                className="w-full py-2.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-xl text-sm uppercase tracking-widest text-purple-200 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {saving ? 'Submitting…' : 'Sign document'}
              </button>
            </div>
          )}

          {/* Error state (get_context failure) */}
          {phase === 'error' && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-300">
                {error || 'Failed to load signing context.'}
              </div>
              <button
                type="button"
                onClick={() => session && loadContext(session)}
                className="w-full py-2.5 border border-white/10 rounded-xl text-sm uppercase tracking-widest text-gray-400 hover:text-white transition-all"
              >
                Retry
              </button>
            </div>
          )}

          {/* Signed */}
          {phase === 'signed' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <i className="ph ph-check-circle text-base"></i>
                Your signature has been submitted.
              </div>
              {isInitiator && (
                <p className="text-xs text-gray-500">
                  Return to your vault to track co-founder signature progress.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
