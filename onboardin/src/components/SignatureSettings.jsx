import { useState, useRef, useEffect, useCallback } from 'react';
import {
  fetchActiveMemberSignature,
  signaturePreviewUrl,
  uploadMemberSignaturePng,
  assertSignaturePathForUser,
} from '../lib/member-signature';
import SignatureCanvas from './SignatureCanvas';

/**
 * Overview card - draw or upload member signature PNG.
 * Only mounted for non-admin members (App.jsx guard).
 */
export default function SignatureSettings({ supabase, session, onUploadSuccess }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [inputMode, setInputMode] = useState('draw'); // 'draw' | 'upload'
  const [showCanvas, setShowCanvas] = useState(false);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    if (!supabase || !session?.user?.id) return;
    setLoading(true);
    setError('');
    try {
      const row = await fetchActiveMemberSignature(supabase, session.user.id);
      if (row?.storage_path) {
        assertSignaturePathForUser(session.user.id, row.storage_path);
        const url = await signaturePreviewUrl(supabase, row.storage_path, session.user.id);
        setPreviewUrl(url);
      } else {
        setPreviewUrl(null);
      }
    } catch (e) {
      setError(e.message || 'Could not load signature.');
    }
    setLoading(false);
  }, [supabase, session]);

  useEffect(() => { load(); }, [load]);

  const handleUploadFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setError('');
    const result = await uploadMemberSignaturePng(supabase, session, file);
    setUploading(false);
    if (result.error) { setError(result.error); return; }
    if (result.previewUrl) {
      setPreviewUrl(result.previewUrl);
    } else {
      await load();
    }
    setShowCanvas(false);
    onUploadSuccess?.();
  };

  const handleCanvasExport = async (file) => {
    await handleUploadFile(file);
  };

  const startRedraw = (mode) => {
    setInputMode(mode);
    setShowCanvas(true);
    setError('');
  };

  const ModeToggle = ({ current, onChange }) => (
    <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5 w-fit">
      <button
        type="button"
        onClick={() => onChange('draw')}
        className={`px-3 py-1.5 rounded-md text-xs uppercase tracking-widest transition-all ${
          current === 'draw' ? 'bg-white/10 text-gray-200' : 'text-gray-500 hover:text-gray-300'
        }`}
      >
        <i className="ph ph-pen text-xs mr-1" />
        Draw
      </button>
      <button
        type="button"
        onClick={() => onChange('upload')}
        className={`px-3 py-1.5 rounded-md text-xs uppercase tracking-widest transition-all ${
          current === 'upload' ? 'bg-white/10 text-gray-200' : 'text-gray-500 hover:text-gray-300'
        }`}
      >
        <i className="ph ph-upload-simple text-xs mr-1" />
        Upload PNG
      </button>
    </div>
  );

  return (
    <div
      id="signature-settings"
      className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl"
    >
      <h3 className="text-sm uppercase tracking-widest text-gray-500 mb-1">Your signature</h3>
      <p className="text-sm text-gray-500 leading-relaxed mb-4">
        Used when you Fill &amp; sign vault legal templates. Stored securely in your account.
      </p>

      {loading ? (
        <div className="h-10 w-32 bg-white/5 rounded animate-pulse" />
      ) : previewUrl && !showCanvas ? (
        // Existing signature - preview + replace actions
        <div className="space-y-3">
          <img
            src={previewUrl}
            alt="Your signature"
            className="h-12 max-w-full object-contain bg-white/5 rounded-lg p-2"
          />
          <div className="flex items-center gap-4">
            <button
              type="button"
              disabled={uploading}
              onClick={() => startRedraw('draw')}
              className="text-xs uppercase tracking-widest text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40"
            >
              <i className="ph ph-pen text-xs mr-1" />
              Redraw
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={() => startRedraw('upload')}
              className="text-xs uppercase tracking-widest text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40"
            >
              <i className="ph ph-upload-simple text-xs mr-1" />
              Upload PNG
            </button>
          </div>
          <p className="text-xs text-gray-600">Replacing updates future documents only.</p>
        </div>
      ) : showCanvas ? (
        // Redraw / replace flow
        <div className="space-y-3">
          <ModeToggle current={inputMode} onChange={setInputMode} />
          {inputMode === 'draw' ? (
            <SignatureCanvas
              onExport={handleCanvasExport}
              disabled={uploading}
              onCancel={previewUrl ? () => setShowCanvas(false) : undefined}
            />
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 py-2.5 px-4 border border-dashed border-white/10 rounded-lg text-sm text-gray-500 hover:border-white/20 hover:text-gray-300 transition-all disabled:opacity-40 w-full justify-center"
              >
                <i className="ph ph-upload-simple text-base" />
                {uploading ? 'Uploading…' : 'Choose PNG file'}
              </button>
              {previewUrl && (
                <button
                  type="button"
                  onClick={() => setShowCanvas(false)}
                  className="text-xs uppercase tracking-widest text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        // No signature yet
        <div className="space-y-3">
          <ModeToggle current={inputMode} onChange={setInputMode} />
          {inputMode === 'draw' ? (
            <SignatureCanvas
              onExport={handleCanvasExport}
              disabled={uploading}
            />
          ) : (
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 py-2.5 px-4 border border-dashed border-white/10 rounded-lg text-sm text-gray-500 hover:border-white/20 hover:text-gray-300 transition-all disabled:opacity-40 w-full justify-center"
            >
              <i className="ph ph-upload-simple text-base" />
              {uploading ? 'Uploading…' : 'Upload signature PNG'}
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-300 mt-3">{error}</p>
      )}

      {inputMode === 'upload' && (
        <p className="text-xs text-gray-600 mt-3">PNG recommended. Transparent background works best on documents.</p>
      )}
      {inputMode === 'draw' && (showCanvas || !previewUrl) && (
        <p className="text-xs text-gray-600 mt-3">Draw on a transparent background - works best on signed documents.</p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUploadFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
