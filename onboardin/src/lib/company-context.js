/**
 * Context merge precedence: clients.* → entity_profile.facts.* → formation_draft.* → compliance_intake (active only)
 * Rightmost wins on conflict. Resolver is read-only - never writes clients row.
 */

/**
 * Map entity_profile.facts into formation_draft-shaped flat keys for placeholder resolution.
 * Profile uses canonical names (legal_name); maps still reference formation_draft.* sources.
 */
export function profileFactsToFlat(facts) {
  const out = {};
  if (!facts || typeof facts !== 'object') return out;

  if (facts.legal_name) out.proposed_company_name = String(facts.legal_name);
  if (facts.authorized_share_capital) {
    out.authorized_share_capital = String(facts.authorized_share_capital);
  }
  if (facts.bor_notes) out.bor_notes = String(facts.bor_notes);
  if (facts.reservation_date) out.reservation_date = String(facts.reservation_date);

  const office = facts.registered_office;
  if (office && typeof office === 'object') {
    const line = office.line1 || office.street || '';
    if (line) out.registered_office_address = String(line);
  } else if (typeof office === 'string' && office) {
    out.registered_office_address = office;
  }

  if (facts.applicant && typeof facts.applicant === 'object') {
    if (facts.applicant.name) out.applicant_name = String(facts.applicant.name);
    if (facts.applicant.address) out.applicant_address = String(facts.applicant.address);
  }

  return { ...out, ...flattenFormationDraft({
    directors: Array.isArray(facts.directors) ? facts.directors : [],
    shareholders: Array.isArray(facts.shareholders) ? facts.shareholders : [],
  }) };
}

/**
 * Superset of resolveCompanyContext - includes entity_profile.facts in merge chain.
 * Called by autofill-service; replaces ad-hoc context builds in coj-prefill.
 * merge order: clients.* → entity_profile.facts → formation_draft → compliance_intake
 */
export function resolveEntityFacts({ client, entityProfile, formationDraft, complianceIntake }) {
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

  const profileFacts = (entityProfile?.facts) ?? {};
  const profileFlat = profileFactsToFlat(profileFacts);
  const draftFlat = flattenFormationDraft(draft);

  const merged = {
    ...base,
    ...profileFlat,
    ...draft,
    ...draftFlat,
    ...intake,
  };

  merged._computed = {
    today: new Date().toISOString().slice(0, 10),
    governing_law: resolveGoverningLaw(merged),
  };

  merged._rawDraft = draft;
  merged._rawProfile = profileFacts;

  return merged;
}

/**
 * Merge completed field_values and formation_draft fields back into entity_profile.facts.
 * Writes a best-effort patch; never overwrites user-entered data (provenance.source === 'user').
 * Non-blocking - called fire-and-forget from autofill-service.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} clientId
 * @param {object} formationDraft
 * @param {Record<string, string>} fieldValues
 */
