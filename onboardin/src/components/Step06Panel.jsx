import React, { useState } from 'react';
import {
  COMPLIANCE_DISCLAIMER,
  TERMLY_URL,
  evaluateAcceptCriteria,
  isIntakeComplete,
  isIntakeQuestionAnswered,
  isStepRequired,
  mergeProfileIntoIntake,
  shouldShowIntakeQuestion,
} from '../lib/compliance';

const STATUS_COLORS = {
  active: 'text-green-300 bg-green-400/10 border-green-400/20',
  draft: 'text-yellow-300 bg-yellow-400/10 border-yellow-400/20',
  superseded: 'text-gray-400 bg-white/5 border-white/10',
  expired: 'text-red-300 bg-red-400/10 border-red-400/20',
};

export default function Step06Panel({
  locked,
  onUpgrade,
  blueprint,
  intake,
  setIntake,
  artifacts,
  docs,
  clientProfile,
  supabase,
  session,
  onRefreshArtifacts,
  onRefreshDocs,
  onCompleteStep,
  completingStep,
  stepError,
  currentStep,
}) {
  const [savingIntake, setSavingIntake] = useState(false);
  const [intakeError, setIntakeError] = useState('');
  const [artifactUrl, setArtifactUrl] = useState({});
  const [artifactSaving, setArtifactSaving] = useState(null);
  const [artifactError, setArtifactError] = useState('');
  const [proofUploading, setProofUploading] = useState(null);

  if (locked) {
    return (
      <div className="mt-6 bg-gradient-to-br from-purple-500/5 to-blue-500/5 border border-purple-500/15 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-3">
          <i className="ph ph-shield-check text-purple-300 text-xl"></i>
          <h4 className="text-sm uppercase tracking-widest text-gray-400">Step 06 — Privacy & Compliance</h4>
          <span className="ml-auto text-xs uppercase tracking-widest text-purple-300 bg-purple-400/10 border border-purple-400/20 px-2 py-0.5 rounded-full">Growth</span>
        </div>
        <p className="text-base text-gray-500 leading-relaxed mb-4">
          Privacy policy, data protection registration, cookie consent, and proof uploads — guided by jurisdiction-specific procedures.
        </p>
        <button type="button" onClick={onUpgrade} className="text-sm uppercase tracking-widest text-purple-300 border border-purple-500/30 px-3 py-2 rounded-lg hover:bg-purple-500/10 transition-all">
          Unlock with Growth →
        </button>
      </div>
    );
  }

  if (!blueprint) {
    return (
      <div className="mt-6 bg-white/5 border border-white/10 rounded-xl p-6">
        <p className="text-sm text-gray-500 italic">Loading compliance procedure…</p>
      </div>
    );
  }

  const mergedIntake = mergeProfileIntoIntake(intake, clientProfile, blueprint.intake_questions || []);
  const { pass, missing } = evaluateAcceptCriteria(blueprint, mergedIntake, artifacts, docs);
  const intakeDone = isIntakeComplete(blueprint, mergedIntake);
  const canComplete = pass && currentStep === 5;

  const saveIntake = async () => {
    if (!supabase || !session) return;
    setSavingIntake(true);
    setIntakeError('');
    const questions = blueprint.intake_questions || [];
    const visible = questions.filter((q) => shouldShowIntakeQuestion(q, mergedIntake));
    const incomplete = visible.filter((q) => q.required && !isIntakeQuestionAnswered(q, mergedIntake));
    if (incomplete.length) {
      setIntakeError(`Answer required: ${incomplete.map((q) => q.label).join(', ')}`);
      setSavingIntake(false);
      return;
    }
    const clientUpdates = {};
    for (const q of questions) {
      if (q.maps_to?.startsWith('clients.')) {
        const field = q.maps_to.replace('clients.', '');
        if (mergedIntake[q.id] != null) clientUpdates[field] = mergedIntake[q.id];
      }
    }
    if (Object.keys(clientUpdates).length) {
      const { error: clientErr } = await supabase.from('clients').update({ ...clientUpdates, updated_at: new Date().toISOString() }).eq('id', session.user.id);
      if (clientErr) {
        setIntakeError(clientErr.message);
        setSavingIntake(false);
        return;
      }
    }
    const existing = artifacts.find((a) => a.kind === 'compliance_intake');
    const payload = {
      client_id: session.user.id,
      kind: 'compliance_intake',
      label: 'Compliance intake',
      jurisdiction: blueprint.jurisdiction || 'multi',
      artifact_path: JSON.stringify(mergedIntake),
      status: 'active',
      source: 'upload',
      procedure_version: `${blueprint.id}@${blueprint.last_researched || 'v1'}`,
    };
    const { error: artErr } = existing
      ? await supabase.from('compliance_artifacts').update(payload).eq('id', existing.id)
      : await supabase.from('compliance_artifacts').insert(payload);
    if (artErr) {
      setIntakeError(artErr.message);
      setSavingIntake(false);
      return;
    }
    setIntake(mergedIntake);
    await onRefreshArtifacts();
    setSavingIntake(false);
  };

  const saveArtifactUrl = async (step) => {
    if (!supabase || !session) return;
    const kind = step.artifact_kind || step.id;
    const url = (artifactUrl[kind] || '').trim();
    if (!url) {
      setArtifactError('Enter a valid URL');
      return;
    }
    setArtifactSaving(kind);
    setArtifactError('');
    const existing = artifacts.find((a) => a.kind === kind && a.status !== 'superseded');
    const row = {
      client_id: session.user.id,
      kind,
      label: step.title,
      jurisdiction: blueprint.jurisdiction || 'multi',
      hosted_url: url,
      status: 'active',
      source: 'upload',
      effective_at: new Date().toISOString(),
      procedure_version: `${blueprint.id}@${blueprint.last_researched || 'v1'}`,
    };
    const { error: saveErr } = existing
      ? await supabase.from('compliance_artifacts').update({ ...row, status: 'active' }).eq('id', existing.id)
      : await supabase.from('compliance_artifacts').insert(row);
    if (saveErr) {
      setArtifactError(saveErr.message);
      setArtifactSaving(null);
      return;
    }
    setArtifactSaving(null);
    await onRefreshArtifacts();
  };

  const acknowledgeStep = async (step) => {
    if (!supabase || !session) return;
    const kind = step.artifact_kind || step.id;
    setArtifactSaving(kind);
    const existing = artifacts.find((a) => a.kind === kind);
    const row = {
      client_id: session.user.id,
      kind,
      label: step.title,
      jurisdiction: blueprint.jurisdiction || 'multi',
      status: 'active',
      source: 'upload',
      procedure_version: `${blueprint.id}@${blueprint.last_researched || 'v1'}`,
    };
    const { error: ackErr } = existing
      ? await supabase.from('compliance_artifacts').update(row).eq('id', existing.id)
      : await supabase.from('compliance_artifacts').insert(row);
    if (ackErr) {
      setArtifactError(ackErr.message);
      setArtifactSaving(null);
      return;
    }
    setArtifactSaving(null);
    await onRefreshArtifacts();
  };

  const uploadProof = async (e, step) => {
    const file = e.target.files?.[0];
    const proof = step.vault_proof;
    if (!file || !proof || !supabase || !session) return;
    setProofUploading(proof.category);
    setArtifactError('');
    const path = `${session.user.id}/compliance/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from('client-documents').upload(path, file);
    if (upErr) {
      setArtifactError(upErr.message);
      setProofUploading(null);
      return;
    }
    const { error: docErr } = await supabase.from('documents').insert({
      client_id: session.user.id,
      name: file.name,
      path,
      size: file.size,
      uploaded_by: session.user.id,
      category: proof.category,
    });
    if (docErr) {
      setArtifactError(docErr.message);
      setProofUploading(null);
      return;
    }
    const kind = step.artifact_kind || step.id;
    const existing = artifacts.find((a) => a.kind === kind);
    const row = {
      client_id: session.user.id,
      kind,
      label: step.title,
      jurisdiction: blueprint.jurisdiction || 'multi',
      artifact_path: path,
      status: 'active',
      source: 'upload',
      procedure_version: `${blueprint.id}@${blueprint.last_researched || 'v1'}`,
    };
    const { error: artErr } = existing
      ? await supabase.from('compliance_artifacts').update(row).eq('id', existing.id)
      : await supabase.from('compliance_artifacts').insert(row);
    if (artErr) {
      setArtifactError(artErr.message);
      setProofUploading(null);
      return;
    }
    await onRefreshDocs();
    await onRefreshArtifacts();
    setProofUploading(null);
    e.target.value = '';
  };

  const renderIntakeField = (q) => {
    const val = mergedIntake[q.id];
    const setVal = (v) => setIntake((prev) => ({ ...prev, [q.id]: v }));
    if (q.type === 'boolean') {
      return (
        <div className="flex gap-2">
          {[{ v: true, l: 'Yes' }, { v: false, l: 'No' }].map((opt) => (
            <button key={String(opt.v)} type="button" onClick={() => setVal(opt.v)}
              className={`text-xs uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all ${val === opt.v ? 'border-purple-500/50 bg-purple-500/20 text-purple-200' : 'border-white/10 text-gray-500 hover:border-white/20'}`}>
              {opt.l}
            </button>
          ))}
        </div>
      );
    }
    if (q.type === 'select') {
      return (
        <select value={val ?? ''} onChange={(e) => setVal(e.target.value)}
          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50" style={{ colorScheme: 'dark' }}>
          <option value="">Select…</option>
          {(q.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (q.type === 'multiselect') {
      const selected = Array.isArray(val) ? val : [];
      return (
        <div className="flex flex-wrap gap-2">
          {(q.options || []).map((o) => {
            const on = selected.includes(o);
            return (
              <button key={o} type="button" onClick={() => setVal(on ? selected.filter((x) => x !== o) : [...selected, o])}
                className={`text-xs uppercase tracking-widest px-2.5 py-1 rounded-lg border transition-all ${on ? 'border-purple-500/50 bg-purple-500/20 text-purple-200' : 'border-white/10 text-gray-500'}`}>
                {o}
              </button>
            );
          })}
        </div>
      );
    }
    return (
      <input type={q.type === 'url' ? 'url' : 'text'} value={val ?? ''} onChange={(e) => setVal(e.target.value)}
        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50" placeholder={q.type === 'url' ? 'https://…' : ''} />
    );
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="bg-gradient-to-br from-purple-500/5 to-blue-500/5 border border-purple-500/15 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <i className="ph ph-shield-check text-purple-300 text-lg"></i>
          <h4 className="text-sm uppercase tracking-widest text-gray-300">Step 06 — Privacy & Compliance</h4>
          {intakeDone && pass && <span className="ml-auto text-xs uppercase tracking-widest text-green-300 bg-green-400/10 border border-green-400/20 px-2 py-0.5 rounded-full">Ready</span>}
        </div>
        <p className="text-sm text-gray-500 leading-relaxed">{blueprint.description}</p>
        <p className="text-xs text-gray-600 mt-2 italic">{COMPLIANCE_DISCLAIMER}</p>
      </div>

      {/* Intake */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <h5 className="text-xs uppercase tracking-widest text-gray-500 mb-4">Intake</h5>
        <div className="space-y-4">
          {(blueprint.intake_questions || []).filter((q) => shouldShowIntakeQuestion(q, mergedIntake)).map((q) => (
            <div key={q.id}>
              <label className="block text-sm text-gray-400 mb-1.5">{q.label}{q.required && <span className="text-purple-400 ml-1">*</span>}</label>
              {q.helper && <p className="text-xs text-gray-500 mb-2 leading-relaxed">{q.helper}</p>}
              {renderIntakeField(q)}
            </div>
          ))}
        </div>
        {intakeError && <p className="text-xs text-red-400 mt-3">{intakeError}</p>}
        <button type="button" onClick={saveIntake} disabled={savingIntake}
          className="mt-4 text-xs uppercase tracking-widest text-purple-300 border border-purple-500/30 px-3 py-2 rounded-lg hover:bg-purple-500/10 transition-all disabled:opacity-40">
          {savingIntake ? 'Saving…' : intakeDone ? 'Update intake' : 'Save intake'}
        </button>
      </div>

      {/* Checklist */}
      {intakeDone && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h5 className="text-xs uppercase tracking-widest text-gray-500 mb-4">Checklist</h5>
          <div className="space-y-3">
            {(blueprint.steps || []).filter((s) => s.action_type !== 'intake' && isStepRequired(s, mergedIntake)).map((step) => {
              const kind = step.artifact_kind || step.id;
              const art = artifacts.find((a) => a.kind === kind && a.status === 'active');
              const proof = step.vault_proof;
              const hasProof = proof && docs.some((d) => d.category === proof.category);
              const done = art && (art.hosted_url || art.artifact_path) || (step.action_type === 'acknowledge' && art) || (proof?.required && hasProof);
              return (
                <div key={step.id} className={`border rounded-lg p-4 ${done ? 'border-green-500/20 bg-green-500/5' : 'border-white/10'}`}>
                  <div className="flex items-start gap-2">
                    <i className={`ph ${done ? 'ph-check-circle text-green-400' : 'ph-circle-dashed text-gray-600'} text-base mt-0.5`}></i>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 font-medium">{step.title}</p>
                      {step.description && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{step.description}</p>}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {step.partner?.slug === 'termly' && (
                          <a href={step.partner.url || TERMLY_URL} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs uppercase tracking-widest text-blue-300 border border-blue-400/25 px-2.5 py-1 rounded-lg hover:bg-blue-400/10">
                            Open Termly <i className="ph ph-arrow-up-right text-xs"></i>
                          </a>
                        )}
                        {step.url && !step.partner && (
                          <a href={step.url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs uppercase tracking-widest text-blue-300 border border-blue-400/25 px-2.5 py-1 rounded-lg hover:bg-blue-400/10">
                            {step.cta || 'Open portal'} <i className="ph ph-arrow-up-right text-xs"></i>
                          </a>
                        )}
                        {step.action_type === 'acknowledge' && !done && (
                          <button type="button" onClick={() => acknowledgeStep(step)} disabled={artifactSaving === kind}
                            className="text-xs uppercase tracking-widest text-purple-300 border border-purple-500/30 px-2.5 py-1 rounded-lg hover:bg-purple-500/10 disabled:opacity-40">
                            {artifactSaving === kind ? '…' : 'Acknowledge'}
                          </button>
                        )}
                      </div>
                      {(step.action_type === 'artifact' || step.action_type === 'upload') && !done && (
                        <div className="mt-3 flex flex-col sm:flex-row gap-2">
                          <input type="url" value={artifactUrl[kind] || ''} onChange={(e) => setArtifactUrl((p) => ({ ...p, [kind]: e.target.value }))}
                            placeholder="Published URL (optional)"
                            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/50" />
                          <button type="button" onClick={() => saveArtifactUrl(step)} disabled={artifactSaving === kind}
                            className="text-xs uppercase tracking-widest text-purple-300 border border-purple-500/30 px-3 py-1.5 rounded-lg hover:bg-purple-500/10 disabled:opacity-40 whitespace-nowrap">
                            {artifactSaving === kind ? '…' : "I've published — save URL"}
                          </button>
                        </div>
                      )}
                      {proof && (
                        <div className="mt-3">
                          <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-gray-500 border border-white/10 px-2.5 py-1 rounded-lg hover:border-purple-500/30 hover:text-purple-300 transition-all">
                            <i className="ph ph-upload-simple"></i>
                            {proofUploading === proof.category ? 'Uploading…' : `Upload ${proof.label}`}
                            <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => uploadProof(e, step)} disabled={!!proofUploading} />
                          </label>
                          {hasProof && <span className="ml-2 text-xs text-green-400">Proof on file</span>}
                        </div>
                      )}
                      {artifactError && <p className="text-xs text-red-400 mt-2">{artifactError}</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Artifacts */}
      {artifacts.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h5 className="text-xs uppercase tracking-widest text-gray-500 mb-3">Artifacts</h5>
          <div className="space-y-2">
            {artifacts.filter((a) => a.kind !== 'compliance_intake').map((a) => (
              <div key={a.id} className="flex items-center gap-3 py-2 px-3 bg-black/20 rounded-lg">
                <i className="ph ph-file-text text-gray-500"></i>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-300 truncate">{a.label}</p>
                  {a.hosted_url && <p className="text-xs text-blue-400 truncate">{a.hosted_url}</p>}
                </div>
                <span className={`text-xs uppercase tracking-widest border px-2 py-0.5 rounded-full ${STATUS_COLORS[a.status] || STATUS_COLORS.draft}`}>{a.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Complete step */}
      {currentStep === 5 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          {!pass && missing.length > 0 && (
            <p className="text-xs text-gray-500 mb-3">Still needed: {missing.join(' · ')}</p>
          )}
          {stepError && <p className="text-xs text-red-400 mb-3">{stepError}</p>}
          <button type="button" onClick={onCompleteStep} disabled={!canComplete || completingStep}
            className="w-full py-3 bg-purple-500/20 border border-purple-500/30 rounded-lg text-sm font-bold uppercase tracking-wider text-purple-200 hover:bg-purple-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            title={!canComplete ? 'Complete all checklist items first' : 'Advance to Landing Page Deployed'}>
            {completingStep ? '…' : 'Mark step complete'}
          </button>
        </div>
      )}
    </div>
  );
}