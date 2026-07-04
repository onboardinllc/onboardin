import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  COJ_PACKET_FORMS,
  COJ_FORM_IDS,
  COJ_FORM_STATUSES,
  assertWorkingCopyPath,
  canCojAutofill,
  isCojTemplateLinked,
} from '../lib/coj-formation-packet.js';
import { parseFormationDraft, buildDraftPatch } from '../lib/formation-draft-persist.js';
import { markFiledManual } from '../lib/filing-adapter.js';
import { applyCojAutofill } from '../lib/coj-prefill.js';
import {
  reconcileCojJobAfterDocRemoval,
  removeCojDocuments,
  sortCojDocsNewestFirst,
  upsertCojWorkingCopy,
} from '../lib/coj-documents.js';
import { cojWorkingCopyCanonicalPath } from '../lib/coj-formation-packet.js';
import { resolveEntityFacts, resolveCojFieldValues } from '../lib/company-context.js';
import { openStorageDocument } from '../lib/open-document-url.js';

/**
 * CojFormationPacketPanel
 * Props:
 *   clientProfile - clients row (id, country, jurisdiction, entity_type, formation_draft, …)
 *   supabase - Supabase client
 *   session - auth session
 *   onClose - close callback
 *   onWorkingCopySaved - callback(doc) called after upload records to vault
 *   onDocumentRemoved - callback(doc) after delete from vault
 *   formationDraft - current local draft state (object)
 *   onDraftChange - callback(patch) for debounced autosave in parent
 *   draftSaveStatus - 'idle' | 'saving' | 'saved' | 'error'
 */
