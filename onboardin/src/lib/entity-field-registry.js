/**
 * Canonical field registry - loaded from Supabase entity_field_definitions.
 * Fallback seed for offline/dev until migrations applied.
 * Admin updates DB; Publish syncs legal_templates maps.
 */

/** @typedef {{ registry_key: string, label: string, group_name: string, data_type: string, profile_path: string, repeat_group?: string, assistant_eligible?: boolean, ui_collect?: boolean }} FieldDefinition */

const FALLBACK_DEFINITIONS = [
  { registry_key: 'legal_name', label: 'Proposed company name', group_name: 'company', data_type: 'string', profile_path: 'legal_name', ui_collect: true },
  { registry_key: 'applicant.name', label: 'Applicant name', group_name: 'applicant', data_type: 'string', profile_path: 'applicant.name', ui_collect: true },
  { registry_key: 'applicant.address', label: 'Applicant address', group_name: 'applicant', data_type: 'string', profile_path: 'applicant.address', ui_collect: true },
  { registry_key: 'reservation_date', label: 'Reservation date', group_name: 'filing', data_type: 'date', profile_path: 'reservation_date', ui_collect: false },
  { registry_key: 'authorized_share_capital', label: 'Authorized share capital', group_name: 'company', data_type: 'string', profile_path: 'authorized_share_capital', ui_collect: true },
  { registry_key: 'directors.name', label: 'Director name', group_name: 'directors', data_type: 'string', profile_path: 'directors[].name', repeat_group: 'directors', ui_collect: true },
  { registry_key: 'shareholders.name', label: 'Shareholder name', group_name: 'shareholders', data_type: 'string', profile_path: 'shareholders[].name', repeat_group: 'shareholders', ui_collect: true },
  { registry_key: 'bor_notes', label: 'BOR notes', group_name: 'filing', data_type: 'text', profile_path: 'bor_notes', assistant_eligible: true, ui_collect: true },
];

let cachedDefinitions = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60_000;

/**
 * @param {{ jurisdiction?: string, entityType?: string }} [scope]
 * @returns {FieldDefinition[]}
 */
export function fallbackDefinitions(scope = {}) {
  return FALLBACK_DEFINITIONS.filter((d) => {
    if (scope.jurisdiction === 'Jamaica') return true;
    return true;
  });
}

/**
 * Load active definitions from Supabase (or fallback).
 * @param {import('@supabase/supabase-js').SupabaseClient} [supabase]
 * @param {{ jurisdiction?: string, entityType?: string }} [scope]
 */
export async function loadFieldDefinitions(supabase, scope = {}) {
  const now = Date.now();
  if (cachedDefinitions && now - cacheLoadedAt < CACHE_TTL_MS) {
    return filterDefinitions(cachedDefinitions, scope);
  }

  if (!supabase) {
    return filterDefinitions(fallbackDefinitions(scope), scope);
  }

  let query = supabase
    .from('entity_field_definitions')
    .select('registry_key, label, group_name, data_type, profile_path, repeat_group, assistant_eligible, ui_collect, jurisdiction, entity_type')
    .eq('active', true);

  const { data, error } = await query;
  if (error || !data?.length) {
    return filterDefinitions(fallbackDefinitions(scope), scope);
  }

  cachedDefinitions = data;
  cacheLoadedAt = now;
  return filterDefinitions(data, scope);
}

function filterDefinitions(list, scope) {
  const { jurisdiction, entityType } = scope;
  return list.filter((d) => {
    if (jurisdiction && d.jurisdiction && d.jurisdiction !== jurisdiction) return false;
    if (entityType && d.entity_type && d.entity_type !== entityType) return false;
    return true;
  });
}

/** Keys the auto-harvester watches for a given scope. */
export async function watchlistKeys(supabase, scope = {}) {
  const defs = await loadFieldDefinitions(supabase, scope);
  return defs.map((d) => d.registry_key);
}

export function clearFieldRegistryCache() {
  cachedDefinitions = null;
  cacheLoadedAt = 0;
}