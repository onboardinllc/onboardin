import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  COJ_PACKET_FORMS,
  COJ_FORM_IDS,
  COJ_FORM_STATUSES,
  assertWorkingCopyPath,
} from '../lib/coj-formation-packet.js';
import { parseFormationDraft, buildDraftPatch } from '../lib/formation-draft-persist.js';
import { markFiledManual } from '../lib/filing-adapter.js';
import { applyCojAutofill } from '../lib/coj-prefill.js';
import { resolveCompanyContext, resolveCojFieldValues } from '../lib/company-context.js';

/**
 * CojFormationPacketPanel
 * Props:
 *   clientProfile       — clients row (id, country, jurisdiction, entity_type, formation_draft, …)
 *   supabase            — Supabase client
 *   session             — auth session
 *   onClose             — close callback
 *   onWorkingCopySaved  — callback(doc) called after upload records to vault
 *   formationDraft      — current local draft state (object)
 *   onDraftChange       — callback(patch) for debounced autosave in parent
 */
export default function CojFormationPacketPanel({
  clientProfile,
  supabase,
  session,
  onClose,
  onWorkingCopySaved,
  formationDraft,
  onDraftChange,
}) {
  const clientId = session?.user?.id;

  const [jobs, setJobs] = useState({});
  const [docsByForm, setDocsByForm] = useState({});
  const [templatesByKind, setTemplatesByKind] = useState({});
  const [loading, setLoading] = useState(true);
  const [uploadingForm, setUploadingForm] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [filingForm, setFilingForm] = useState(null);
  const [filingError, setFilingError] = useState('');
  const [autofillForm, setAutofillForm] = useState(null);
  const [autofillError, setAutofillError] = useState('');
  const [previewOpen, setPreviewOpen] = useState({});

  const draft = parseFormationDraft(formationDraft);

  const fileInputRefs = useRef({});

  const bootstrapJobs = useCallback(async () => {
    if (!supabase || !clientId) return;
    setLoading(true);
    setUploadError('');

    const { data: templates } = await supabase
      .from('legal_templates')
      .select('id, kind, label, template_path, placeholder_map, field_map, form_version')
      .eq('jurisdiction', 'Jamaica')
      .eq('entity_type', 'Ltd')
      .eq('provider', 'coj')
      .in('kind', COJ_FORM_IDS);

    const templateByKind = {};
    for (const t of templates || []) templateByKind[t.kind] = t;

    const { data: existingJobs } = await supabase
      .from('document_jobs')
      .select('id, template_id, status, created_at, updated_at')
      .eq('client_id', clientId)
      .in('template_id', Object.values(templateByKind).map((t) => t.id));

    const jobByTemplateId = {};
    for (const j of existingJobs || []) jobByTemplateId[j.template_id] = j;

    const jobByKind = {};
    for (const [kind, template] of Object.entries(templateByKind)) {
      if (jobByTemplateId[template.id]) {
        jobByKind[kind] = { ...jobByTemplateId[template.id], kind };
        continue;
      }
      const { data: newJob, error: insertErr } = await supabase
        .from('document_jobs')
        .insert({
          client_id: clientId,
          template_id: template.id,
          status: COJ_FORM_STATUSES.DRAFT,
        })
        .select('id, template_id, status, created_at, updated_at')
        .maybeSingle();
      if (newJob) {
        jobByKind[kind] = { ...newJob, kind };
        continue;
      }
      if (insertErr) {
        const { data: existing } = await supabase
          .from('document_jobs')
          .select('id, template_id, status, created_at, updated_at')
          .eq('client_id', clientId)
          .eq('template_id', template.id)
          .neq('status', COJ_FORM_STATUSES.VOIDED)
          .maybeSingle();
        if (existing) jobByKind[kind] = { ...existing, kind };
      }
    }

    const { data: docs } = await supabase
      .from('documents')
      .select('id, name, path, size, category, created_at')
      .eq('client_id', clientId)
      .in('category', COJ_FORM_IDS);

    const byForm = {};
    for (const d of docs || []) {
      if (!byForm[d.category]) byForm[d.category] = [];
      byForm[d.category].push(d);
    }

    setJobs(jobByKind);
    setDocsByForm(byForm);
    setTemplatesByKind(templateByKind);
    setLoading(false);
  }, [supabase, clientId]);

  useEffect(() => {
    bootstrapJobs();
  }, [bootstrapJobs]);

  const handleDraftField = (field, value) => {
    const updated = { ...draft, [field]: value };
    onDraftChange?.(buildDraftPatch(updated));
  };

  const handleDirectorChange = (idx, field, value) => {
    const directors = [...(draft.directors || [])];
    directors[idx] = { ...directors[idx], [field]: value };
    onDraftChange?.(buildDraftPatch({ ...draft, directors }));
  };

  const addDirector = () => {
    const directors = [...(draft.directors || []), { name: '', address: '', trn: '' }];
    onDraftChange?.(buildDraftPatch({ ...draft, directors }));
  };

  const removeDirector = (idx) => {
    const directors = (draft.directors || []).filter((_, i) => i !== idx);
    onDraftChange?.(buildDraftPatch({ ...draft, directors }));
  };

  const handleShareholderChange = (idx, field, value) => {
    const shareholders = [...(draft.shareholders || [])];
    shareholders[idx] = { ...shareholders[idx], [field]: value };
    onDraftChange?.(buildDraftPatch({ ...draft, shareholders }));
  };

  const addShareholder = () => {
    const shareholders = [...(draft.shareholders || []), { name: '', address: '', trn: '', shares: '' }];
    onDraftChange?.(buildDraftPatch({ ...draft, shareholders }));
  };

  const removeShareholder = (idx) => {
    const shareholders = (draft.shareholders || []).filter((_, i) => i !== idx);
    onDraftChange?.(buildDraftPatch({ ...draft, shareholders }));
  };

  const handleUpload = async (formDef, file) => {
    if (!supabase || !clientId || !file) return;
    setUploadingForm(formDef.form_id);
    setUploadError('');

    try {
      assertWorkingCopyPath(clientId, formDef.form_id);
    } catch (e) {
      setUploadError(e.message);
      setUploadingForm(null);
      return;
    }

    const ts = Date.now();
    const ext = file.name.split('.').pop() || 'pdf';
    const path = `${clientId}/articles/${formDef.form_id}/working-${ts}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('client-documents')
      .upload(path, file, { contentType: file.type || 'application/pdf' });

    if (uploadErr) {
      setUploadError(`Upload failed: ${uploadErr.message}`);
      setUploadingForm(null);
      return;
    }

    const doc = {
      client_id: clientId,
      name: file.name,
      path,
      size: file.size,
      category: formDef.form_id,
      uploaded_by: clientId,
    };

    const { data: insertedDoc, error: dbErr } = await supabase
      .from('documents')
      .insert(doc)
      .select('id, name, path, size, category, created_at')
      .maybeSingle();

    if (dbErr) {
      await supabase.storage.from('client-documents').remove([path]);
      setUploadError(`Upload failed: could not record in vault (${dbErr.message})`);
      setUploadingForm(null);
      return;
    }

    const job = jobs[formDef.form_id];
    if (job?.id) {
      await supabase
        .from('document_jobs')
        .update({ status: COJ_FORM_STATUSES.WORKING_SAVED, updated_at: new Date().toISOString() })
        .eq('id', job.id);
      setJobs((prev) => ({
        ...prev,
        [formDef.form_id]: { ...prev[formDef.form_id], status: COJ_FORM_STATUSES.WORKING_SAVED },
      }));
    }

    const newDoc = insertedDoc || { ...doc, created_at: new Date().toISOString() };
    setDocsByForm((prev) => ({
      ...prev,
      [formDef.form_id]: [newDoc, ...(prev[formDef.form_id] || [])],
    }));
    onWorkingCopySaved?.(newDoc);
    setUploadingForm(null);
  };

  const handleMarkFiled = async (formDef) => {
    const job = jobs[formDef.form_id];
    if (!job?.id || !supabase) return;
    setFilingForm(formDef.form_id);
    setFilingError('');
    try {
      await markFiledManual(supabase, job.id);
      setJobs((prev) => ({
        ...prev,
        [formDef.form_id]: { ...prev[formDef.form_id], status: COJ_FORM_STATUSES.FILED_PENDING },
      }));
    } catch (e) {
      setFilingError(e.message);
    }
    setFilingForm(null);
  };

  const handleAutofill = async (formDef) => {
    const template = templatesByKind[formDef.form_id];
    const job = jobs[formDef.form_id];
    if (!template || !job?.id) return;
    setAutofillForm(formDef.form_id);
    setAutofillError('');
    try {
      const { doc } = await applyCojAutofill({
        supabase,
        session,
        clientProfile,
        formationDraft: draft,
        template,
        jobId: job.id,
        formId: formDef.form_id,
      });
      setJobs((prev) => ({
        ...prev,
        [formDef.form_id]: { ...prev[formDef.form_id], status: COJ_FORM_STATUSES.PREFILLED },
      }));
      setDocsByForm((prev) => ({
        ...prev,
        [formDef.form_id]: [doc, ...(prev[formDef.form_id] || [])],
      }));
      onWorkingCopySaved?.(doc);
    } catch (e) {
      setAutofillError(e.message || 'Autofill failed.');
    }
    setAutofillForm(null);
  };

  const resolvedPreview = (formId) => {
    const template = templatesByKind[formId];
    if (!template?.placeholder_map) return {};
    const context = resolveCompanyContext({
      client: clientProfile,
      formationDraft: draft,
      complianceIntake: {},
    });
    const values = resolveCojFieldValues(template, context);
    return Object.fromEntries(Object.entries(values).filter(([, v]) => String(v).trim()));
  };

  const hasFieldMap = (formId) => {
    const tm = templatesByKind[formId];
    return tm && Object.keys(tm.field_map || {}).length > 0;
  };

  const getSignedUrl = async (path) => {
    if (!supabase) return;
    const { data } = await supabase.storage.from('client-documents').createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const statusLabel = (formId) => {
    const job = jobs[formId];
    if (!job) return null;
    switch (job.status) {
      case COJ_FORM_STATUSES.PREFILLED:     return { text: 'Autofilled', cls: 'text-purple-300 bg-purple-500/10 border-purple-500/20' };
      case COJ_FORM_STATUSES.WORKING_SAVED: return { text: 'Prepared', cls: 'text-blue-300 bg-blue-500/10 border-blue-500/20' };
      case COJ_FORM_STATUSES.FILED_PENDING: return { text: 'Filed', cls: 'text-amber-300 bg-amber-500/10 border-amber-500/20' };
      case COJ_FORM_STATUSES.READY_TO_FILE: return { text: 'Ready to file', cls: 'text-green-300 bg-green-500/10 border-green-500/20' };
      default: return null;
    }
  };

  const savedCount = COJ_FORM_IDS.filter((id) => (docsByForm[id] || []).length > 0).length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#03020a]/95 backdrop-blur-xl overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#03020a]/80 backdrop-blur-sm">
        <div>
          <p className="text-xs uppercase tracking-widest text-purple-400">Formation Packet</p>
          <h2 className="text-base font-bold text-white">Jamaica Ltd Incorporation</h2>
        </div>
        <div className="flex items-center gap-4">
          {!loading && (
            <span className="text-sm text-gray-500">{savedCount}/{COJ_PACKET_FORMS.length} forms saved</span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors p-1"
            aria-label="Close"
          >
            <i className="ph ph-x text-lg"></i>
          </button>
        </div>
      </div>

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 space-y-8">
        <p className="text-sm text-gray-400 leading-relaxed">
          Prepare your COJ forms here. File at the Companies Office when ready. Working copies stay in your vault so you can continue on any device.
        </p>

        {loading ? (
          <div className="text-center py-12 text-gray-600 text-sm">Loading formation packet...</div>
        ) : (
          <>
            {uploadError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-300">{uploadError}</div>
            )}
            {filingError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-300">{filingError}</div>
            )}
            {autofillError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-300">{autofillError}</div>
            )}

            {/* Form steps */}
            <div className="space-y-3">
              {COJ_PACKET_FORMS.map((formDef) => {
                const pill = statusLabel(formDef.form_id);
                const formDocs = docsByForm[formDef.form_id] || [];
                const job = jobs[formDef.form_id];
                const isFiled = job?.status === COJ_FORM_STATUSES.FILED_PENDING;
                const isUploading = uploadingForm === formDef.form_id;
                const isFiling = filingForm === formDef.form_id;

                const isAutofilling = autofillForm === formDef.form_id;
                const canAutofill = hasFieldMap(formDef.form_id) && !isAutofilling;
                const preview = previewOpen[formDef.form_id] ? resolvedPreview(formDef.form_id) : null;

                return (
                  <div key={formDef.form_id} className="border border-white/10 rounded-xl p-4 space-y-3 bg-white/[0.02]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <i className="ph ph-file-text text-gray-500 flex-shrink-0 text-base"></i>
                        <span className="text-sm font-semibold text-white truncate">{formDef.label}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {pill && (
                          <span className={`text-xs uppercase tracking-widest px-2 py-0.5 rounded-full border ${pill.cls}`}>
                            {pill.text}
                          </span>
                        )}
                        <a
                          href={formDef.download_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400/80 hover:text-blue-300 transition-colors"
                          title="Download official PDF"
                        >
                          <i className="ph ph-file-arrow-down text-base"></i>
                        </a>
                      </div>
                    </div>

                    <p className="text-xs text-gray-600 leading-relaxed">
                      This is your working copy. Filing happens at COJ — not through Onboardin until you submit there.
                    </p>

                    {/* Autofill block */}
                    {hasFieldMap(formDef.form_id) && (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setPreviewOpen((p) => ({ ...p, [formDef.form_id]: !p[formDef.form_id] }))}
                          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                        >
                          <i className={`ph ${previewOpen[formDef.form_id] ? 'ph-caret-up' : 'ph-caret-down'} text-xs`}></i>
                          {previewOpen[formDef.form_id] ? 'Hide field preview' : 'Preview autofill fields'}
                        </button>

                        {preview && Object.keys(preview).length > 0 && (
                          <div className="bg-black/30 rounded-lg p-3 space-y-1 text-xs">
                            {Object.entries(preview).map(([k, v]) => (
                              <div key={k} className="flex gap-2">
                                <span className="text-gray-600 shrink-0 w-40 truncate">{k}</span>
                                <span className="text-gray-300 truncate flex-1">{v}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {preview && Object.keys(preview).length === 0 && (
                          <p className="text-xs text-gray-600">Fill in Company Details below to preview autofill values.</p>
                        )}

                        <button
                          type="button"
                          disabled={!canAutofill}
                          onClick={() => handleAutofill(formDef)}
                          className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-purple-400 hover:text-purple-300 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                        >
                          <i className="ph ph-sparkle text-xs"></i>
                          {isAutofilling ? 'Filling...' : 'Autofill from my info'}
                        </button>
                        <p className="text-xs text-gray-600 leading-relaxed">
                          Filled from your profile and packet details. Review before filing at COJ. Not legal advice.
                        </p>
                      </div>
                    )}

                    {formDocs.length > 0 && (
                      <div className="space-y-1">
                        {formDocs.map((doc, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => getSignedUrl(doc.path)}
                            className="w-full flex items-center gap-2 p-2 bg-black/20 rounded-lg hover:bg-black/40 cursor-pointer transition-all group text-left"
                          >
                            <i className="ph ph-file text-gray-500 group-hover:text-blue-400 transition-colors flex-shrink-0 text-base"></i>
                            <span className="text-sm text-gray-400 truncate flex-1 group-hover:text-gray-200">{doc.name}</span>
                            <i className="ph ph-download-simple text-gray-600 group-hover:text-blue-400 transition-colors flex-shrink-0 text-base"></i>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-3 flex-wrap">
                      <label
                        className={`flex items-center gap-1.5 text-xs uppercase tracking-widest cursor-pointer transition-colors ${isUploading ? 'text-gray-600 pointer-events-none' : 'text-purple-400 hover:text-purple-300'}`}
                      >
                        <input
                          ref={(el) => { fileInputRefs.current[formDef.form_id] = el; }}
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg"
                          className="hidden"
                          disabled={isUploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUpload(formDef, file);
                            e.target.value = '';
                          }}
                        />
                        <i className="ph ph-upload text-xs"></i>
                        {isUploading ? 'Saving...' : formDocs.length > 0 ? 'Upload new version' : 'Upload working copy'}
                      </label>

                      {!isFiled && formDocs.length > 0 && (
                        <button
                          type="button"
                          disabled={isFiling}
                          onClick={() => handleMarkFiled(formDef)}
                          className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50"
                        >
                          <i className="ph ph-check-circle text-xs"></i>
                          {isFiling ? 'Marking...' : 'Mark filed at COJ'}
                        </button>
                      )}

                      {formDef.portal_url && (
                        <a
                          href={formDef.portal_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-gray-500 hover:text-gray-300 transition-colors"
                        >
                          <i className="ph ph-arrow-square-out text-xs"></i>
                          COJ portal
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Issued Certificate outcome row */}
              <div className="border border-green-400/20 rounded-xl p-4 bg-green-400/[0.03] space-y-2">
                <div className="flex items-center gap-2">
                  <i className="ph ph-certificate text-green-400 text-base"></i>
                  <span className="text-sm font-semibold text-white">Certificate of Incorporation</span>
                  <span className="text-xs uppercase tracking-widest text-green-400 bg-green-400/10 border border-green-400/20 px-2 py-0.5 rounded-full ml-auto">Issued by COJ</span>
                </div>
                <p className="text-xs text-gray-600">COJ issues this after processing your submission. Upload it to your vault when received.</p>
                <p className="text-xs text-gray-500">Upload via the Certificate of Incorporation card in your vault.</p>
              </div>
            </div>

            {/* Formation draft editor */}
            <div className="space-y-5 border border-white/10 rounded-xl p-5 bg-white/[0.02]">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white uppercase tracking-widest">Company Details</h3>
                <span className="text-xs text-gray-600">Auto-saved</span>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-widest text-gray-500 mb-1">Proposed company name</label>
                  <input
                    type="text"
                    value={draft.proposed_company_name || ''}
                    onChange={(e) => handleDraftField('proposed_company_name', e.target.value)}
                    placeholder="ACME Ltd"
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-widest text-gray-500 mb-1">Registered office address</label>
                  <input
                    type="text"
                    value={draft.registered_office_address || ''}
                    onChange={(e) => handleDraftField('registered_office_address', e.target.value)}
                    placeholder="14 Camp Road, Kingston, Jamaica"
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-widest text-gray-500 mb-1">Authorized share capital</label>
                  <input
                    type="text"
                    value={draft.authorized_share_capital || ''}
                    onChange={(e) => handleDraftField('authorized_share_capital', e.target.value)}
                    placeholder="1,000,000 ordinary shares"
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-all"
                  />
                </div>

                {/* Directors */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs uppercase tracking-widest text-gray-500">Directors</label>
                    <button
                      type="button"
                      onClick={addDirector}
                      className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      + Add director
                    </button>
                  </div>
                  {(draft.directors || []).map((dir, idx) => (
                    <div key={idx} className="bg-black/30 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600">Director {idx + 1}</span>
                        {(draft.directors || []).length > 1 && (
                          <button type="button" onClick={() => removeDirector(idx)} className="text-xs text-red-400/60 hover:text-red-400 transition-colors">Remove</button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={dir.name || ''}
                        onChange={(e) => handleDirectorChange(idx, 'name', e.target.value)}
                        placeholder="Full name"
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-all"
                      />
                      <input
                        type="text"
                        value={dir.address || ''}
                        onChange={(e) => handleDirectorChange(idx, 'address', e.target.value)}
                        placeholder="Address"
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-all"
                      />
                      <input
                        type="text"
                        value={dir.trn || ''}
                        onChange={(e) => handleDirectorChange(idx, 'trn', e.target.value)}
                        placeholder="TRN"
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-all"
                      />
                    </div>
                  ))}
                </div>

                {/* Shareholders */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs uppercase tracking-widest text-gray-500">Shareholders</label>
                    <button
                      type="button"
                      onClick={addShareholder}
                      className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      + Add shareholder
                    </button>
                  </div>
                  {(draft.shareholders || []).map((sh, idx) => (
                    <div key={idx} className="bg-black/30 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600">Shareholder {idx + 1}</span>
                        {(draft.shareholders || []).length > 1 && (
                          <button type="button" onClick={() => removeShareholder(idx)} className="text-xs text-red-400/60 hover:text-red-400 transition-colors">Remove</button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={sh.name || ''}
                        onChange={(e) => handleShareholderChange(idx, 'name', e.target.value)}
                        placeholder="Full name"
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-all"
                      />
                      <input
                        type="text"
                        value={sh.address || ''}
                        onChange={(e) => handleShareholderChange(idx, 'address', e.target.value)}
                        placeholder="Address"
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-all"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={sh.trn || ''}
                          onChange={(e) => handleShareholderChange(idx, 'trn', e.target.value)}
                          placeholder="TRN"
                          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-all"
                        />
                        <input
                          type="text"
                          value={sh.shares || ''}
                          onChange={(e) => handleShareholderChange(idx, 'shares', e.target.value)}
                          placeholder="Shares"
                          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-all"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-widest text-gray-500 mb-1">BOR notes</label>
                  <textarea
                    value={draft.bor_notes || ''}
                    onChange={(e) => handleDraftField('bor_notes', e.target.value)}
                    placeholder="Notes on beneficial ownership (optional)"
                    rows={3}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-all resize-none"
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
