import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { fetchTemplatePdfBytes, buildSignedPdf } from '../lib/document-sign-pdf';
import { upsertWorkingCopy, workingCopyCanonicalPath } from '../lib/document-vault.js';
import { unfileManual } from '../lib/filing-adapter.js';
import { indexTemplateFields, fieldIndexToFieldMap } from '../lib/pdf-field-index.js';
import { getPdfFillStrategy, hasAcroFieldMap } from '../lib/pdf-field-map.js';
import { buildFilledPdf } from '../lib/pdf-fill.js';
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
 *   onUnfiled - callback after filed_pending is reversed
 *   onGoToSignatureSettings - navigate to Overview signature card
 *   mode - 'fielded' | 'generic'
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
  mode = 'fielded',
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pages, setPages] = useState([]); // [{ width, height, scale }]
  const [fieldValues, setFieldValues] = useState(job?.field_values || {});
  const [placements, setPlacements] = useState(
    job?.field_placements && !Array.isArray(job.field_placements) ? job.field_placements : {},
  );
  const [activeField, setActiveField] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveDone, setSaveDone] = useState(false);
  const [closeArmed, setCloseArmed] = useState(false);
  const [sigPngUrl, setSigPngUrl] = useState(null);
  const [sigStoragePath, setSigStoragePath] = useState(null);
  const [sigUploading, setSigUploading] = useState(false);

  const [unfiling, setUnfiling] = useState(false);

  const containerRef = useRef(null);
  const canvasRefs = useRef([]);
  const pdfDocRef = useRef(null);
  const sigFileRef = useRef(null);

  const fieldMap = template?.field_map || {};
  const [overlayFieldMap, setOverlayFieldMap] = useState(null);
  const effectiveFieldMap = overlayFieldMap || fieldMap;
  const fillStrategy = useMemo(() => getPdfFillStrategy(effectiveFieldMap), [effectiveFieldMap]);
  const jobStatus = job?.status;
  const signedLock = jobStatus === 'signed';
  const filedLock = jobStatus === 'filed_pending';
  const genericMode = mode === 'generic';
  const readOnly = signedLock || filedLock || genericMode;
  const hasBounds = useMemo(
    () => Object.values(effectiveFieldMap).some((d) => typeof d?.x === 'number' && typeof d?.y === 'number'),
    [effectiveFieldMap],
  );
  const usesAcroSave = fillStrategy === 'acro';

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
    setOverlayFieldMap(null);
  }, [template?.id, job?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        if (genericMode) {
          const bytes = await loadDocumentBytes();
          if (cancelled) return;
          await renderPdf(bytes);
          return;
        }
        const bytes = await loadDocumentBytes();
        if (cancelled) return;

        let mapForRender = fieldMap;
        const hasCoordinateBounds = Object.values(fieldMap).some(
          (d) => typeof d?.x === 'number' && typeof d?.y === 'number',
        );
        if (!hasCoordinateBounds && hasAcroFieldMap(fieldMap)) {
          const indexed = await indexTemplateFields(bytes, fieldMap);
          mapForRender = fieldIndexToFieldMap(indexed.fields);
          if (!cancelled) setOverlayFieldMap(mapForRender);
        }

        const canEdit = Object.values(mapForRender).some(
          (d) => typeof d?.x === 'number' && typeof d?.y === 'number',
        );
        if (!canEdit) {
          setLoadError('This document is not indexed for in-app editing yet. Download it instead.');
          return;
        }
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
  }, [genericMode, fieldMap, loadDocumentBytes, renderPdf, template?.id, job?.id]);

  const handleUnfile = async () => {
    if (!job?.id || !supabase || unfiling) return;
    setUnfiling(true);
    setSaveError('');
    try {
      await unfileManual(supabase, job.id);
      onUnfiled?.();
    } catch (e) {
      setSaveError(e.message || 'Could not reopen this document.');
    }
    setUnfiling(false);
  };

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
    if (signedLock || filedLock) return;
    if (def.type === 'text') {
      setActiveField(fieldKey);
    } else if (def.type === 'date') {
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
  }, [signedLock, filedLock, sigStoragePath, markDirty]);

  const handleSave = async () => {
    if (signedLock || filedLock || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      // Burn from the clean master template so values never double-print
      const templatePdfBytes = await fetchTemplatePdfBytes(template, supabase);

      let pdfBytes;
      if (usesAcroSave) {
        const filled = await buildFilledPdf({
          templatePdfBytes,
          fieldMap: effectiveFieldMap,
          fieldValues,
          formKind: template?.kind,
          supabase,
          template,
        });
        pdfBytes = filled.pdfBytes;
      } else {
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
          fieldMap: effectiveFieldMap,
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
      if (job?.id) {
        const { error: jobErr } = await supabase.from('document_jobs').update({
          status: 'filled',
          filled_path: workingCopyCanonicalPath(clientProfile.id, template),
          filled_by: 'editor',
          field_values: fieldValues,
          field_placements: placements,
          updated_at: now,
        }).eq('id', job.id)
          .not('status', 'in', '("signed","voided","pending_signatures")');
        if (jobErr) throw new Error(jobErr.message || 'Could not update document record.');
      }

      setDirty(false);
      setSaveDone(true);
      setActiveField(null);
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

  const fieldsForPage = useCallback(
    (pageIndex) => Object.entries(effectiveFieldMap).filter(
      ([, d]) => (d.page ?? 0) === pageIndex && typeof d.x === 'number' && typeof d.y === 'number',
    ),
    [effectiveFieldMap],
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
              {signedLock
                ? 'Signed - view only'
                : filedLock
                  ? 'Filed at COJ - reopen to edit'
                  : dirty
                    ? 'Unsaved changes'
                    : saveDone
                      ? 'Saved to your vault'
                      : genericMode
                        ? 'Limited editor - field autofill not available'
                        : 'Tap a field to edit'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!signedLock && !filedLock && (
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

        {(signedLock || filedLock) && (
          <div className="px-4 py-3 bg-[#0e0c1a] border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
            {signedLock && (
              <p className="text-xs text-amber-300">Signed copies cannot be changed. Start a new working copy from the template.</p>
            )}
            {filedLock && (
              <>
                <p className="text-xs text-amber-300">This form is marked filed at COJ. Reopen it to edit again.</p>
                <button
                  type="button"
                  onClick={handleUnfile}
                  disabled={unfiling}
                  className="py-2 px-3 border border-amber-500/30 rounded-xl text-xs uppercase tracking-widest text-amber-200 hover:bg-amber-500/10 transition-all disabled:opacity-40"
                >
                  {unfiling ? 'Reopening…' : 'Reopen for editing'}
                </button>
              </>
            )}
          </div>
        )}

        {(saveError || saveDone) && (
          <div className="px-4 py-2 bg-[#0e0c1a] border-b border-white/5">
            {saveError && <p className="text-xs text-red-300">{saveError}</p>}
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
                      <span className={`text-xs ${value ? 'text-gray-900' : 'text-blue-500 text-[10px] uppercase tracking-widest'}`}>
                        {value || 'Tap for today'}
                      </span>
                    </button>
                  );
                }

                // text
                const value = fieldValues[fieldKey] ?? '';
                if (activeField === fieldKey && !signedLock && !filedLock) {
                  return (
                    <input
                      key={fieldKey}
                      autoFocus
                      style={style}
                      value={value}
                      onFocus={(e) => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                      onInput={(e) => {
                        const v = e.target.value;
                        setFieldValues((prev) => ({ ...prev, [fieldKey]: v }));
                        markDirty();
                      }}
                      onBlur={() => setActiveField(null)}
                      onKeyDown={(e) => { if (e.key === 'Enter') setActiveField(null); }}
                      className="absolute rounded border border-purple-500 bg-white px-1 text-xs text-gray-900 outline-none shadow"
                    />
                  );
                }
                return (
                  <button
                    key={fieldKey}
                    type="button"
                    onClick={() => handleFieldTap(fieldKey, def)}
                    disabled={readOnly}
                    style={style}
                    title={fieldKey.replace(/_/g, ' ')}
                    className={`absolute rounded border text-left px-1 overflow-hidden ${
                      value ? 'border-white/0 bg-white hover:border-purple-400/60' : 'border-dashed border-purple-500/70 bg-purple-500/5 hover:bg-purple-500/15'
                    } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    <span className={`text-xs whitespace-nowrap ${value ? 'text-gray-900' : 'text-purple-500 text-[10px] uppercase tracking-widest'}`}>
                      {value || fieldKey.replace(/_/g, ' ')}
                    </span>
                  </button>
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

        {!signedLock && !filedLock && !sigStoragePath && !loading && !loadError && !genericMode && (
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
