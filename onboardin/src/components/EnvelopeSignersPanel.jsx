import { useState } from 'react';

const FIELD_LABELS = {
  founder_1_signature: 'Founder 1 signature',
  founder_2_signature: 'Founder 2 signature',
  effective_date: 'Effective date',
};

/**
 * Assign co-signer emails to signature fields from multi_signer_field_map.
 * Initiator is always founder_1_signature (auto-assigned, not shown here).
 * Props:
 *   multiSignerFieldMap  — { [fieldKey]: { type, ... } }
 *   onSubmit(signers)    — called with [{ email, displayName, fieldKeys }]
 *   onCancel
 *   disabled
 */
export default function EnvelopeSignersPanel({ multiSignerFieldMap, onSubmit, onCancel, disabled }) {
  // Invitee fields: all signature fields except founder_1_signature (initiator's)
  const inviteeSignatureKeys = Object.entries(multiSignerFieldMap || {})
    .filter(([key, def]) => def.type === 'signature' && key !== 'founder_1_signature')
    .map(([key]) => key);

  const [rows, setRows] = useState(() =>
    inviteeSignatureKeys.map((key) => ({ fieldKey: key, email: '', displayName: '' })),
  );
  const [submitError, setSubmitError] = useState('');

  const updateRow = (idx, field, value) => {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const handleSubmit = () => {
    setSubmitError('');
    const emails = rows.map((r) => r.email.trim().toLowerCase());

    // Validate emails
    for (const r of rows) {
      const e = r.email.trim();
      if (!e) { setSubmitError('All signers must have an email address.'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        setSubmitError(`"${e}" is not a valid email address.`); return;
      }
    }

    // Check duplicates among invitees
    const uniqueEmails = new Set(emails);
    if (uniqueEmails.size !== emails.length) {
      setSubmitError('Each signer must have a unique email address.'); return;
    }

    const signers = rows.map((r) => ({
      email: r.email.trim(),
      displayName: r.displayName.trim() || null,
      fieldKeys: [r.fieldKey],
    }));

    onSubmit(signers);
  };

  if (inviteeSignatureKeys.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-500">
        No co-signer fields defined for this template.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">Signers</p>
        <p className="text-xs text-gray-500">
          You sign as Founder 1. Add co-founders below.
        </p>
      </div>

      {rows.map((row, idx) => (
        <div key={row.fieldKey} className="space-y-2 p-3 rounded-lg border border-white/10 bg-white/[0.02]">
          <p className="text-xs uppercase tracking-widest text-gray-500">
            {FIELD_LABELS[row.fieldKey] || row.fieldKey.replace(/_/g, ' ')}
          </p>
          <input
            type="email"
            placeholder="Email address"
            value={row.email}
            disabled={disabled}
            onChange={(e) => updateRow(idx, 'email', e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/40 disabled:opacity-40"
          />
          <input
            type="text"
            placeholder="Display name (optional)"
            value={row.displayName}
            disabled={disabled}
            onChange={(e) => updateRow(idx, 'displayName', e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/40 disabled:opacity-40"
          />
        </div>
      ))}

      {submitError && (
        <p className="text-sm text-red-300">{submitError}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="py-2 px-4 border border-white/10 rounded-lg text-xs uppercase tracking-widest text-gray-500 hover:text-white transition-all disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled}
          className="flex-1 py-2.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-xl text-sm uppercase tracking-widest text-purple-200 transition-all disabled:opacity-40"
        >
          {disabled ? 'Creating…' : 'Create envelope'}
        </button>
      </div>
    </div>
  );
}
