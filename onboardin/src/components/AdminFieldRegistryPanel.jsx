import React, { useEffect, useState } from 'react';

/**
 * Crew-only COJ prefill field registry. Publish catalog rows to legal_templates maps.
 */
export default function AdminFieldRegistryPanel({ supabase }) {
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      const { data, error: qErr } = await supabase
        .from('legal_templates')
        .select('id, kind, label, provider')
        .eq('provider', 'coj')
        .order('kind');
      if (cancelled) return;
      if (qErr) {
        setError(qErr.message || 'Could not load COJ templates.');
        setTemplates([]);
      } else {
        setTemplates(data || []);
        if (data?.length && !selectedId) setSelectedId(data[0].id);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !selectedId) {
      setCatalog([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setCatalogLoading(true);
      setError('');
      const { data, error: qErr } = await supabase
        .from('template_field_catalog')
        .select('field_key, pdf_label, registry_key, active, pdf_target, field_type')
        .eq('template_id', selectedId)
        .order('field_key');
      if (cancelled) return;
      if (qErr) {
        setError(qErr.message || 'Could not load field catalog.');
        setCatalog([]);
      } else {
        setCatalog(data || []);
      }
      setCatalogLoading(false);
    })();
    return () => { cancelled = true; };
  }, [supabase, selectedId]);

  const handlePublish = async () => {
    if (!supabase || !selectedId || publishing) return;
    setPublishing(true);
    setStatus('');
    setError('');
    const { data, error: rpcErr } = await supabase.rpc('publish_template_maps', {
      p_template_id: selectedId,
    });
    setPublishing(false);
    if (rpcErr) {
      setError(rpcErr.message || 'Publish failed.');
      return;
    }
    const keys = data?.field_map ? Object.keys(data.field_map).length : 0;
    setStatus(`Published ${keys} field map entries to live template.`);
  };

  const selectedTemplate = templates.find((t) => t.id === selectedId);
  const activeCount = catalog.filter((r) => r.active).length;

  return (
    <div className="mb-8 bg-white/[0.02] border border-white/10 rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm uppercase tracking-widest text-purple-200">COJ field registry</h3>
          <p className="text-xs text-gray-500 mt-1">Crew Publish: push catalog rows to legal_templates placeholder_map and field_map.</p>
        </div>
        <button
          type="button"
          onClick={handlePublish}
          disabled={publishing || !selectedId || loading}
          className="px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-xl text-xs uppercase tracking-widest text-purple-200 transition-all disabled:opacity-40"
        >
          {publishing ? 'Publishing…' : 'Publish to template'}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-600">Loading templates…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <label className="text-xs uppercase tracking-widest text-gray-500">Template</label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.label || t.kind}</option>
              ))}
            </select>
            {selectedTemplate && (
              <span className="text-xs text-gray-600">{activeCount} active catalog rows</span>
            )}
          </div>

          {error && (
            <div className="mb-3 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-300">{error}</div>
          )}
          {status && (
            <div className="mb-3 p-3 rounded-lg border border-green-500/30 bg-green-500/10 text-sm text-green-300">{status}</div>
          )}

          {catalogLoading ? (
            <p className="text-sm text-gray-600">Loading catalog…</p>
          ) : catalog.length === 0 ? (
            <p className="text-sm text-gray-600">No catalog rows for this template. Apply migration 20260631_field_registry.sql if the table is empty.</p>
          ) : (
            <div className="overflow-x-auto max-h-64 overflow-y-auto border border-white/5 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-[#0e0c1a] text-gray-500 uppercase tracking-widest">
                  <tr>
                    <th className="px-3 py-2">Field</th>
                    <th className="px-3 py-2">Registry key</th>
                    <th className="px-3 py-2">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.map((row) => (
                    <tr key={row.field_key} className="border-t border-white/5 text-gray-300">
                      <td className="px-3 py-2">
                        <span className="text-white">{row.field_key}</span>
                        {row.pdf_label && <span className="block text-gray-600">{row.pdf_label}</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px]">{row.registry_key || '—'}</td>
                      <td className="px-3 py-2">{row.active ? 'yes' : 'pending'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
