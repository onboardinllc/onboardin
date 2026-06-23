import React, { useState, useEffect, useCallback } from 'react';
import { resolveCompanyContext, resolveFieldValues } from '../lib/company-context';
import { resolveTemplate } from '../lib/document-templates';
import DocumentSignOverlay from './DocumentSignOverlay';

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhdGZpaWNwa3VuYWJwcGh3cWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzgyOTEsImV4cCI6MjA5NTkxNDI5MX0.00A9OEwex4Yeb4EXCy8vUtRXpCVPXmZDyXVHxl6XiVA';
const EDGE_BASE = 'https://qatfiicpkunabpphwqee.supabase.co/functions/v1';

/**
 * DocumentFillPanel — preview + assistant fill for a vault card template.
 * Props:
 *   cat           — vault category object (id, label, templateUrl)
 *   clientProfile — clients row
 *   complianceIntake — active compliance intake answers (plain object)
 *   supabase      — Supabase client
 *   session       — auth session
 *   onClose       — close callback
 *   onDocumentSigned — callback(doc) when signed PDF saved to vault
 */
export default function DocumentFillPanel({
  cat,
  clientProfile,
  complianceIntake,
  supabase,
  session,
  onClose,
  onDocumentSigned,
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
          if (existingJob.status === 'filled' || existingJob.status === 'signed') {
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

  const handleApplyFill = async () => {
    if (!jobId || !template || phase === 'filled' || phase === 'signed') return;
    setPhase('filling');
    setFillError('');
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
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
      const updatedFieldValues = json.field_values || fieldValues;
      const updatedJobId = json.job_id || jobId;
      setFieldValues(updatedFieldValues);
      setJobId(updatedJobId);
      setCurrentJob({
        id: updatedJobId,
        field_values: updatedFieldValues,
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
                {phase === 'preview' && (
                  <button
                    type="button"
                    onClick={() => setPhase('confirm')}
                    className="w-full py-2.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-xl text-sm uppercase tracking-widest text-purple-200 transition-all"
                  >
                    Ask Assistant to fill
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

                {phase === 'filled' && (
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => setShowSign(true)}
                      className="w-full py-2.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-xl text-sm uppercase tracking-widest text-purple-200 transition-all"
                    >
                      Sign document
                    </button>
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

                {phase === 'signed' && (
                  <div className="flex items-center gap-2 text-green-400 text-sm">
                    <i className="ph ph-check-circle text-base"></i>
                    Signed copy saved to your vault. Close this panel to view it in your documents.
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
          onSigned={(doc) => {
            setShowSign(false);
            if (onDocumentSigned) onDocumentSigned(doc);
          }}
        />
      )}
    </>
  );
}
