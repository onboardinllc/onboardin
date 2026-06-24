import React, { useState, useEffect, useCallback } from 'react';
import { resolveCompanyContext, resolveFieldValues } from '../lib/company-context';
import { resolveTemplate } from '../lib/document-templates';
import {
  assertSignedDocumentPath,
  SIGNED_DOC_PREVIEW_TTL_SEC,
} from '../lib/member-signature';
import {
  createEnvelope,
  fetchActiveEnvelope,
  fetchEnvelopeSigners,
  voidEnvelope,
  sendInvites,
} from '../lib/document-envelope';
import DocumentSignOverlay from './DocumentSignOverlay';
import EnvelopeSignersPanel from './EnvelopeSignersPanel';
import { runDocumentAutofill } from '../lib/autofill-service.js';
import { canAutofillTemplate } from '../lib/pdf-field-map.js';
import { openDocumentUrl } from '../lib/open-document-url.js';

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhdGZpaWNwa3VuYWJwcGh3cWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzgyOTEsImV4cCI6MjA5NTkxNDI5MX0.00A9OEwex4Yeb4EXCy8vUtRXpCVPXmZDyXVHxl6XiVA';
const EDGE_BASE = 'https://qatfiicpkunabpphwqee.supabase.co/functions/v1';

function initiatorUrlStorageKey(envelopeId) {
  return `envelope-initiator-url-${envelopeId}`;
}

function readStoredInitiatorUrl(envelopeId) {
  try {
    return sessionStorage.getItem(initiatorUrlStorageKey(envelopeId));
  } catch {
    return null;
  }
}

function storeInitiatorUrl(envelopeId, url) {
  try {
    sessionStorage.setItem(initiatorUrlStorageKey(envelopeId), url);
  } catch {
    /* sessionStorage unavailable */
  }
}

/**
 * DocumentFillPanel - preview + assistant fill for a vault card template.
 * Props:
 *   cat - vault category object (id, label, templateUrl)
 *   clientProfile - clients row
 *   complianceIntake - active compliance intake answers (plain object)
 *   supabase - Supabase client
 *   session - auth session
 *   onClose - close callback
 *   onDocumentSigned - callback(doc) when signed PDF saved to vault (panel stays open)
 *   onGoToSignatureSettings - navigate to Overview signature card
 *   onSignatureUploaded - parent refreshes signature-on-file state after overlay upload
 */
