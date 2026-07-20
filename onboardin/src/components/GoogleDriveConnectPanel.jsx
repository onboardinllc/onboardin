import { useState, useEffect, useCallback } from 'react';
import {
  GOOGLE_GMAIL_OPTIN_WARNING,
} from '../lib/google-drive-processor.js';
import {
  GOOGLE_DRIVE_CONNECT_DISCLOSURE,
  fetchGoogleDriveIntegration,
  startGoogleDriveOAuth,
} from '../lib/google-drive-integration.js';

/**
 * Vault storage connect panel for Ticket #06 Phase A.
 */
export default function GoogleDriveConnectPanel({ supabase, session, clientProfile }) {
  const [integration, setIntegration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [gmailOptIn, setGmailOptIn] = useState(false);

  const storageMode = clientProfile?.storage_mode;
  const plan = clientProfile?.plan ?? 'starter';
  const showPanel = storageMode === 'drive' || storageMode === 'both' || plan === 'starter';

  const load = useCallback(async () => {
    if (!supabase || !session?.user?.id || !showPanel) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const row = await fetchGoogleDriveIntegration(supabase, session.user.id);
      setIntegration(row);
    } catch (e) {
      setError(e.message || 'Could not load Drive connection.');
    }
    setLoading(false);
  }, [supabase, session?.user?.id, showPanel]);

  useEffect(() => { load(); }, [load]);

  if (!showPanel) return null;

  async function handleConnect() {
    setConnecting(true);
    setError('');
    try {
      const data = await startGoogleDriveOAuth(supabase);
      if (data.auth_url) {
        window.location.href = data.auth_url;
        return;
      }
      if (data.status === 'pending' || data.message) {
        setError(data.message || 'Google Drive OAuth is not configured yet. Onboardin crew is finishing Google Cloud setup.');
      }
    } catch (e) {
      setError(e.message || 'Connect failed.');
    }
    setConnecting(false);
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl mb-6">
      <h3 className="text-sm uppercase tracking-widest text-gray-500 mb-1">Google Drive storage</h3>
      <p className="text-sm text-gray-400 leading-relaxed mb-4">{GOOGLE_DRIVE_CONNECT_DISCLOSURE}</p>

      {loading ? (
        <div className="h-8 w-40 bg-white/5 rounded animate-pulse" />
      ) : integration ? (
        <div className="flex items-center gap-2 text-sm text-emerald-300">
          <i className="ph ph-check-circle" aria-hidden="true" />
          Connected{integration.company_slug ? ` · ${integration.company_slug}` : ''}
        </div>
      ) : (
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-xs text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={gmailOptIn}
              onChange={(e) => setGmailOptIn(e.target.checked)}
            />
            <span>I use personal Gmail (not Google Workspace). {GOOGLE_GMAIL_OPTIN_WARNING}</span>
          </label>
          <button
            type="button"
            disabled={connecting}
            onClick={handleConnect}
            className="inline-flex items-center gap-2 py-2.5 px-4 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm font-medium text-white transition-colors disabled:opacity-40"
          >
            <i className="ph ph-google-logo text-base" aria-hidden="true" />
            {connecting ? 'Connecting…' : 'Connect Google Drive'}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-amber-200 mt-3">{error}</p>}
    </div>
  );
}
