/**
 * Pure helpers for compliance intake auto-save and resume.
 * Used by Step06Panel (via App.jsx callbacks) - no Supabase imports here.
 */

export function serializeIntake(intakeAnswers) {
  return JSON.stringify(intakeAnswers ?? {});
}

export function parseIntakeRow(intakeRow) {
  if (!intakeRow?.artifact_path) return {};
  try {
    const parsed = JSON.parse(intakeRow.artifact_path);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch { /* fall through */ }
  return {};
}

export function buildDraftPayload({ clientId, blueprintId, lastResearched, intakeAnswers, jurisdiction }) {
  return {
    client_id: clientId,
    kind: 'compliance_intake',
    label: 'Compliance intake',
    jurisdiction: jurisdiction || 'multi',
    artifact_path: serializeIntake(intakeAnswers),
    status: 'draft',
    source: 'autosave',
    procedure_version: `${blueprintId}@${lastResearched || 'v1'}`,
  };
}

export function buildActivePayload({ clientId, blueprintId, lastResearched, intakeAnswers, jurisdiction }) {
  return {
    client_id: clientId,
    kind: 'compliance_intake',
    label: 'Compliance intake',
    jurisdiction: jurisdiction || 'multi',
    artifact_path: serializeIntake(intakeAnswers),
    status: 'active',
    source: 'client',
    procedure_version: `${blueprintId}@${lastResearched || 'v1'}`,
  };
}
