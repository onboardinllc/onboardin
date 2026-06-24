import React, { useState, useRef, useCallback, useEffect } from 'react';
import { fetchTemplatePdfBytes, buildSignedPdf } from '../lib/document-sign-pdf';
import {
  fetchActiveMemberSignature,
  signaturePreviewUrl,
  uploadMemberSignaturePng,
  assertMemberSignContext,
  assertSignaturePathForUser,
  assertSignedDocumentPath,
} from '../lib/member-signature';
import SignatureCanvas from './SignatureCanvas';

/**
 * DocumentSignOverlay — places signature PNG + date text onto a PDF using pdf-lib.
 */
export default function DocumentSignOverlay({
  job,
  template,
  clientProfile,
  supabase,
  session,
  onClose,
  onSigned,
  onGoToSignatureSettings,
  onSignatureUploaded,
}) {
  const [phase, setPhase] = useState('ready');
  const [signError, setSignError] = useState('');
  const [sigPngUrl, setSigPngUrl] = useState(null);
  const [sigStoragePath, setSigStoragePath] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [placements, setPlacements] = useState({});
  const fileInputRef = useRef(null);

  const fieldMap = template?.field_map || {};
  const fieldValues = job?.field_values || {};

  const loadSignature = useCallback(async () => {
    if (!supabase || !session?.user?.id) return;
    const row = await fetchActiveMemberSignature(supabase, session.user.id);
    if (!row?.storage_path) return;
    assertSignaturePathForUser(session.user.id, row.storage_path);
    const url = await signaturePreviewUrl(supabase, row.storage_path, session.user.id);
    setSigStoragePath(row.storage_path);
    setSigPngUrl(url);
  }, [supabase, session]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadSignature();
      } catch {
        if (!cancelled) setSignError('Could not load your signature.');
      }
    })();
    return () => { cancelled = true; };
  }, [loadSignature]);

  const handleSignatureUpload = useCallback(async (file) => {
    if (!file) return;
    setUploading(true);
    setSignError('');
    const result = await uploadMemberSignaturePng(supabase, session, file);
    setUploading(false);
    if (result.error) {
      setSignError(result.error);
      return;
    }
    if (result.storagePath) setSigStoragePath(result.storagePath);
    if (result.previewUrl) {
      setSigPngUrl(result.previewUrl);
    } else {
      try {
        await loadSignature();
      } catch {
        setSignError('Signature saved but preview could not load. Try again.');
      }
    }
    onSignatureUploaded?.();
  }, [supabase, session, onSignatureUploaded, loadSignature]);

  const handlePlaceSignature = useCallback((fieldKey) => {
    if (!sigStoragePath) return;
    const path = sigStoragePath;
    setPlacements((prev) => ({
      ...prev,
      [fieldKey]: { type: 'signature', placed: true, path },
    }));
  }, [session, sigStoragePath]);

  const handlePlaceDate = useCallback((fieldKey) => {
    const today = new Date().toISOString().slice(0, 10);
    setPlacements((prev) => ({
      ...prev,
      [fieldKey]: { type: 'date', value: today },
    }));
  }, []);

  const handleSign = async () => {
    const contextCheck = assertMemberSignContext(session, clientProfile);
    if (!contextCheck.ok) { setSignError(contextCheck.error); return; }

    const hasSigFields = Object.values(fieldMap).some((f) => f.type === 'signature');
    if (hasSigFields && !sigStoragePath) {
      setSignError('Draw or upload your signature first, or set one up in Overview.');
      return;
    }
    setPhase('signing');
    setSignError('');
    try {
      const templatePdfBytes = await fetchTemplatePdfBytes(template, supabase);

      let signaturePngBytes = null;
      if (sigStoragePath) {
        assertSignaturePathForUser(session.user.id, sigStoragePath);
        const { data: sigBlob, error: sigErr } = await supabase.storage
          .from('client-documents')
          .download(sigStoragePath);
        if (sigErr) throw new Error(sigErr.message || 'Could not load signature image.');
        signaturePngBytes = new Uint8Array(await sigBlob.arrayBuffer());
      }

      const signedPdfBytes = await buildSignedPdf({
        templatePdfBytes,
        fieldMap,
        fieldValues,
        placements,
        signaturePngBytes,
      });

      const timestamp = Date.now();
      const signedPath = `${clientProfile.id}/${template.vault_card_id}/signed-${timestamp}.pdf`;
      assertSignedDocumentPath(clientProfile.id, template.vault_card_id, signedPath);
      const now = new Date().toISOString();

      const { error: uploadErr } = await supabase.storage
        .from('client-documents')
        .upload(signedPath, signedPdfBytes, { contentType: 'application/pdf', upsert: false });
      if (uploadErr) throw new Error(uploadErr.message || 'Upload failed.');

      let docRow = null;
      try {
        const { data, error: docErr } = await supabase.from('documents').insert({
          client_id: clientProfile.id,
          name: `${template.label} — signed`,
          path: signedPath,
          size: signedPdfBytes.byteLength,
          uploaded_by: session.user.id,
          category: template.vault_card_id,
        }).select('*').single();
        if (docErr) throw new Error(docErr.message || 'Could not save document record.');
        docRow = data;

        const { error: jobErr } = await supabase.from('document_jobs').update({
          status: 'signed',
          signed_path: signedPath,
          signed_at: now,
          field_placements: placements,
          updated_at: now,
        }).eq('id', job.id);
        if (jobErr) {
          await supabase.from('documents').delete().eq('id', docRow.id);
          throw new Error(jobErr.message || 'Could not update signing job.');
        }
      } catch (persistErr) {
        await supabase.storage.from('client-documents').remove([signedPath]);
        throw persistErr;
      }

      setPhase('done');
      if (onSigned && docRow) onSigned(docRow, signedPath);
    } catch (e) {
      setSignError(e.message || 'Signing failed. Try again.');
      setPhase('error');
    }
  };

  const allSigFieldsPlaced = Object.entries(fieldMap)
    .filter(([, f]) => f.type === 'signature')
    .every(([k]) => placements[k]?.placed);

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-[#03020a]/80 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto py-16 px-4">
        <div className="w-full max-w-lg bg-[#0e0c1a] border border-white/10 rounded-2xl shadow-2xl animate-[fadeIn_0.2s_ease-out]">

          <div className="flex items-start justify-between p-6 border-b border-white/5">
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">{template?.label}</p>
              <h2 className="text-lg font-bold text-white">
                {phase === 'done' ? 'Document signed.' : 'Place your signature.'}
              </h2>
              <p className="text-xs text-gray-500 mt-1">Step 2 of 2 — Sign and save to vault</p>
            </div>
            <button type="button" onClick={onClose} className="text-gray-600 hover:text-gray-300 transition-colors mt-1">
              <i className="ph ph-x text-lg"></i>
            </button>
          </div>

          <div className="p-6 space-y-5">

            {phase === 'done' && (
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <i className="ph ph-check-circle text-base"></i>
                Signed copy saved to your vault.
              </div>
            )}

            {phase !== 'done' && (
              <>
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-widest text-gray-500">Your signature</p>
                  {(sigPngUrl || sigStoragePath) ? (
                    <div className="flex items-center gap-3">
                      {sigPngUrl ? (
                        <img src={sigPngUrl} alt="signature" className="h-10 object-contain bg-white/5 rounded p-1" />
                      ) : (
                        <span className="text-sm text-gray-400">Signature saved</span>
                      )}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs uppercase tracking-widest text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        Replace
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <SignatureCanvas
                        compact
                        disabled={uploading}
                        onExport={handleSignatureUpload}
                      />
                      <div className="flex items-center gap-3 text-xs text-gray-600">
                        <div className="flex-1 h-px bg-white/10" />
                        or
                        <div className="flex-1 h-px bg-white/10" />
                      </div>
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 py-2 px-4 border border-dashed border-white/10 rounded-lg text-sm text-gray-500 hover:border-white/20 hover:text-gray-300 transition-all disabled:opacity-40 w-full justify-center"
                      >
                        <i className="ph ph-upload-simple text-base"></i>
                        {uploading ? 'Uploading…' : 'Upload signature PNG'}
                      </button>
                      {onGoToSignatureSettings && (
                        <button
                          type="button"
                          onClick={onGoToSignatureSettings}
                          className="text-xs uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          Set up in Overview →
                        </button>
                      )}
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleSignatureUpload(e.target.files[0])}
                  />
                </div>

                {Object.entries(fieldMap).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-widest text-gray-500">Fields</p>
                    {Object.entries(fieldMap).map(([fieldKey, fieldDef]) => {
                      const placed = placements[fieldKey];
                      return (
                        <div key={fieldKey} className="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0">
                          <div className="flex items-center gap-2">
                            <i className={`ph ${placed ? 'ph-check-circle text-green-400' : 'ph-circle text-gray-600'} text-base`}></i>
                            <span className="text-sm text-gray-400 capitalize">{fieldKey.replace(/_/g, ' ')}</span>
                            <span className="text-xs text-gray-600">{fieldDef.type}</span>
                          </div>
                          {!placed && (
                            <button
                              type="button"
                              onClick={() => {
                                if (fieldDef.type === 'signature') handlePlaceSignature(fieldKey);
                                else if (fieldDef.type === 'date') handlePlaceDate(fieldKey);
                              }}
                              disabled={fieldDef.type === 'signature' && !sigStoragePath}
                              className="text-xs uppercase tracking-widest text-purple-400 hover:text-purple-300 disabled:opacity-30 transition-colors"
                            >
                              {fieldDef.type === 'signature' ? 'Sign' : 'Place today'}
                            </button>
                          )}
                          {placed && (
                            <span className="text-xs text-green-400">{placed.value || 'placed'}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {Object.entries(fieldMap).filter(([, f]) => f.type === 'text').length > 0 && (
                  <p className="text-xs text-gray-600">
                    Text fields are filled automatically from your profile.
                  </p>
                )}

                {signError && (
                  <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-300">
                    {signError}
                  </div>
                )}

                {phase !== 'signing' && (
                  <button
                    type="button"
                    onClick={handleSign}
                    disabled={!allSigFieldsPlaced && Object.values(fieldMap).some((f) => f.type === 'signature')}
                    className="w-full py-2.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-xl text-sm uppercase tracking-widest text-purple-200 transition-all disabled:opacity-30"
                  >
                    Sign and save to vault
                  </button>
                )}

                {phase === 'signing' && (
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <i className="ph ph-spinner-gap animate-spin text-base"></i>
                    Applying signature…
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}