export default function CojFormationPacketPanel({
  clientProfile,
  supabase,
  session,
  onClose,
  onWorkingCopySaved,
  onDocumentRemoved,
  onProfileHarvested,
  formationDraft,
  onDraftChange,
  draftSaveStatus = 'idle',
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
  const [deletingDocId, setDeletingDocId] = useState(null);
  const [deleteError, setDeleteError] = useState('');

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
    for (const formId of Object.keys(byForm)) {
      byForm[formId] = sortCojDocsNewestFirst(byForm[formId]);
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

    try {
      const path = cojWorkingCopyCanonicalPath(clientId, formDef.form_id);
      const buffer = await file.arrayBuffer();
      const insertedDoc = await upsertCojWorkingCopy(supabase, {
        clientId,
        formId: formDef.form_id,
        pdfBytes: new Uint8Array(buffer),
        displayName: file.name || `${formDef.label} - working copy.pdf`,
        fileSize: file.size,
      });

      const job = jobs[formDef.form_id];
      if (job?.id) {
        await supabase
          .from('document_jobs')
          .update({
            status: COJ_FORM_STATUSES.WORKING_SAVED,
            filled_path: path,
            filled_by: 'upload',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);
        setJobs((prev) => ({
          ...prev,
          [formDef.form_id]: { ...prev[formDef.form_id], status: COJ_FORM_STATUSES.WORKING_SAVED },
        }));
      }

      setDocsByForm((prev) => {
        const kept = (prev[formDef.form_id] || []).filter((d) => d.path !== path);
        return { ...prev, [formDef.form_id]: sortCojDocsNewestFirst([insertedDoc, ...kept]) };
      });
      onWorkingCopySaved?.(insertedDoc);
    } catch (e) {
      setUploadError(e.message || 'Upload failed.');
    }
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
    if (!canCojAutofill(template, formDef) || !job?.id) return;
    setAutofillForm(formDef.form_id);
    setAutofillError('');
    try {
      const { doc, removedLegacy, entityProfile } = await applyCojAutofill({
        supabase,
        session,
        clientProfile,
        formationDraft: draft,
        template,
        jobId: job.id,
        formId: formDef.form_id,
      });
      // Refresh the harvested profile in app state so the next form's preview
      // (e.g. Form 1A) shows the company name without a reload.
      if (entityProfile) onProfileHarvested?.(entityProfile);
      setJobs((prev) => ({
        ...prev,
        [formDef.form_id]: { ...prev[formDef.form_id], status: COJ_FORM_STATUSES.WORKING_SAVED },
      }));
      setDocsByForm((prev) => {
        const removedIds = new Set((removedLegacy || []).map((d) => d.id));
        const removedPaths = new Set((removedLegacy || []).map((d) => d.path));
        const kept = (prev[formDef.form_id] || []).filter(
          (d) => !removedIds.has(d.id) && !removedPaths.has(d.path) && d.path !== doc.path,
        );
        return { ...prev, [formDef.form_id]: sortCojDocsNewestFirst([doc, ...kept]) };
      });
      for (const removed of removedLegacy || []) onDocumentRemoved?.(removed);
      onWorkingCopySaved?.(doc);
    } catch (e) {
      setAutofillError(e.message || 'Autofill failed.');
    }
    setAutofillForm(null);
  };

  const resolvedPreview = (formId) => {
    const template = templatesByKind[formId];
    if (!template?.placeholder_map) return {};
    const context = resolveEntityFacts({
      client: clientProfile,
      entityProfile: clientProfile?.entity_profile ?? {},
      formationDraft: draft,
      complianceIntake: {},
    });
    const values = resolveCojFieldValues(template, context);
    return Object.fromEntries(Object.entries(values).filter(([, v]) => String(v).trim()));
  };

  const templateFor = (formId) => templatesByKind[formId];

  const autofillReady = (formDef) => canCojAutofill(templateFor(formDef.form_id), formDef);

  const getSignedUrl = async (path) => {
    if (!supabase) return;
    await openStorageDocument(supabase, path, 300);
  };

  const handleDeleteDoc = async (formDef, doc) => {
    if (!supabase || !doc?.id) return;
    setDeletingDocId(doc.id);
    setDeleteError('');
    try {
      await removeCojDocuments(supabase, [doc]);
      const job = jobs[formDef.form_id];
      const remaining = (docsByForm[formDef.form_id] || []).filter((d) => d.id !== doc.id);
      const nextStatus = await reconcileCojJobAfterDocRemoval(
        supabase,
        job?.id,
        remaining,
        COJ_FORM_STATUSES,
      );
      if (nextStatus && job?.id) {
        setJobs((prev) => ({
          ...prev,
          [formDef.form_id]: { ...prev[formDef.form_id], status: nextStatus },
        }));
      }
      setDocsByForm((prev) => ({
        ...prev,
        [formDef.form_id]: remaining,
      }));
      onDocumentRemoved?.(doc);
    } catch (e) {
      setDeleteError(e.message || 'Could not remove document.');
    }
    setDeletingDocId(null);
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

  // Portal escapes ancestor stacking contexts so the overlay covers the fixed nav
  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#03020a]/95 backdrop-blur-xl overflow-y-auto">
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
            {deleteError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-300">{deleteError}</div>
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

                const template = templateFor(formDef.form_id);
                const templateLinked = isCojTemplateLinked(template, formDef);
                const isAutofilling = autofillForm === formDef.form_id;
                const showAutofill = autofillReady(formDef);
                const canRunAutofill = showAutofill && !isAutofilling;
                const preview = previewOpen[formDef.form_id] && showAutofill
                  ? resolvedPreview(formDef.form_id)
                  : null;

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
                      </div>
                    </div>

                    {formDef.step_action && (
                      <p className="text-xs text-gray-500 leading-relaxed">{formDef.step_action}</p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <a
                        href={formDef.download_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 border border-purple-500/30 hover:border-purple-400/50 bg-purple-500/5 hover:bg-purple-500/10 px-3 py-1.5 rounded-lg transition-all"
                      >
                        <i className="ph ph-arrow-square-out text-xs"></i>
                        {formDef.download_cta || 'Download official PDF'}
                      </a>
                      {formDef.portal_url && (
                        <a
                          href={formDef.portal_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-300 border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all"
                        >
                          <i className="ph ph-globe text-xs"></i>
                          {formDef.portal_cta || 'COJ portal'}
                        </a>
                      )}
                    </div>

                    <p className="text-xs text-gray-600 leading-relaxed">
                      This is your working copy. Filing happens at COJ - not through Onboardin until you submit there.
                    </p>

                    {!templateLinked && !loading && (
                      <p className="text-xs text-amber-400/80 leading-relaxed">
                        Official form link above matches your vault. Autofill will appear once the template is linked in your account.
                      </p>
                    )}

                    {/* Autofill block - only when DB template matches official PDF */}
                    {showAutofill && (
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
                          disabled={!canRunAutofill}
                          onClick={() => handleAutofill(formDef)}
                          className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-purple-400 hover:text-purple-300 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                        >
                          <i className="ph ph-sparkle text-xs"></i>
                          {isAutofilling ? 'Filling...' : formDocs.length > 0 ? 'Re-autofill from my info' : 'Autofill from my info'}
                        </button>
                        <p className="text-xs text-gray-600 leading-relaxed">
                          Updates your private working copy in the vault (working-latest.pdf). Edits in the browser tab do not auto-save - use Save edited PDF to vault after changing the file locally.
                        </p>
                      </div>
                    )}

                    {formDocs.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs text-gray-600">
                          This is your vault working copy - not the public COJ template. Download, edit in Acrobat or similar, then <span className="text-gray-500">Save edited PDF to vault</span> to replace it in your account.
                        </p>
                        {formDocs.map((doc, i) => (
                          <div
                            key={doc.id || doc.path}
                            className="flex items-center gap-1 p-2 bg-black/20 rounded-lg hover:bg-black/30 transition-all group"
                          >
                            <button
                              type="button"
                              onClick={() => getSignedUrl(doc.path)}
                              className="flex items-center gap-2 flex-1 min-w-0 text-left"
                            >
                              <i className="ph ph-file text-gray-500 group-hover:text-blue-400 transition-colors flex-shrink-0 text-base"></i>
                              <span className="text-sm text-gray-400 truncate flex-1 group-hover:text-gray-200">{doc.name}</span>
                              {i === 0 && (
                                <span className="text-[10px] uppercase tracking-widest text-purple-400/80 border border-purple-500/20 px-1.5 py-0.5 rounded flex-shrink-0">
                                  Latest
                                </span>
                              )}
                              <i className="ph ph-download-simple text-gray-600 group-hover:text-blue-400 transition-colors flex-shrink-0 text-base"></i>
                            </button>
                            <button
                              type="button"
                              disabled={deletingDocId === doc.id}
                              onClick={() => handleDeleteDoc(formDef, doc)}
                              className="p-1.5 text-gray-600 hover:text-red-400 transition-colors disabled:opacity-40 flex-shrink-0"
                              aria-label={`Remove ${doc.name}`}
                            >
                              <i className={`ph ${deletingDocId === doc.id ? 'ph-circle-notch animate-spin' : 'ph-trash'} text-sm`}></i>
                            </button>
                          </div>
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
                        {isUploading ? 'Saving...' : formDocs.length > 0 ? 'Save edited PDF to vault' : 'Upload working copy'}
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
                <span className={`text-xs ${
                  draftSaveStatus === 'error' ? 'text-red-400'
                    : draftSaveStatus === 'saving' ? 'text-gray-500'
                      : draftSaveStatus === 'saved' ? 'text-green-400/80'
                        : 'text-gray-600'
                }`}>
                  {draftSaveStatus === 'error' ? 'Save failed - retry'
                    : draftSaveStatus === 'saving' ? 'Saving...'
                      : draftSaveStatus === 'saved' ? 'Saved'
                        : 'Auto-saved'}
                </span>
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
    </div>,
    document.body,
  );
}
