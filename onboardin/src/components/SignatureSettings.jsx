import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  fetchActiveMemberSignature,
  signaturePreviewUrl,
  uploadMemberSignaturePng,
} from '../lib/member-signature';

/**
 * Overview card — upload/replace member signature PNG (Supabase).
 */
export default function SignatureSettings({ supabase, session, onUploadSuccess }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    if (!supabase || !session?.user?.id) return;
    setLoading(true);
    setError('');
    try {
      const row = await fetchActiveMemberSignature(supabase, session.user.id);
      if (row?.storage_path) {
        const url = await signaturePreviewUrl(supabase, row.storage_path);
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

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setError('');
    const result = await uploadMemberSignaturePng(supabase, session, file);
    setUploading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPreviewUrl(result.previewUrl);
    onUploadSuccess?.();
  };

  return (
    <div
      id="signature-settings"
      className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl"
    >
      <h3 className="text-sm uppercase tracking-widest text-gray-500 mb-1">Your signature</h3>
      <p className="text-sm text-gray-500 leading-relaxed mb-4">
        Upload a PNG of your signature for vault documents. Stored securely in your account and used only when you sign.
        Review all documents before signing.
      </p>

      {loading ? (
        <div className="h-10 w-32 bg-white/5 rounded animate-pulse" />
      ) : previewUrl ? (
        <div className="space-y-3">
          <img
            src={previewUrl}
            alt="Your signature"
            className="h-12 max-w-full object-contain bg-white/5 rounded-lg p-2"
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="text-xs uppercase tracking-widest text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40"
          >
            {uploading ? 'Uploading…' : 'Replace signature'}
          </button>
          <p className="text-xs text-gray-600">Replacing updates future documents only.</p>
        </div>
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

      <p className="text-xs text-gray-600 mt-3">PNG recommended. Transparent background works best on documents.</p>

      {error && (
        <p className="text-sm text-red-300 mt-3">{error}</p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}