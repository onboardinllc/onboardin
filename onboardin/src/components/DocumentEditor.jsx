import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { fetchTemplatePdfBytes, buildSignedPdf } from '../lib/document-sign-pdf';
import { buildFilledPdf } from '../lib/pdf-fill.js';
import { getPdfFillStrategy } from '../lib/pdf-field-map.js';
import { indexTemplateFields, fieldIndexToFieldMap } from '../lib/pdf-field-index.js';
import { unfileManual } from '../lib/filing-adapter.js';
import { upsertWorkingCopy, workingCopyCanonicalPath } from '../lib/document-vault.js';
import {
  fetchActiveMemberSignature,
  signaturePreviewUrl,
  uploadMemberSignaturePng,
  assertSignaturePathForUser,
} from '../lib/member-signature';

const PAGE_MAX_WIDTH = 760;

/**
 * DocumentEditor - opens the member's working PDF inside Onboardin.
 * Renders pages with pdf.js, draws editable field regions from
 * template.field_map (top-left UI coords, scaled to the rendered page),
 * and saves typed values + signature placements back to the vault
 * working copy. Signed jobs open read-only.
 *
 * Props:
 *   job - document_jobs row (field_values, field_placements, status, filled_path)
 *   template - legal_templates row (field_map, label)
 *   clientProfile - clients row
 *   supabase, session - auth context
 *   onClose - close callback
 *   onSaved - callback(doc, { fieldValues, placements }) after save to vault
 *   onUnfiled - callback after a filed_pending job is reopened for editing
 *   onGoToSignatureSettings - navigate to Overview signature card
 *   onSignatureUploaded - parent refreshes signature-on-file state
 */
