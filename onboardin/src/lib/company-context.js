/**
 * Context merge precedence: clients.* → formation_draft.* → compliance_intake (active only)
 * Rightmost wins on conflict. Resolver is read-only — never writes clients row.
 */

export function resolveCompanyContext({ client, formationDraft, complianceIntake }) {
  const base = {
    company_name: client?.company_name || '',
    founder_name: client?.founder_name || '',
    jurisdiction: client?.jurisdiction || '',
    country: client?.country || '',
    entity_type: client?.entity_type || '',
    business_intent: client?.business_intent || '',
    sells_to: client?.sells_to || '',
  };

  const draft = typeof formationDraft === 'string'
    ? safeParseJson(formationDraft)
    : (formationDraft || {});

  const intake = typeof complianceIntake === 'string'
    ? safeParseJson(complianceIntake)
    : (complianceIntake || {});

  const merged = { ...base, ...draft, ...intake };

  merged._computed = {
    today: new Date().toISOString().slice(0, 10),
    governing_law: resolveGoverningLaw(merged),
  };

  // Preserve raw draft for dotted-path resolution in resolveCojFieldValues
  merged._rawDraft = draft;

  return merged;
}

function resolveGoverningLaw(ctx) {
  if (ctx.country === 'Jamaica' || ctx.jurisdiction === 'Jamaica') return 'Jamaica';
  if (ctx.jurisdiction) return `the State of ${ctx.jurisdiction}`;
  if (ctx.country) return ctx.country;
  return '';
}

/**
 * Substitutes {{token}} placeholders in a string using resolved context.
 * Falls back to empty string for missing keys.
 */
export function applyPlaceholderMap(template, context) {
  if (!template || typeof template !== 'string') return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (key in context) return String(context[key] ?? '');
    if (context._computed && key in context._computed) return String(context._computed[key] ?? '');
    return '';
  });
}

/**
 * Resolves the flat field values from a placeholder_map definition.
 * Returns { fieldKey: resolvedValue } — ready to write to document_jobs.field_values.
 * Keys marked llm:true get a sentinel '__llm__' value; the edge function fills them.
 */
export function resolveFieldValues(placeholderMap, context) {
  const result = {};
  if (!placeholderMap || typeof placeholderMap !== 'object') return result;

  for (const [key, def] of Object.entries(placeholderMap)) {
    if (def.llm) {
      result[key] = '__llm__';
      continue;
    }
    const source = def.source || '';
    if (source.startsWith('clients.')) {
      const col = source.slice('clients.'.length);
      result[key] = context[col] ?? '';
    } else if (source.startsWith('computed.')) {
      const col = source.slice('computed.'.length);
      result[key] = context._computed?.[col] ?? '';
    } else if (source.startsWith('formation_draft.')) {
      const col = source.slice('formation_draft.'.length);
      result[key] = context[col] ?? '';
    } else if (source.startsWith('compliance_intake.')) {
      const col = source.slice('compliance_intake.'.length);
      result[key] = context[col] ?? '';
    } else {
      result[key] = '';
    }
  }
  return result;
}

function safeParseJson(str) {
  try { return JSON.parse(str) || {}; } catch { return {}; }
}

/**
 * Flatten directors/shareholders arrays into keyed scalars for placeholder resolution.
 * directors[0] → director_1_name, director_1_address, director_1_trn (up to 4)
 * shareholders[0] → shareholder_1_name, ..._address, ..._trn, ..._shares (up to 4)
 */
export function flattenFormationDraft(draft) {
  const out = {};
  if (!draft || typeof draft !== 'object') return out;

  const dirs = Array.isArray(draft.directors) ? draft.directors : [];
  for (let i = 0; i < Math.min(dirs.length, 4); i++) {
    const d = dirs[i] || {};
    const n = i + 1;
    out[`director_${n}_name`]    = String(d.name    || '');
    out[`director_${n}_address`] = String(d.address || '');
    out[`director_${n}_trn`]     = String(d.trn     || '');
  }

  const shs = Array.isArray(draft.shareholders) ? draft.shareholders : [];
  for (let i = 0; i < Math.min(shs.length, 4); i++) {
    const s = shs[i] || {};
    const n = i + 1;
    out[`shareholder_${n}_name`]    = String(s.name    || '');
    out[`shareholder_${n}_address`] = String(s.address || '');
    out[`shareholder_${n}_trn`]     = String(s.trn     || '');
    out[`shareholder_${n}_shares`]  = String(s.shares  || '');
  }

  return out;
}

/**
 * Resolve a single field from a source string against a flat context map.
 * Supported prefixes: clients.*, computed.*, formation_draft.*, compliance_intake.*
 * Also resolves flattened keys (director_1_name etc.) already merged into context.
 * Dotted paths like formation_draft.directors.0.name fall back to '' — flatten first.
 */
export function resolveFieldValueFromSource(source, context) {
  if (!source || typeof source !== 'string') return '';
  const prefixes = ['clients.', 'computed.', 'formation_draft.', 'compliance_intake.'];
  for (const pfx of prefixes) {
    if (source.startsWith(pfx)) {
      const key = source.slice(pfx.length);
      // Direct key lookup in merged flat context
      if (key in context) return String(context[key] ?? '');
      if (context._computed && key in context._computed) return String(context._computed[key] ?? '');
      // Dotted sub-path: formation_draft.directors.0.name — walk raw draft
      if (pfx === 'formation_draft.' && key.includes('.')) {
        const parts = key.split('.');
        let cur = context._rawDraft ?? {};
        for (const p of parts) {
          if (cur == null || typeof cur !== 'object') return '';
          cur = Array.isArray(cur) ? cur[parseInt(p, 10)] : cur[p];
        }
        return String(cur ?? '');
      }
      return '';
    }
  }
  // Unqualified key — direct lookup
  if (source in context) return String(context[source] ?? '');
  return '';
}

/**
 * Resolve all COJ placeholder_map fields deterministically (0 credits).
 * Flattens formation_draft arrays before resolving.
 * Returns { fieldKey: resolvedValue } — no __llm__ sentinels.
 */
export function resolveCojFieldValues(template, context) {
  const placeholderMap = template?.placeholder_map ?? {};
  const draft = context._rawDraft ?? {};
  const flat = flattenFormationDraft(draft);
  const enriched = { ...context, ...flat };

  const result = {};
  for (const [key, def] of Object.entries(placeholderMap)) {
    if (!def || typeof def !== 'object') continue;
    const source = def.source || '';
    result[key] = resolveFieldValueFromSource(source, enriched);
  }
  return result;
}
