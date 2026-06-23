import React, { useState } from 'react';
import {
  enrichObligation,
  formatDueDateParts,
  statusLabel,
  statusPillClass,
} from '../lib/compliance-obligations';

export default function AdminObligationsPanel({
  client,
  obligations,
  loading,
  onRefresh,
  supabase,
  session,
}) {
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState('');
  const [seedOk, setSeedOk] = useState('');
  const [editingDueId, setEditingDueId] = useState(null);
  const [dueDraft, setDueDraft] = useState('');
  const [actionError, setActionError] = useState('');
  const [actioningId, setActioningId] = useState(null);

  const handleSeed = async () => {
    if (!supabase || !client) return;
    setSeeding(true);
    setSeedError('');
    setSeedOk('');
    const { error } = await supabase.rpc('seed_obligations_for_client', { p_client_id: client.id });
    if (error) {
      setSeedError(error.message);
    } else {
      setSeedOk('Obligations seeded (idempotent, no duplicate slugs).');
      await onRefresh();
    }
    setSeeding(false);
  };

  const updateObligation = async (id, patch) => {
    if (!supabase) return;
    setActioningId(id);
    setActionError('');
    const { error } = await supabase.from('compliance_obligations').update(patch).eq('id', id);
    if (error) setActionError(error.message);
    else await onRefresh();
    setActioningId(null);
    setEditingDueId(null);
  };

  const handleMarkFiled = (id) => updateObligation(id, {
    status: 'done',
    completed_at: new Date().toISOString(),
  });

  const handleWaive = (id) => updateObligation(id, { status: 'waived' });

  const handleSaveDueDate = (id) => {
    if (!dueDraft) return;
    updateObligation(id, { due_date: dueDraft, status: 'upcoming' });
  };

  const enriched = (obligations || []).map(enrichObligation);
  const activeCount = enriched.filter((o) => o.effectiveStatus !== 'done' && o.effectiveStatus !== 'waived').length;

  return (
    <div className="px-6 py-4 border-t border-white/5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-sm uppercase tracking-widest text-gray-500">Recurring Obligations</p>
          <p className="text-xs text-gray-600 mt-0.5">
            <code className="text-purple-300/70">compliance_obligations</code>
            {' · '}
            {loading ? '…' : `${enriched.length} rows · ${activeCount} active`}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSeed}
          disabled={seeding}
          className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-lg border border-purple-500/30 text-purple-300 hover:bg-purple-500/10 transition-all disabled:opacity-40"
        >
          {seeding ? 'Seeding…' : 'Seed obligations'}
        </button>
      </div>

      {seedError && <p className="text-xs text-red-400 mb-2">{seedError}</p>}
      {seedOk && <p className="text-xs text-green-400 mb-2">{seedOk}</p>}
      {actionError && <p className="text-xs text-red-400 mb-2">{actionError}</p>}

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />)}
        </div>
      ) : enriched.length === 0 ? (
        <p className="text-sm text-gray-600 italic">
          No obligations seeded yet. Set lifecycle to active or click Seed obligations for this client&apos;s jurisdiction.
        </p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {enriched.map((ob) => {
            const { day, month } = formatDueDateParts(ob.due_date);
            const isEditing = editingDueId === ob.id;
            return (
              <div key={ob.id} className="flex flex-wrap items-center gap-2 py-2 px-3 bg-white/5 rounded-lg">
                <div className="text-center w-8 flex-shrink-0">
                  <div className="text-sm font-bold text-gray-300 leading-none">{day}</div>
                  <div className="text-[9px] uppercase text-gray-600">{month}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-300 truncate">{ob.title}</p>
                  <p className="text-xs text-gray-600 truncate">{ob.slug} · {ob.authority || ob.seeded_from || 'n/a'}</p>
                </div>
                <span className={`text-[10px] uppercase tracking-widest border px-2 py-0.5 rounded-full flex-shrink-0 ${statusPillClass(ob.effectiveStatus)}`}>
                  {statusLabel(ob.effectiveStatus, ob.daysUntil)}
                </span>
                {isEditing ? (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <input
                      type="date"
                      value={dueDraft}
                      onChange={(e) => setDueDraft(e.target.value)}
                      className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-gray-300"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveDueDate(ob.id)}
                      disabled={actioningId === ob.id}
                      className="text-xs text-green-300 hover:text-green-200"
                    >
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingDueId(null)} className="text-xs text-gray-500">×</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {ob.effectiveStatus !== 'done' && ob.effectiveStatus !== 'waived' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleMarkFiled(ob.id)}
                          disabled={actioningId === ob.id}
                          className="text-[10px] uppercase tracking-wider text-green-300 border border-green-500/20 px-2 py-0.5 rounded hover:bg-green-500/10 disabled:opacity-40"
                        >
                          Filed
                        </button>
                        <button
                          type="button"
                          onClick={() => handleWaive(ob.id)}
                          disabled={actioningId === ob.id}
                          className="text-[10px] uppercase tracking-wider text-gray-400 border border-white/10 px-2 py-0.5 rounded hover:bg-white/5 disabled:opacity-40"
                        >
                          Waive
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingDueId(ob.id); setDueDraft(ob.due_date || ''); }}
                          className="text-[10px] uppercase tracking-wider text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded hover:bg-blue-500/10"
                        >
                          Due
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}