export default function DocumentEditor({
  job,
  template,
  clientProfile,
  supabase,
  session,
  onClose,
  onSaved,
  onUnfiled,
  onGoToSignatureSettings,
  onSignatureUploaded,
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pages, setPages] = useState([]); // [{ width, height, scale }]
  const [fieldValues, setFieldValues] = useState(job?.field_values || {});
  const [placements, setPlacements] = useState(
    job?.field_placements && !Array.isArray(job.field_placements) ? job.field_placements : {},
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveDone, setSaveDone] = useState(false);
  const [closeArmed, setCloseArmed] = useState(false);
  const [sigPngUrl, setSigPngUrl] = useState(null);
  const [sigStoragePath, setSigStoragePath] = useState(null);
  const [sigUploading, setSigUploading] = useState(false);
  const [overlayMap, setOverlayMap] = useState(null);
  const [jobStatus, setJobStatus] = useState(job?.status || null);
  const [unfiling, setUnfiling] = useState(false);

  const containerRef = useRef(null);
  const canvasRefs = useRef([]);
  const pdfDocRef = useRef(null);
  const sigFileRef = useRef(null);

  const fieldMap = template?.field_map || {};
  const strategy = useMemo(() => getPdfFillStrategy(fieldMap), [fieldMap]);
  const isCoj = template?.provider === 'coj';
  // signed = immutable legal artifact; filed = soft lock, reversible via unfile
  const signedLock = jobStatus === 'signed';
  const filedLock = jobStatus === 'filed_pending';
  const genericMode = !strategy;
  const readOnly = signedLock || filedLock || genericMode;

  const markDirty = useCallback(() => {
    setDirty(true);
    setSaveDone(false);
    setCloseArmed(false);
  }, []);

  // Load the member's signature on file (for visual placement)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!supabase || !session?.user?.id) return;
        const row = await fetchActiveMemberSignature(supabase, session.user.id);
        if (!row?.storage_path || cancelled) return;
        assertSignaturePathForUser(session.user.id, row.storage_path);
        const url = await signaturePreviewUrl(supabase, row.storage_path, session.user.id);
        if (cancelled) return;
        setSigStoragePath(row.storage_path);
        setSigPngUrl(url);
      } catch {
        /* signature optional until placement */
      }
    })();
    return () => { cancelled = true; };
  }, [supabase, session]);

  // Load working PDF bytes (client storage first, master template as fallback)
  const loadDocumentBytes = useCallback(async () => {
    const candidates = [];
    try {
      candidates.push(workingCopyCanonicalPath(clientProfile.id, template));
    } catch { /* invalid clientId surfaces below */ }
    if (job?.filled_path && !candidates.includes(job.filled_path)) candidates.push(job.filled_path);
    for (const path of candidates) {
      const { data, error } = await supabase.storage.from('client-documents').download(path);
      if (!error && data) return new Uint8Array(await data.arrayBuffer());
    }
    return fetchTemplatePdfBytes(template, supabase);
  }, [clientProfile, template, job, supabase]);

  const renderPdf = useCallback(async (bytes) => {
    const pdfjs = await import('../vendor/pdfjs.esm.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    // Bytes are consumed by the worker; pass a copy so re-renders stay valid
    const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    pdfDocRef.current = doc;

    const containerWidth = Math.min(
      containerRef.current?.clientWidth || PAGE_MAX_WIDTH,
      PAGE_MAX_WIDTH,
    );
    const meta = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      // Single scale shared by canvas render and overlay math
      const pageScale = containerWidth / base.width;
      meta.push({ width: base.width, height: base.height, scale: pageScale, page });
    }
    setPages(meta.map(({ width, height, scale }) => ({ width, height, scale })));

    // Canvases mount on next paint; render after refs exist
    requestAnimationFrame(async () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (let i = 0; i < meta.length; i += 1) {
        const canvas = canvasRefs.current[i];
        if (!canvas) continue;
        const { page, scale } = meta[i];
        const viewport = page.getViewport({ scale: scale * dpr });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const bytes = await loadDocumentBytes();
        if (cancelled) return;

        if (strategy === 'coordinate') {
          setOverlayMap(fieldMap);
        } else if (strategy === 'acro') {
          // Acro maps carry field names/indices; widget scan supplies bounds.
          // Saved values in the working copy pin each key to its true widget.
          const idx = await indexTemplateFields(bytes, fieldMap, { valueHints: job?.field_values });
          const curated = idx.fields.filter((f) => fieldMap[f.fieldKey] && typeof f.x === 'number');
          if (!curated.length) {
            setLoadError('This document is not indexed for in-app editing yet. Download it instead.');
            return;
          }
          setOverlayMap(fieldIndexToFieldMap(curated));
        } else {
          setOverlayMap({});
        }

        if (cancelled) return;
        await renderPdf(bytes);
      } catch (e) {
        if (!cancelled) setLoadError(e.message || 'Could not open this document.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      pdfDocRef.current?.destroy?.();
    };
    // Load once per editor open. Parent re-renders hand down fresh prop
    // identities; re-running the load would tear pages down mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignatureUpload = useCallback(async (file) => {
    if (!file) return;
    setSigUploading(true);
    setSaveError('');
    const result = await uploadMemberSignaturePng(supabase, session, file);
    setSigUploading(false);
    if (result.error) { setSaveError(result.error); return; }
    if (result.storagePath) setSigStoragePath(result.storagePath);
    if (result.previewUrl) setSigPngUrl(result.previewUrl);
    onSignatureUploaded?.();
  }, [supabase, session, onSignatureUploaded]);

  const handleFieldTap = useCallback((fieldKey, def) => {
    if (readOnly) return;
    if (def.type === 'date') {
      const today = new Date().toISOString().slice(0, 10);
      setPlacements((prev) => ({ ...prev, [fieldKey]: { type: 'date', value: today } }));
      markDirty();
    } else if (def.type === 'signature') {
      if (!sigStoragePath) {
        sigFileRef.current?.click();
        return;
      }
      setPlacements((prev) => {
        const already = prev[fieldKey]?.placed;
        const next = { ...prev };
        if (already) delete next[fieldKey];
        else next[fieldKey] = { type: 'signature', placed: true, path: sigStoragePath };
        return next;
      });
      markDirty();
    }
  }, [readOnly, sigStoragePath, markDirty]);

  const handleSave = async () => {
    if (readOnly || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      let pdfBytes;
      if (strategy === 'acro') {
        // Acro forms fill real form fields; date taps fold into values
        const effectiveValues = { ...fieldValues };
        for (const [key, p] of Object.entries(placements)) {
          if (p?.type === 'date' && p.value) effectiveValues[key] = p.value;
        }
        const filled = await buildFilledPdf({
          templatePdfBytes: null,
          fieldMap,
          fieldValues: effectiveValues,
          formKind: template.kind,
          supabase,
          template,
        });
        if (!filled.pdfBytes?.length) throw new Error('Fill produced no document. Try again.');
        pdfBytes = filled.pdfBytes;
      } else {
        // Burn from the clean master template so values never double-print
        const templatePdfBytes = await fetchTemplatePdfBytes(template, supabase);

        let signaturePngBytes = null;
        const hasPlacedSignature = Object.values(placements).some((p) => p?.placed);
        if (hasPlacedSignature && sigStoragePath) {
          assertSignaturePathForUser(session.user.id, sigStoragePath);
          const { data: sigBlob, error: sigErr } = await supabase.storage
            .from('client-documents')
            .download(sigStoragePath);
          if (sigErr) throw new Error(sigErr.message || 'Could not load signature image.');
          signaturePngBytes = new Uint8Array(await sigBlob.arrayBuffer());
        }

        pdfBytes = await buildSignedPdf({
          templatePdfBytes,
          fieldMap,
          fieldValues,
          placements,
          signaturePngBytes,
        });
      }

      const doc = await upsertWorkingCopy(supabase, {
        clientId: clientProfile.id,
        template,
        pdfBytes,
        displayName: `${template.label || 'Document'} - working copy.pdf`,
      });

      const now = new Date().toISOString();
      const savedStatus = isCoj ? 'working_saved' : 'filled';
      if (job?.id) {
        const { error: jobErr } = await supabase.from('document_jobs').update({
          status: savedStatus,
          filled_path: workingCopyCanonicalPath(clientProfile.id, template),
          filled_by: 'editor',
          field_values: fieldValues,
          field_placements: placements,
          updated_at: now,
        }).eq('id', job.id);
        if (jobErr) throw new Error(jobErr.message || 'Could not update document record.');
        setJobStatus(savedStatus);
      }

      setDirty(false);
      setSaveDone(true);
      await renderPdf(pdfBytes);
      onSaved?.(doc, { fieldValues, placements });
    } catch (e) {
      setSaveError(e.message || 'Save failed. Try again.');
    }
    setSaving(false);
  };

  const handleClose = () => {
    if (dirty && !closeArmed) {
      setCloseArmed(true);
      return;
    }
    onClose?.();
  };

  const handleUnfile = async () => {
    if (!job?.id || unfiling) return;
    setUnfiling(true);
    setSaveError('');
    try {
      await unfileManual(supabase, job.id);
      setJobStatus('working_saved');
      onUnfiled?.();
    } catch (e) {
      setSaveError(e.message || 'Could not reopen this document.');
    }
    setUnfiling(false);
  };

  const fieldsForPage = useCallback(
    (pageIndex) => Object.entries(overlayMap || {}).filter(
      ([, d]) => (d.page ?? 0) === pageIndex && typeof d.x === 'number' && typeof d.y === 'number',
    ),
    [overlayMap],
  );

  return createPortal(
    <>
      <div className="fixed inset-0 z-[80] bg-[#03020a]/90 backdrop-blur-sm" />
      <div className="fixed inset-0 z-[80] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#0e0c1a] border-b border-white/10">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-gray-500 truncate">{template?.label}</p>
            <p className="text-sm text-white truncate">
              {signedLock ? 'Signed - view only'
                : filedLock ? 'Filed - reopen to edit'
                  : genericMode ? 'Limited editor - view only'
                    : dirty ? 'Unsaved changes' : saveDone ? 'Saved to your vault' : 'Tap a field to edit'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!readOnly && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || loading || !!loadError}
                className="py-2 px-4 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-xl text-xs uppercase tracking-widest text-purple-200 transition-all disabled:opacity-30"
              >
                {saving ? 'Saving…' : 'Save to vault'}
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className={`py-2 px-3 rounded-xl text-xs uppercase tracking-widest transition-all border ${
                closeArmed
                  ? 'border-red-500/40 text-red-300 bg-red-500/10'
                  : 'border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              {closeArmed ? 'Discard edits?' : <i className="ph ph-x text-base"></i>}
            </button>
          </div>
        </div>

        {(saveError || saveDone || filedLock || signedLock || genericMode) && (
          <div className="px-4 py-2 bg-[#0e0c1a] border-b border-white/5 flex flex-wrap items-center gap-3">
            {filedLock && (
              <>
                <p className="text-xs text-amber-300 flex-1 min-w-[180px]">
                  Marked filed at the registry. Reopen if you filed by mistake or need to fix a detail.
                </p>
                <button
                  type="button"
                  onClick={handleUnfile}
                  disabled={unfiling}
                  className="py-1.5 px-3 border border-amber-500/40 rounded-lg text-xs uppercase tracking-widest text-amber-200 hover:bg-amber-500/10 transition-all disabled:opacity-40"
                >
                  {unfiling ? 'Reopening…' : 'Reopen for editing'}
                </button>
              </>
            )}
            {signedLock && (
              <p className="text-xs text-gray-400">
                Signed copies cannot be changed. Start a new working copy from the template to make edits.
              </p>
            )}
            {genericMode && !filedLock && !signedLock && (
              <p className="text-xs text-gray-400">Limited editor: field autofill is not available for this document.</p>
            )}
            {saveError && <p className="text-xs text-red-300 w-full">{saveError}</p>}
            {saveDone && !saveError && (
              <p className="text-xs text-green-400">Saved. Reopen any time to keep editing.</p>
            )}
          </div>
        )}

        {/* Pages */}
        <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2">
          {loading && (
            <div className="flex items-center justify-center gap-2 text-gray-500 text-sm py-16">
              <i className="ph ph-spinner-gap animate-spin text-base"></i>
              Opening your document…
            </div>
          )}

          {loadError && !loading && (
            <div className="max-w-md mx-auto p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-300">
              {loadError}
            </div>
          )}

          {!loading && !loadError && pages.map((pg, pageIndex) => (
            <div
              key={pageIndex}
              className="relative mx-auto mb-4 bg-white rounded shadow-2xl"
              style={{ width: `${pg.width * pg.scale}px`, height: `${pg.height * pg.scale}px` }}
            >
              <canvas
                key={`page-canvas-${pageIndex}`}
                ref={(el) => { canvasRefs.current[pageIndex] = el; }}
                className="absolute inset-0"
              />

              {fieldsForPage(pageIndex).map(([fieldKey, def]) => {
                const s = pg.scale;
                const style = {
                  left: `${def.x * s}px`,
                  top: `${def.y * s}px`,
                  width: `${def.w * s}px`,
                  height: `${def.h * s}px`,
                };
                const placed = placements[fieldKey];

                if (def.type === 'signature') {
                  return (
                    <button
                      key={fieldKey}
                      type="button"
                      onClick={() => handleFieldTap(fieldKey, def)}
                      disabled={readOnly}
                      style={style}
                      title={fieldKey.replace(/_/g, ' ')}
                      className={`absolute rounded border transition-all ${
                        placed?.placed
                          ? 'border-green-500/60 bg-white'
                          : 'border-dashed border-purple-500/70 bg-purple-500/5 hover:bg-purple-500/15'
                      } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      {placed?.placed && sigPngUrl ? (
                        <img src={sigPngUrl} alt="signature" className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-[10px] uppercase tracking-widest text-purple-500">
                          {sigUploading ? 'Uploading…' : 'Tap to sign'}
                        </span>
                      )}
                    </button>
                  );
                }

                if (def.type === 'date') {
                  const value = placed?.value || fieldValues[fieldKey] || '';
                  const dateFontPx = Math.min(14, Math.max(9, Math.round(def.h * s * 0.52)));
                  return (
                    <button
                      key={fieldKey}
                      type="button"
                      onClick={() => handleFieldTap(fieldKey, def)}
                      disabled={readOnly}
                      style={style}
                      title={fieldKey.replace(/_/g, ' ')}
                      className={`absolute rounded border text-left px-1 ${
                        value ? 'border-green-500/40 bg-white' : 'border-dashed border-blue-400/70 bg-blue-500/5 hover:bg-blue-500/15'
                      } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      <span
                        style={{ fontSize: value ? `${dateFontPx}px` : undefined }}
                        className={value ? 'text-gray-900' : 'text-blue-500 text-[10px] uppercase tracking-widest'}
                      >
                        {value || 'Tap for today'}
                      </span>
                    </button>
                  );
                }

                const value = fieldValues[fieldKey] ?? '';
                const boxH = def.h * s;
                const inputFontPx = Math.min(14, Math.max(9, Math.round(boxH * 0.52)));
                return (
                  <textarea
                    key={fieldKey}
                    style={{
                      ...style,
                      fontSize: `${inputFontPx}px`,
                      lineHeight: 1.25,
                      padding: '2px 4px',
                      resize: 'none',
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
                    }}
                    value={value}
                    disabled={readOnly}
                    title={fieldKey.replace(/_/g, ' ')}
                    placeholder={fieldKey.replace(/_/g, ' ')}
                    onFocus={(e) => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                    onInput={(e) => {
                      const v = e.target.value;
                      setFieldValues((prev) => ({ ...prev, [fieldKey]: v }));
                      markDirty();
                    }}
                    className={`absolute rounded border text-gray-900 outline-none ${
                      value
                        ? 'border-white/0 bg-white focus:border-purple-500 hover:border-purple-400/60'
                        : 'border-dashed border-purple-500/70 bg-purple-500/5 focus:bg-white focus:border-purple-500 placeholder:text-purple-500 placeholder:uppercase placeholder:tracking-widest placeholder:text-[10px]'
                    } ${readOnly ? 'cursor-default' : ''}`}
                  />
                );
              })}
            </div>
          ))}
        </div>

        <input
          ref={sigFileRef}
          type="file"
          accept="image/png"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) handleSignatureUpload(file);
          }}
        />

        {!readOnly && !sigStoragePath && !loading && !loadError && (
          <div className="px-4 py-2 bg-[#0e0c1a] border-t border-white/5 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">No signature on file. Tap a signature field to upload a PNG.</p>
            {onGoToSignatureSettings && (
              <button
                type="button"
                onClick={onGoToSignatureSettings}
                className="text-xs uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors flex-shrink-0"
              >
                Set up in Overview →
              </button>
            )}
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
