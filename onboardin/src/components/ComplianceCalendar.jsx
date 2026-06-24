import React, { useState } from 'react';
import { displayEntityType } from '../lib/procedures';
import {
  canAccessComplianceCalendar,
  categoryIcon,
  categoryIconBg,
  enrichObligation,
  formatDueDateParts,
  groupObligationsForCalendar,
  obligationStats,
  statusBorderClass,
  statusLabel,
  statusPillClass,
} from '../lib/compliance-obligations';

function ObligationRow({ ob, onMarkFiled, markingId, confirmId, setConfirmId, supabase, session, clientId }) {
  const [proofUploading, setProofUploading] = useState(false);
  const [markError, setMarkError] = useState('');
  const status = ob.effectiveStatus;
  const { day, month } = formatDueDateParts(ob.due_date);
  const isConfirming = confirmId === ob.id;
  const isDone = status === 'done' || status === 'waived';

  const handleMarkFiled = async (file) => {
    if (!supabase || !session) return;
    setProofUploading(true);
    setMarkError('');
    let proofDocumentId = null;

    try {
      if (file) {
        const path = `${clientId}/compliance/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from('client-documents').upload(path, file);
        if (uploadError) throw new Error(uploadError.message);

        const { data: docRow, error: docError } = await supabase
          .from('documents')
          .insert({
            client_id: clientId,
            name: file.name,
            path,
            size: file.size,
            uploaded_by: session.user.id,
            category: 'compliance',
          })
          .select('id')
          .single();
        if (docError) throw new Error(docError.message);
        proofDocumentId = docRow.id;
      }

      const { error } = await supabase
        .from('compliance_obligations')
        .update({
          status: 'done',
          completed_at: new Date().toISOString(),
          ...(proofDocumentId ? { proof_document_id: proofDocumentId } : {}),
        })
        .eq('id', ob.id);
      if (error) throw new Error(error.message);

      setConfirmId(null);
      await onMarkFiled();
    } catch (e) {
      setMarkError(e.message || 'Could not mark as filed');
    }
    setProofUploading(false);
  };

  return (
    <div className={`bg-white/5 border border-white/10 rounded-xl border-l-[3px] ${statusBorderClass(status)} overflow-hidden`}>
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="text-center w-10 flex-shrink-0">
          <div className={`text-lg font-bold leading-none ${status === 'overdue' ? 'text-red-300' : status === 'due-soon' ? 'text-amber-300' : status === 'done' ? 'text-green-300' : 'text-white'}`}>
            {day}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-gray-500">{month}</div>
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${categoryIconBg(status)}`}>
          <i className={`ph ${categoryIcon(ob.category)} text-base`}></i>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{ob.title}</p>
          <p className="text-xs text-gray-500 truncate">
            {ob.authority || ob.category}
            {ob.description ? ` · ${ob.description}` : ''}
          </p>
        </div>
        <span className={`text-[11px] font-semibold uppercase tracking-wider border px-2.5 py-0.5 rounded-full flex-shrink-0 ${statusPillClass(status)}`}>
          {statusLabel(status, ob.daysUntil)}
        </span>
        {!isDone && ob.action_url && (
          <a
            href={ob.action_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-lg bg-gradient-to-r from-blue-500/80 to-purple-500/80 text-white hover:opacity-90 transition-opacity flex-shrink-0"
          >
            {ob.category === 'tax' ? 'Renew' : 'File'} →
          </a>
        )}
        {!isDone && !isConfirming && (
          <button
            type="button"
            onClick={() => setConfirmId(ob.id)}
            disabled={markingId === ob.id}
            className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-lg border border-white/10 text-gray-300 hover:bg-white/5 transition-all flex-shrink-0 disabled:opacity-40"
          >
            Mark filed
          </button>
        )}
      </div>

      {isConfirming && (
        <div className="px-4 pb-4 border-t border-white/5 pt-3 bg-black/20">
          <p className="text-sm text-gray-300 mb-3">Confirm this obligation is filed. Optionally attach proof (receipt, certificate, confirmation).</p>
          {ob.penalty_note && (
            <p className="text-xs text-red-300/80 mb-3 flex items-start gap-1.5">
              <i className="ph ph-warning-circle mt-0.5"></i>
              {ob.penalty_note}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className="px-3 py-1.5 text-xs uppercase tracking-wider border border-white/10 rounded-lg cursor-pointer hover:bg-white/5 transition-all">
              <i className="ph ph-upload-simple mr-1"></i>
              Attach proof
              <input
                type="file"
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleMarkFiled(file);
                  e.target.value = '';
                }}
                disabled={proofUploading}
              />
            </label>
            <button
              type="button"
              onClick={() => handleMarkFiled(null)}
              disabled={proofUploading}
              className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-lg bg-green-500/15 border border-green-500/30 text-green-300 hover:bg-green-500/25 transition-all disabled:opacity-40"
            >
              {proofUploading ? 'Saving…' : 'Confirm filed'}
            </button>
            <button
              type="button"
              onClick={() => { setConfirmId(null); setMarkError(''); }}
              className="px-3 py-1.5 text-xs uppercase tracking-wider text-gray-500 hover:text-gray-300"
            >
              Cancel
            </button>
          </div>
          {markError && <p className="text-xs text-red-400 mt-2">{markError}</p>}
        </div>
      )}

      {ob.fee_description && !isConfirming && (
        <details className="px-4 pb-3 group">
          <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-400 list-none flex items-center gap-1">
            <i className="ph ph-caret-down group-open:rotate-180 transition-transform"></i>
            Details
          </summary>
          <div className="mt-2 space-y-1 text-xs text-gray-500">
            {ob.fee_description && <p><span className="text-gray-600">Fee:</span> {ob.fee_description}</p>}
            {ob.penalty_note && <p className="text-red-300/70"><span className="text-gray-600">Penalty:</span> {ob.penalty_note}</p>}
            {ob.requirements?.length > 0 && (
              <p><span className="text-gray-600">Requirements:</span> {ob.requirements.join(' · ')}</p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

export default function ComplianceCalendar({
  clientProfile,
  obligations,
  loading,
  error,
  onRefresh,
  supabase,
  session,
  onUpgrade,
}) {
  const [confirmId, setConfirmId] = useState(null);
  const [viewMode, setViewMode] = useState('calendar');
  const access = canAccessComplianceCalendar(clientProfile);

  if (!access.access) {
    const isGrowth = access.reason === 'growth';
    return (<div className="bg-gradient-to-br from-purple-500/5 to-blue-500/5 border border-purple-500/15 rounded-2xl p-8 backdrop-blur-xl text-center">
        <i className={`ph ${isGrowth ? 'ph-lock-simple' : 'ph-calendar-check'} text-3xl text-purple-300/60 mb-4 block`}></i>
        <p className="text-sm uppercase tracking-widest text-gray-500 mb-2">Compliance Calendar</p>
        <p className="text-base text-gray-400 leading-relaxed max-w-md mx-auto mb-4">
          {isGrowth
            ? 'Recurring filing deadlines, TCC renewals, annual reports, franchise tax, and more. Unlock with Growth.'
            : 'Your compliance calendar activates when your entity is active or onboarding is complete (step 7+).'}
        </p>
        {isGrowth && (
          <button type="button" onClick={onUpgrade} className="text-sm uppercase tracking-widest text-purple-300 border border-purple-500/30 px-4 py-2 rounded-lg hover:bg-purple-500/10 transition-all">
            Upgrade to Growth →
          </button>
        )}
      </div>
    );
  }

  const enriched = (obligations || []).map(enrichObligation);
  const stats = obligationStats(enriched);
  const { overdue, months, completed } = groupObligationsForCalendar(enriched);
  const pending = enriched.filter((o) => o.effectiveStatus !== 'done' && o.effectiveStatus !== 'waived');

  if (error) {
    return (
      <div className="bg-white/5 border border-red-500/20 rounded-2xl p-6 backdrop-blur-xl text-center">
        <p className="text-sm text-red-300 mb-3">{error}</p>
        <button type="button" onClick={onRefresh} className="text-xs uppercase tracking-widest text-purple-300 border border-purple-500/30 px-3 py-2 rounded-lg hover:bg-purple-500/10">
          Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-white/5 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (enriched.length === 0) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl text-center">
        <i className="ph ph-calendar-check text-3xl text-gray-600 mb-3 block"></i>
        <p className="text-sm uppercase tracking-widest text-gray-500 mb-2">No obligations yet</p>
        <p className="text-base text-gray-500">Recurring compliance deadlines will appear here once your specialist seeds them for your jurisdiction.</p>
      </div>
    );
  }

  const jurisdictionLabel = [
    clientProfile?.jurisdiction,
    clientProfile?.entity_type ? displayEntityType(clientProfile.entity_type) : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm uppercase tracking-widest text-gray-500 mb-1">Compliance Calendar</h3>
        <p className="text-sm text-gray-500">
          {jurisdictionLabel || 'Your entity'}
          {stats.overdue > 0 && <> · <span className="text-red-300">{stats.overdue} overdue</span></>}
          {stats.dueSoon > 0 && <> · <span className="text-amber-300">{stats.dueSoon} due soon</span></>}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white/5 border border-red-400/20 rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Overdue</p>
          <p className="text-2xl font-bold text-red-300">{stats.overdue}</p>
        </div>
        <div className="bg-white/5 border border-amber-400/20 rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Due in 30 days</p>
          <p className="text-2xl font-bold text-amber-300">{stats.dueSoon}</p>
        </div>
        <div className="bg-white/5 border border-blue-400/20 rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Upcoming</p>
          <p className="text-2xl font-bold text-blue-300">{stats.upcoming}</p>
        </div>
        <div className="bg-white/5 border border-green-400/20 rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Completed</p>
          <p className="text-2xl font-bold text-green-300">{stats.completed}</p>
        </div>
      </div>

      <div className="flex gap-1 bg-white/[0.03] border border-white/10 rounded-lg p-1 w-fit">
        {['calendar', 'timeline'].map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={`px-4 py-1.5 text-xs uppercase tracking-wider rounded-md transition-all ${viewMode === mode ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            {mode === 'calendar' ? 'Calendar' : 'Timeline'}
          </button>
        ))}
      </div>

      {viewMode === 'timeline' ? (
        <div className="space-y-0">
          {pending.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')).map((ob, idx, arr) => (
            <div key={ob.id} className="flex gap-4 pb-5 relative">
              {idx < arr.length - 1 && (
                <div className="absolute left-5 top-10 bottom-0 w-px bg-white/10" />
              )}
              <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center flex-shrink-0 z-10 bg-[#1a0b2e] ${ob.effectiveStatus === 'overdue' ? 'border-red-400 text-red-300' : ob.effectiveStatus === 'due-soon' ? 'border-amber-400 text-amber-300' : 'border-blue-400/40 text-blue-300'}`}>
                <i className={`ph ${categoryIcon(ob.category)} text-base`}></i>
              </div>
              <div className="flex-1 pt-1.5">
                <p className="text-xs text-gray-500 font-semibold mb-0.5">
                  {ob.due_date ? new Date(`${ob.due_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date'}
                  {ob.effectiveStatus === 'overdue' && ' · OVERDUE'}
                </p>
                <p className="text-sm font-semibold text-white">{ob.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{ob.description || ob.authority}</p>
                {ob.penalty_note && (
                  <p className="text-xs text-red-300/80 mt-1 flex items-center gap-1">
                    <i className="ph ph-warning-circle"></i>
                    {ob.penalty_note}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {overdue.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-red-300 mb-3 flex items-center gap-2">
                Overdue
                <span className="flex-1 h-px bg-white/10" />
              </p>
              <div className="space-y-2">
                {overdue.map((ob) => (
                  <ObligationRow
                    key={ob.id}
                    ob={ob}
                    onMarkFiled={onRefresh}
                    markingId={null}
                    confirmId={confirmId}
                    setConfirmId={setConfirmId}
                    supabase={supabase}
                    session={session}
                    clientId={clientProfile.id}
                  />
                ))}
              </div>
            </div>
          )}
          {months.map(([label, items]) => (
            <div key={label}>
              <p className="text-xs uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-2">
                {label}
                <span className="flex-1 h-px bg-white/10" />
              </p>
              <div className="space-y-2">
                {items.map((ob) => (
                  <ObligationRow
                    key={ob.id}
                    ob={ob}
                    onMarkFiled={onRefresh}
                    markingId={null}
                    confirmId={confirmId}
                    setConfirmId={setConfirmId}
                    supabase={supabase}
                    session={session}
                    clientId={clientProfile.id}
                  />
                ))}
              </div>
            </div>
          ))}
          {completed.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-green-300/80 mb-3 flex items-center gap-2">
                Completed
                <span className="flex-1 h-px bg-white/10" />
              </p>
              <div className="space-y-2">
                {completed.map((ob) => (
                  <ObligationRow
                    key={ob.id}
                    ob={ob}
                    onMarkFiled={onRefresh}
                    markingId={null}
                    confirmId={confirmId}
                    setConfirmId={setConfirmId}
                    supabase={supabase}
                    session={session}
                    clientId={clientProfile.id}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}