export default function DocumentFillPanel({
  cat,
  clientProfile,
  complianceIntake,
  supabase,
  session,
  onClose,
  onDocumentSigned,
  onGoToSignatureSettings,
  onSignatureUploaded,
}) {
  const [phase, setPhase] = useState('preview'); // preview | confirm | filling | filled | signed | error
  const [template, setTemplate] = useState(null);
  const [context, setContext] = useState(null);
  const [fieldValues, setFieldValues] = useState({});
  const [jobId, setJobId] = useState(null);
  const [fillError, setFillError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showSign, setShowSign] = useState(false);
  const [currentJob, setCurrentJob] = useState(null);

  // Envelope state
  const [activeEnvelope, setActiveEnvelope] = useState(null);
  const [envelopeSigners, setEnvelopeSigners] = useState([]);
  const [showSignersPanel, setShowSignersPanel] = useState(false);
  const [envelopeError, setEnvelopeError] = useState('');
  const [envelopeLoading, setEnvelopeLoading] = useState(false);
  const [inviteUrls, setInviteUrls] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState('');
  const [sendingInvites, setSendingInvites] = useState(false);
  const [invitesSent, setInvitesSent] = useState(false);

  const isPaid = clientProfile?.plan === 'growth' || clientProfile?.plan === 'enterprise';

  const hasLlmKey = useCallback((t) => {
    if (!t?.placeholder_map) return false;
    return Object.values(t.placeholder_map).some((d) => d.llm);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError('');
      try {
        const t = await resolveTemplate({
          vaultCardId: cat.id,
          jurisdiction: clientProfile?.jurisdiction || '',
          country: clientProfile?.country || '',
          entityType: clientProfile?.entity_type || '',
        }, supabase);
        if (!t) { setLoadError('No template found for your entity type and jurisdiction.'); setLoading(false); return; }
        setTemplate(t);

        const formation_draft = clientProfile?.formation_draft || {};
        const ctx = resolveCompanyContext({
          client: clientProfile,
          formationDraft: formation_draft,
          complianceIntake: complianceIntake || {},
        });
        setContext(ctx);
        const previewFieldValues = resolveFieldValues(t.placeholder_map, ctx);

        const { data: existingJob } = await supabase
          .from('document_jobs')
          .select('*')
          .eq('client_id', clientProfile.id)
          .eq('template_id', t.id)
          .neq('status', 'voided')
          .maybeSingle();

        if (existingJob?.id) {
          setJobId(existingJob.id);
          if (existingJob.status === 'filled' || existingJob.status === 'pending_signatures' || existingJob.status === 'signed') {
            setFieldValues(existingJob.field_values || previewFieldValues);
            setCurrentJob(existingJob);
            setPhase(existingJob.status === 'signed' ? 'signed' : 'filled');
          } else {
            await supabase.from('document_jobs').update({
              field_values: previewFieldValues,
              updated_at: new Date().toISOString(),
            }).eq('id', existingJob.id);
            setFieldValues(previewFieldValues);
            setPhase('preview');
          }
        } else {
          const { data: newJob } = await supabase.from('document_jobs').insert({
            client_id: clientProfile.id,
            template_id: t.id,
            status: 'context_preview',
            field_values: previewFieldValues,
            credits_charged: 0,
          }).select('*').single();
          setJobId(newJob?.id || null);
          setFieldValues(previewFieldValues);
          setPhase('preview');
        }
      } catch (e) {
        setLoadError(e.message || 'Failed to load template.');
      }
      setLoading(false);
    }
    if (cat && clientProfile && session) load();
  }, [cat, clientProfile, complianceIntake, session, supabase]);

  const refreshEnvelopeState = useCallback(async () => {
    if (!jobId || !template?.multi_signer_enabled) return;
    try {
      const env = await fetchActiveEnvelope(supabase, jobId);
      setActiveEnvelope(env);
      if (env) {
        const signers = await fetchEnvelopeSigners(supabase, env.id);
        setEnvelopeSigners(signers);
        const storedInitiatorUrl = readStoredInitiatorUrl(env.id);
        if (storedInitiatorUrl) {
          setInviteUrls((prev) => prev ?? { initiator: storedInitiatorUrl });
        }
        if (env.status === 'pending') {
          const { data: job } = await supabase
            .from('document_jobs')
            .select('status')
            .eq('id', jobId)
            .maybeSingle();
          if (job?.status === 'pending_signatures') {
            setCurrentJob((prev) => (prev ? { ...prev, status: 'pending_signatures' } : prev));
          }
        }
      } else {
        setEnvelopeSigners([]);
        const { data: job } = await supabase
          .from('document_jobs')
          .select('*')
          .eq('id', jobId)
          .maybeSingle();
        if (job?.status === 'signed') {
          setCurrentJob(job);
          if (job.field_values) setFieldValues(job.field_values);
          setPhase('signed');
        }
      }
    } catch {
      // Non-fatal - envelope features degrade gracefully
    }
  }, [jobId, template, supabase]);

  // Load active envelope whenever jobId + template are available and multi-signer is enabled
  useEffect(() => {
    refreshEnvelopeState();
  }, [refreshEnvelopeState]);

  // Refresh when user returns from sign portal (new tab or OTP redirect)
  useEffect(() => {
    const onFocus = () => { refreshEnvelopeState(); };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onFocus();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshEnvelopeState]);

  const handleApplyFill = async () => {
    if (!jobId || !template || phase === 'filled' || phase === 'signed') return;
    if (!canAutofillTemplate(template)) {
      setFillError('This document is not configured for autofill yet.');
      setPhase('error');
      return;
    }
    setPhase('filling');
    setFillError('');
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      let valuesToFill = fieldValues;

      if (hasLlmKey(template)) {
        const res = await fetch(`${EDGE_BASE}/document-fill`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authSession.access_token}`,
            'apikey': ANON_KEY,
          },
          body: JSON.stringify({ job_id: jobId, template_id: template.id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Fill failed (${res.status})`);
        valuesToFill = json.field_values || fieldValues;
      }

      const formation_draft = clientProfile?.formation_draft || {};
      await runDocumentAutofill({
        supabase,
        session: authSession,
        clientProfile,
        formationDraft: formation_draft,
        complianceIntake: complianceIntake || {},
        template,
        jobId,
        fieldValues: valuesToFill,
      });

      setFieldValues(valuesToFill);
      setCurrentJob({
        id: jobId,
        field_values: valuesToFill,
        client_id: clientProfile.id,
        template_id: template.id,
        status: 'filled',
      });
      setPhase('filled');
    } catch (e) {
      setFillError(e.message || 'Fill failed. Try again.');
      setPhase('error');
    }
  };

  const handleCreateEnvelope = async (signers) => {
    setEnvelopeError('');
    setEnvelopeLoading(true);
    try {
      const result = await createEnvelope(supabase, {
        jobId,
        templateId: template.id,
        signers,
      });
      const env = await fetchActiveEnvelope(supabase, jobId);
      setActiveEnvelope(env);
      if (env) {
        const rows = await fetchEnvelopeSigners(supabase, env.id);
        setEnvelopeSigners(rows);
      }
      const urls = { initiator: result.initiator_invite_url, ...result.invite_urls };
      setInviteUrls(urls);
      if (result.envelope_id && result.initiator_invite_url) {
        storeInitiatorUrl(result.envelope_id, result.initiator_invite_url);
      }
      setShowSignersPanel(false);
    } catch (e) {
      if (e.code === 'upgrade_required') {
        setEnvelopeError('Request signatures requires a Growth or Enterprise plan.');
      } else {
        setEnvelopeError(e.message || 'Failed to create envelope.');
      }
    }
    setEnvelopeLoading(false);
  };

  const handleVoidEnvelope = async () => {
    if (!activeEnvelope) return;
    setEnvelopeError('');
    setEnvelopeLoading(true);
    try {
      await voidEnvelope(supabase, activeEnvelope.id);
      if (jobId) {
        await supabase
          .from('document_jobs')
          .update({ status: 'filled', updated_at: new Date().toISOString() })
          .eq('id', jobId)
          .eq('status', 'pending_signatures');
        setCurrentJob((prev) => (prev ? { ...prev, status: 'filled' } : prev));
      }
      try {
        sessionStorage.removeItem(initiatorUrlStorageKey(activeEnvelope.id));
      } catch { /* ignore */ }
      setActiveEnvelope(null);
      setEnvelopeSigners([]);
      setInviteUrls(null);
      setInvitesSent(false);
    } catch (e) {
      setEnvelopeError(e.message || 'Failed to void envelope.');
    }
    setEnvelopeLoading(false);
  };

  const handleSendInvites = async () => {
    if (!activeEnvelope) return;
    setSendingInvites(true);
    setEnvelopeError('');
    try {
      const result = await sendInvites(supabase, activeEnvelope.id);
      setInvitesSent(true);
      setCopyFeedback(`${result.sent} invite${result.sent !== 1 ? 's' : ''} sent.`);
      setTimeout(() => setCopyFeedback(''), 4000);
    } catch (e) {
      setEnvelopeError(e.message || 'Failed to send invites.');
    }
    setSendingInvites(false);
  };

  const envelopeActive = activeEnvelope && (activeEnvelope.status === 'draft' || activeEnvelope.status === 'pending');

  const initiatorSigner = envelopeSigners.find((s) => s.is_initiator);
  const initiatorInviteUrl = inviteUrls?.initiator
    ?? (activeEnvelope?.id ? readStoredInitiatorUrl(activeEnvelope.id) : null);
  const showInitiatorSignCta = activeEnvelope?.status === 'draft'
    && initiatorSigner?.status !== 'signed'
    && initiatorInviteUrl;

  const handleCopyUrl = async (url, label) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyFeedback(`${label} link copied`);
      setTimeout(() => setCopyFeedback(''), 2500);
    } catch {
      setCopyFeedback('Could not copy - select the link manually');
    }
  };

  const hasLlm = template ? hasLlmKey(template) : false;
  const displayFields = Object.entries(fieldValues).filter(([, v]) => v !== '__llm__' || phase === 'filled');
  const llmFields = Object.entries(fieldValues).filter(([, v]) => v === '__llm__');

  return (
    <>
      <div className="fixed inset-0 z-40 bg-[#03020a]/80 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-16 px-4">
        <div className="w-full max-w-lg bg-[#0e0c1a] border border-white/10 rounded-2xl shadow-2xl animate-[fadeIn_0.2s_ease-out]">

          {/* Header */}
          <div className="flex items-start justify-between p-6 border-b border-white/5">
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">{cat.label}</p>
              <h2 className="text-lg font-bold text-white">
                {phase === 'preview' || phase === 'confirm'
                  ? 'Fields pulled from your profile.'
                  : phase === 'filling'
                    ? 'Filling fields…'
                    : phase === 'filled'
                      ? 'Assistant filled your fields.'
                      : phase === 'signed'
                        ? 'Document signed.'
                        : 'Fill failed'}
              </h2>
              {(phase === 'preview' || phase === 'confirm') && (
                <p className="text-xs text-gray-500 mt-1">Review before signing.</p>
              )}
              {phase === 'filled' && (
                <p className="text-xs text-gray-500 mt-1">Not legal advice. Review before signing.</p>
              )}
              {phase === 'signed' && (
                <p className="text-xs text-gray-500 mt-1">Your signed copy is in your vault.</p>
              )}
            </div>
            <button onClick={onClose} className="text-gray-600 hover:text-gray-300 transition-colors mt-1">
              <i className="ph ph-x text-lg"></i>
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            {loading && (
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <i className="ph ph-spinner-gap animate-spin text-base"></i>
                Loading template…
              </div>
            )}

            {loadError && !loading && (
              <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-300">
                {loadError}
              </div>
            )}

            {!loading && !loadError && (
              <>
                {/* Field preview table */}
                <div className="space-y-2">
                  {displayFields.map(([key, val]) => (
                    <div key={key} className="flex items-start justify-between gap-3 py-2 border-b border-white/5 last:border-0">
                      <span className="text-xs uppercase tracking-widest text-gray-500 pt-0.5 capitalize flex-shrink-0">
                        {key.replace(/_/g, ' ')}
                      </span>
                      <span className={`text-sm text-right min-w-0 truncate ${val ? 'text-gray-200' : 'text-gray-600 italic'}`}>
                        {val || 'Not set'}
                      </span>
                    </div>
                  ))}
                  {llmFields.length > 0 && phase !== 'filled' && (
                    <div className="flex items-start justify-between gap-3 py-2 border-b border-white/5 last:border-0">
                      <span className="text-xs uppercase tracking-widest text-gray-500 pt-0.5 flex-shrink-0">
                        {llmFields.map(([k]) => k.replace(/_/g, ' ')).join(', ')}
                      </span>
                      <span className="text-sm text-right text-gray-600 italic">Filled by Assistant on apply</span>
                    </div>
                  )}
                </div>

                {/* Credit note */}
                {hasLlm && phase !== 'filled' && (
                  <p className="text-xs text-gray-500">
                    {hasLlm ? 'Assistant fills 1 field using AI. Uses 1 credit when you apply.' : 'No AI credits used.'}
                  </p>
                )}

                {fillError && (
                  <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-300">
                    {fillError}
                  </div>
                )}

                {/* Actions */}
                {phase === 'preview' && canAutofillTemplate(template) && (
                  <button
                    type="button"
                    onClick={() => setPhase('confirm')}
                    className="w-full py-2.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-xl text-sm uppercase tracking-widest text-purple-200 transition-all"
                  >
                    {hasLlmKey(template) ? 'Ask Assistant to fill' : 'Autofill from my info'}
                  </button>
                )}

                {phase === 'confirm' && (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg border border-white/5 bg-white/[0.02] text-xs text-gray-400">
                      Assistant will fill placeholders from your profile. Not legal advice. Review before signing.
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPhase('preview')}
                        className="py-2 px-4 border border-white/10 rounded-lg text-xs uppercase tracking-widest text-gray-500 hover:text-white transition-all"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={handleApplyFill}
                        className="flex-1 py-2.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-xl text-sm uppercase tracking-widest text-purple-200 transition-all"
                      >
                        Apply fill
                      </button>
                    </div>
                  </div>
                )}

                {phase === 'filling' && (
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <i className="ph ph-spinner-gap animate-spin text-base"></i>
                    Assistant is filling fields…
                  </div>
                )}

                {phase === 'filled' && !showSignersPanel && (
                  <div className="flex flex-col gap-2">
                    {/* Solo sign - disabled when envelope is active */}
                    <button
                      type="button"
                      onClick={() => setShowSign(true)}
                      disabled={!!envelopeActive}
                      title={envelopeActive ? 'Void the active envelope to sign solo.' : undefined}
                      className="w-full py-2.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-xl text-sm uppercase tracking-widest text-purple-200 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Fill &amp; sign with my info
                    </button>

                    {/* Multi-signer: JM template only */}
                    {template?.multi_signer_enabled && (
                      <>
                        {envelopeActive ? (
                          /* Envelope in progress */
                          <div className="space-y-3">
                            <div className="p-3 rounded-lg border border-purple-500/20 bg-purple-500/5">
                              <p className="text-xs uppercase tracking-widest text-purple-400 mb-2">
                                Signatures in progress
                              </p>
                              {envelopeSigners.map((s) => (
                                <div key={s.id} className="flex items-center justify-between py-1">
                                  <span className="text-xs text-gray-400 truncate">{s.display_name || s.email}</span>
                                  <span className={`text-xs uppercase tracking-widest ml-2 flex-shrink-0 ${
                                    s.status === 'signed' ? 'text-green-400' : s.status === 'opened' ? 'text-amber-400' : 'text-gray-600'
                                  }`}>
                                    {s.status === 'signed' ? 'Signed' : s.status === 'opened' ? 'Opened' : 'Pending'}
                                  </span>
                                </div>
                              ))}
                              {showInitiatorSignCta && (
                                <div className="mt-3 flex flex-col gap-2">
                                  <a
                                    href={initiatorInviteUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full py-2.5 text-center bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-xl text-sm uppercase tracking-widest text-purple-200 transition-all"
                                  >
                                    Sign now (Founder 1)
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyUrl(initiatorInviteUrl, 'Initiator')}
                                    className="w-full py-2 border border-white/10 rounded-lg text-xs uppercase tracking-widest text-gray-500 hover:text-gray-300 transition-all"
                                  >
                                    Copy initiator link
                                  </button>
                                  <p className="text-xs text-gray-600">
                                    Sign as Founder 1 before co-founders can be invited.
                                  </p>
                                </div>
                              )}
                              {/* Send invites CTA - show once initiator signed (envelope pending) */}
                              {activeEnvelope?.status === 'pending' && initiatorSigner?.status === 'signed' && (
                                <div className="mt-3 space-y-2">
                                  <button
                                    type="button"
                                    onClick={handleSendInvites}
                                    disabled={sendingInvites || envelopeLoading}
                                    className="w-full py-2.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-xl text-sm uppercase tracking-widest text-purple-200 transition-all disabled:opacity-40"
                                  >
                                    {sendingInvites ? 'Sending…' : invitesSent ? 'Resend invites' : 'Send invites'}
                                  </button>
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={handleVoidEnvelope}
                              disabled={envelopeLoading}
                              className="w-full py-2 border border-red-500/20 rounded-lg text-xs uppercase tracking-widest text-red-400 hover:border-red-500/40 transition-all disabled:opacity-40"
                            >
                              {envelopeLoading ? 'Voiding…' : 'Void envelope'}
                            </button>
                          </div>
                        ) : isPaid ? (
                          /* Paid - show Request signatures */
                          <button
                            type="button"
                            onClick={() => { setShowSignersPanel(true); setEnvelopeError(''); }}
                            className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm uppercase tracking-widest text-gray-300 transition-all"
                          >
                            Request signatures
                          </button>
                        ) : (
                          /* Starter - upgrade CTA */
                          <div className="p-3 rounded-lg border border-white/5 bg-white/[0.02] text-xs text-gray-500">
                            Request signatures is available on Growth and Enterprise plans.
                          </div>
                        )}
                      </>
                    )}

                    {envelopeError && (
                      <p className="text-sm text-red-300">{envelopeError}</p>
                    )}
                    {copyFeedback && (
                      <p className="text-xs text-green-400">{copyFeedback}</p>
                    )}

                    <a
                      href={template?.template_path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 text-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm uppercase tracking-widest text-gray-400 transition-all"
                    >
                      Download blank template
                    </a>
                  </div>
                )}

                {phase === 'filled' && showSignersPanel && (
                  <EnvelopeSignersPanel
                    multiSignerFieldMap={template?.multi_signer_field_map}
                    disabled={envelopeLoading}
                    onCancel={() => { setShowSignersPanel(false); setEnvelopeError(''); }}
                    onSubmit={handleCreateEnvelope}
                  />
                )}

                {phase === 'signed' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-green-400 text-sm">
                      <i className="ph ph-check-circle text-base"></i>
                      Signed copy saved to your vault.
                    </div>
                    {currentJob?.signed_path && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const vaultCardId = template?.vault_card_id || cat.id;
                            assertSignedDocumentPath(
                              clientProfile.id,
                              vaultCardId,
                              currentJob.signed_path,
                            );
                            const { data } = await supabase.storage
                              .from('client-documents')
                              .createSignedUrl(currentJob.signed_path, SIGNED_DOC_PREVIEW_TTL_SEC);
                            if (data?.signedUrl) openDocumentUrl(data.signedUrl);
                          } catch {
                            // Malformed path - do not open preview
                          }
                        }}
                        className="w-full py-2.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-xl text-sm uppercase tracking-widest text-purple-200 transition-all"
                      >
                        View signed document
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onClose}
                      className="w-full py-2.5 text-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm uppercase tracking-widest text-gray-400 transition-all"
                    >
                      Close
                    </button>
                  </div>
                )}

                {phase === 'error' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPhase('preview')}
                      className="flex-1 py-2.5 border border-white/10 rounded-xl text-sm uppercase tracking-widest text-gray-400 hover:text-white transition-all"
                    >
                      Back
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {showSign && currentJob && template && (
        <DocumentSignOverlay
          job={currentJob}
          template={template}
          clientProfile={clientProfile}
          supabase={supabase}
          session={session}
          onClose={() => setShowSign(false)}
          onGoToSignatureSettings={onGoToSignatureSettings}
          onSignatureUploaded={onSignatureUploaded}
          onSigned={(doc, signedPath) => {
            setShowSign(false);
            const path = signedPath || doc?.path;
            setCurrentJob((j) => ({
              ...(j || {
                id: jobId,
                client_id: clientProfile.id,
                template_id: template.id,
                field_values: fieldValues,
              }),
              status: 'signed',
              signed_path: path,
            }));
            setPhase('signed');
            onDocumentSigned?.(doc);
          }}
        />
      )}
    </>
  );
}
