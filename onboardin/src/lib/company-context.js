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
