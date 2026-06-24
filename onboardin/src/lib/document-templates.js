/**
 * Resolve the correct legal_templates row for a given vault card + client profile.
 * Never use vault_card_id alone — multiple rows share vault_card_id (entity/kind/jurisdiction).
 */

import { normalizeEntityType, isJamaicaProfile } from './procedures.js';

function buildKindFilter(vaultCardId, isJamaica, entityType) {
  if (vaultCardId !== 'operating_agreement') return null;
  if (isJamaica && entityType === 'Ltd') return 'jm_shareholders_agreement';
  if (entityType === 'C-Corp') return 'corp_bylaws';
  if (entityType === 'LLC' || entityType === 'S-Corp') return 'operating_agreement';
  return null;
}

function matchesEntityType(rowEntityType, entityType) {
  if (!entityType) return true;
  if (!rowEntityType || rowEntityType === 'all') return true;
  return rowEntityType === entityType || normalizeEntityType(rowEntityType) === entityType;
}

function matchesJurisdiction(rowJurisdiction, isJamaica, entityType) {
  if (isJamaica && entityType === 'Ltd') {
    return rowJurisdiction === 'Jamaica' || rowJurisdiction === 'all';
  }
  return rowJurisdiction !== 'Jamaica';
}

/**
 * Fetch the matching template row from Supabase.
 * entity_type + jurisdiction narrow the result when multiple rows share vault_card_id.
 */
export async function resolveTemplate({ vaultCardId, jurisdiction, country, entityType }, supabaseClient) {
  const { supabase: defaultClient } = await import('./supabase.js');
  const client = supabaseClient || defaultClient;
  const entity = normalizeEntityType(entityType);
  const isJamaica = isJamaicaProfile(country, jurisdiction);

  let query = client
    .from('legal_templates')
    .select('*')
    .eq('vault_card_id', vaultCardId)
    .eq('active', true);

  const kindFilter = buildKindFilter(vaultCardId, isJamaica, entity);
  if (kindFilter) query = query.eq('kind', kindFilter);

  if (entity) {
    query = query.or(`entity_type.eq.${entity},entity_type.eq.all`);
  }

  if (isJamaica && entity === 'Ltd') {
    query = query.eq('jurisdiction', 'Jamaica');
  }

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Offline version that resolves against a pre-fetched array of templates.
 * Used in verify scripts and tests (no live DB needed).
 */
export function resolveTemplateOffline({ vaultCardId, jurisdiction, country, entityType }, templates) {
  const entity = normalizeEntityType(entityType);
  const isJamaica = isJamaicaProfile(country, jurisdiction);

  return templates.find((t) => {
    if (t.vault_card_id !== vaultCardId) return false;
    if (!t.active) return false;
    if (!matchesEntityType(t.entity_type, entity)) return false;
    if (!matchesJurisdiction(t.jurisdiction, isJamaica, entity)) return false;

    if (vaultCardId === 'operating_agreement') {
      if (isJamaica && entity === 'Ltd') return t.kind === 'jm_shareholders_agreement';
      if (entity === 'C-Corp') return t.kind === 'corp_bylaws';
      if (entity === 'LLC' || entity === 'S-Corp') return t.kind === 'operating_agreement';
    }
    return true;
  }) || null;
}