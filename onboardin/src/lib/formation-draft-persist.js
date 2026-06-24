/**
 * Pure helpers for formation_draft autosave and resume.
 * Mirrors compliance-intake-persist pattern. No Supabase imports here.
 */

import { FORMATION_DRAFT_SCHEMA } from './coj-formation-packet.js';

export function serializeFormationDraft(draft) {
  return JSON.stringify(draft ?? {});
}

export function parseFormationDraft(rawJsonOrObject) {
  if (!rawJsonOrObject) return { ...FORMATION_DRAFT_SCHEMA };
  if (typeof rawJsonOrObject === 'object') {
    return { ...FORMATION_DRAFT_SCHEMA, ...rawJsonOrObject };
  }
  try {
    const parsed = JSON.parse(rawJsonOrObject);
    if (parsed && typeof parsed === 'object') {
      return { ...FORMATION_DRAFT_SCHEMA, ...parsed };
    }
  } catch { /* fall through */ }
  return { ...FORMATION_DRAFT_SCHEMA };
}

export function buildDraftPatch(draft) {
  return { formation_draft: draft ?? {} };
}
