/**
 * Profile harvest - the single place that normalizes filled fields into
 * clients.entity_profile.facts with per-key provenance. Deterministic, 0 credits,
 * never calls the Assistant. Every document touchpoint (autofill, formation-draft
 * save, future upload/sign) funnels its known values through here so the next form
 * already knows them.
 *
 * Provenance shape per key: { source: 'autofill'|'formation_draft'|'upload', updated_at, template_kind? }
 * User wins: a fact whose provenance.source === 'user' is never overwritten.
 */
import { loadFieldDefinitions } from './entity-field-registry.js';

const PROFILE_VERSION = 1;

/** Trim to a clean string; empty/blank -> ''. */
function clean(value) {
  return String(value ?? '').trim();
}

/**
 * Map deterministic autofill field_values (resolved COJ keys) into entity_profile facts.
 * v1 COJ map; registry-aware for future keys via the optional registry list.
 *
 * @param {Record<string, string>} fieldValues
 * @param {{ kind?: string, provider?: string }} [template]
 * @param {Array<{ registry_key: string, profile_path: string }>} [registry]
 * @returns {Record<string, unknown>} facts patch (only populated keys)
 */
export function harvestFactsFromFieldValues(fieldValues = {}, template = {}, registry = []) {
  const fv = fieldValues || {};
  const patch = {};

  const legalName = clean(fv.proposed_company_name || fv.legal_name);
  if (legalName) patch.legal_name = legalName;

  const office = clean(fv.registered_office_address);
  if (office) patch.registered_office = { line1: office };

  const capital = clean(fv.authorized_share_capital);
  if (capital) patch.authorized_share_capital = capital;

  const applicantName = clean(fv.applicant_name);
  const applicantAddress = clean(fv.applicant_address);
  if (applicantName || applicantAddress) {
    patch.applicant = {};
    if (applicantName) patch.applicant.name = applicantName;
    if (applicantAddress) patch.applicant.address = applicantAddress;
  }

  const borNotes = clean(fv.bor_notes);
  if (borNotes) patch.bor_notes = borNotes;

  const reservationDate = clean(fv.reservation_date);
  if (reservationDate) patch.reservation_date = reservationDate;

  applyRegistryKeys(patch, fv, registry);
  return patch;
}

/**
 * Map an in-progress formation_draft into entity_profile facts. Same target shape;
 * carries director/shareholder arrays the field_values path does not.
 *
 * @param {object} draft
 * @param {Array<{ registry_key: string, profile_path: string }>} [registry]
 * @returns {Record<string, unknown>} facts patch (only populated keys)
 */
export function harvestFactsFromFormationDraft(draft = {}, registry = []) {
  const d = draft || {};
  const patch = {};

  const legalName = clean(d.proposed_company_name);
  if (legalName) patch.legal_name = legalName;

  const office = clean(d.registered_office_address);
  if (office) patch.registered_office = { line1: office };

  const capital = clean(d.authorized_share_capital);
  if (capital) patch.authorized_share_capital = capital;

  if (Array.isArray(d.directors) && d.directors.some((x) => clean(x?.name))) {
    patch.directors = d.directors;
  }
  if (Array.isArray(d.shareholders) && d.shareholders.some((x) => clean(x?.name))) {
    patch.shareholders = d.shareholders;
  }

  applyRegistryKeys(patch, d, registry);
  return patch;
}

/**
 * Pull any extra registry-defined scalar keys whose value is present in the source.
 * Registry rows with a dotted/array profile_path are left to the explicit handlers
 * above; this only covers flat single-key facts so future keys harvest without code.
 */
function applyRegistryKeys(patch, source, registry) {
  if (!Array.isArray(registry) || !registry.length) return;
  for (const def of registry) {
    const key = def?.profile_path;
    const regKey = def?.registry_key;
    if (!key || key.includes('.') || key.includes('[')) continue;
    if (key in patch) continue;
    const raw = source?.[regKey] ?? source?.[key];
    const val = clean(raw);
    if (val) patch[key] = val;
  }
}