export async function syncFormationDraftToProfile(supabase, clientId, formationDraft, fieldValues) {
  if (!supabase || !clientId) return;

  const draft = typeof formationDraft === 'string'
    ? safeParseJson(formationDraft)
    : (formationDraft || {});

  const factsPatch = {};
  const companyName = draft.proposed_company_name || fieldValues?.proposed_company_name;
  if (companyName) factsPatch.legal_name = companyName;
  const officeLine = draft.registered_office_address || fieldValues?.registered_office_address;
  if (officeLine) factsPatch.registered_office = { line1: officeLine };
  const capital = draft.authorized_share_capital || fieldValues?.authorized_share_capital;
  if (capital) factsPatch.authorized_share_capital = capital;
  if (Array.isArray(draft.directors) && draft.directors.length) factsPatch.directors = draft.directors;
  if (Array.isArray(draft.shareholders) && draft.shareholders.length) factsPatch.shareholders = draft.shareholders;
  if (fieldValues?.bor_notes) factsPatch.bor_notes = fieldValues.bor_notes;
  if (fieldValues?.applicant_name || fieldValues?.applicant_address) {
    factsPatch.applicant = { ...(factsPatch.applicant || {}) };
    if (fieldValues.applicant_name) factsPatch.applicant.name = fieldValues.applicant_name;
    if (fieldValues.applicant_address) factsPatch.applicant.address = fieldValues.applicant_address;
  }

  if (!Object.keys(factsPatch).length) return;

  const { data: row } = await supabase
    .from('clients')
    .select('entity_profile')
    .eq('id', clientId)
    .maybeSingle();

  const current = row?.entity_profile ?? {};
  const merged = {
    version: 1,
    updated_at: new Date().toISOString(),
    updated_by: 'autofill',
    facts: { ...(current.facts ?? {}), ...factsPatch },
    provenance: current.provenance ?? {},
  };

  const keysSynced = Object.keys(factsPatch);
  const now = new Date().toISOString();
  for (const k of keysSynced) {
    if (!merged.provenance[k] || merged.provenance[k]?.source !== 'user') {
      merged.provenance[k] = { source: 'autofill', updated_at: now };
    }
  }

  await supabase
    .from('clients')
    .update({ entity_profile: merged })
    .eq('id', clientId);
}

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
 * Returns { fieldKey: resolvedValue } - ready to write to document_jobs.field_values.
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
    } else if (source.startsWith('entity_profile.')) {
      const col = source.slice('entity_profile.'.length);
      result[key] = resolveProfileFieldValue(col, context._rawProfile ?? {});
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
 * Dotted paths like formation_draft.directors.0.name fall back to '' - flatten first.
 */
function walkDottedPath(root, path) {
  if (!path) return '';
  const parts = path.split('.');
  let cur = root ?? {};
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return '';
    cur = Array.isArray(cur) ? cur[parseInt(p, 10)] : cur[p];
  }
  return cur == null ? '' : String(cur);
}

/** Map formation_draft dotted paths to entity_profile.facts when draft is empty. */
function resolveProfileFieldValue(path, profileFacts) {
  if (!profileFacts || typeof profileFacts !== 'object') return '';
  if (path === 'proposed_company_name' || path === 'legal_name') {
    return String(profileFacts.legal_name ?? '');
  }
  if (path === 'registered_office_address') {
    const office = profileFacts.registered_office;
    if (office && typeof office === 'object') return String(office.line1 || office.street || '');
    return typeof office === 'string' ? office : '';
  }
  if (path.startsWith('directors.') || path.startsWith('shareholders.')) {
    return walkDottedPath(profileFacts, path);
  }
  return walkDottedPath(profileFacts, path);
}

export function resolveFieldValueFromSource(source, context) {
  if (!source || typeof source !== 'string') return '';
  const prefixes = ['clients.', 'computed.', 'formation_draft.', 'compliance_intake.', 'entity_profile.'];
  for (const pfx of prefixes) {
    if (source.startsWith(pfx)) {
      const key = source.slice(pfx.length);
      // Direct key lookup in merged flat context
      if (key in context) return String(context[key] ?? '');
      if (context._computed && key in context._computed) return String(context._computed[key] ?? '');
      if (pfx === 'entity_profile.') {
        return resolveProfileFieldValue(key, context._rawProfile ?? {});
      }
      // Dotted sub-path: formation_draft.directors.0.name - draft wins, profile fallback
      if (pfx === 'formation_draft.' && key.includes('.')) {
        const fromDraft = walkDottedPath(context._rawDraft ?? {}, key);
        if (fromDraft) return fromDraft;
        return resolveProfileFieldValue(key, context._rawProfile ?? {});
      }
      return '';
    }
  }
  // Unqualified key - direct lookup
  if (source in context) return String(context[source] ?? '');
  return '';
}

/**
 * Resolve all COJ placeholder_map fields deterministically (0 credits).
 * Flattens formation_draft arrays before resolving.
 * Returns { fieldKey: resolvedValue } - no __llm__ sentinels.
 */
export function resolveCojFieldValues(template, context) {
  const placeholderMap = template?.placeholder_map ?? {};
  const draft = context._rawDraft ?? {};
  // Director/shareholder flattened keys only - profile + draft precedence already in context.
  const enriched = { ...context, ...flattenFormationDraft(draft) };

  const result = {};
  for (const [key, def] of Object.entries(placeholderMap)) {
    if (!def || typeof def !== 'object') continue;
    const source = def.source || '';
    result[key] = resolveFieldValueFromSource(source, enriched);
  }
  return result;
}