/**
 * Merge a facts patch into clients.entity_profile, writing per-key provenance and
 * honoring user-wins. Returns the new entity_profile json so the caller can refresh
 * React state without a second fetch. No-op (returns current/null) when patch empty.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} clientId
 * @param {Record<string, unknown>} factsPatch
 * @param {{ source?: string, template_kind?: string }} [meta]
 * @returns {Promise<object|null>} merged entity_profile (or null if nothing written)
 */
export async function mergeProfilePatch(supabase, clientId, factsPatch, meta = {}) {
  if (!supabase || !clientId) return null;
  const patch = factsPatch || {};
  const keys = Object.keys(patch);
  if (!keys.length) return null;

  const { data: row } = await supabase
    .from('clients')
    .select('entity_profile')
    .eq('id', clientId)
    .maybeSingle();

  const current = row?.entity_profile ?? {};
  const currentFacts = current.facts ?? {};
  const currentProv = current.provenance ?? {};

  const source = meta.source || 'autofill';
  const now = new Date().toISOString();

  const nextFacts = { ...currentFacts };
  const nextProv = { ...currentProv };
  let wrote = 0;

  for (const k of keys) {
    // User wins: never overwrite a fact the member set by hand.
    if (currentProv[k]?.source === 'user') continue;
    nextFacts[k] = patch[k];
    nextProv[k] = { source, updated_at: now };
    if (meta.template_kind) nextProv[k].template_kind = meta.template_kind;
    wrote += 1;
  }

  if (!wrote) return current;

  const merged = {
    version: current.version ?? PROFILE_VERSION,
    updated_at: now,
    updated_by: source,
    facts: nextFacts,
    provenance: nextProv,
  };

  const { error } = await supabase
    .from('clients')
    .update({ entity_profile: merged })
    .eq('id', clientId);
  if (error) throw new Error(error.message);

  return merged;
}

/**
 * Harvest from a completed autofill (field_values + the draft that fed it) into the
 * profile. Returns the merged entity_profile (or null). Callers may await this to
 * refresh UI state, but should not block autofill success on its result.
 */
export async function harvestAfterAutofill(supabase, clientId, { fieldValues, formationDraft, template, registry, scope } = {}) {
  const defs = await resolveRegistry(supabase, registry, scope);
  const fromValues = harvestFactsFromFieldValues(fieldValues, template, defs);
  const fromDraft = harvestFactsFromFormationDraft(
    typeof formationDraft === 'string' ? safeParse(formationDraft) : formationDraft,
    defs,
  );
  // field_values (what was actually written to the PDF) takes priority over draft.
  const patch = { ...fromDraft, ...fromValues };
  return mergeProfilePatch(supabase, clientId, patch, {
    source: 'autofill',
    template_kind: template?.kind,
  });
}

/**
 * Harvest from a formation_draft save. Returns the merged entity_profile (or null).
 */
export async function harvestAfterDraftSave(supabase, clientId, formationDraft, registry, scope) {
  const defs = await resolveRegistry(supabase, registry, scope);
  const draft = typeof formationDraft === 'string' ? safeParse(formationDraft) : formationDraft;
  const patch = harvestFactsFromFormationDraft(draft, defs);
  return mergeProfilePatch(supabase, clientId, patch, { source: 'formation_draft' });
}

/**
 * Use an explicit registry list if given, else load active field definitions for
 * the client's scope. A registry load failure is swallowed (returns []) so harvest
 * always falls back to the hardcoded COJ map and never blocks the document action.
 */
async function resolveRegistry(supabase, registry, scope) {
  if (Array.isArray(registry)) return registry;
  if (!supabase) return [];
  try {
    return await loadFieldDefinitions(supabase, scope || {});
  } catch {
    return [];
  }
}

function safeParse(str) {
  try { return JSON.parse(str) || {}; } catch { return {}; }
}
