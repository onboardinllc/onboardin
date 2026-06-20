/**
 * Step 06 — Privacy & Compliance helpers.
 * Slug resolution, intake visibility, accept_criteria evaluation, vault categories.
 */

const FORMATION_SLUG_MAP = {
  'jamaica-ltd': 'jamaica-ltd-privacy',
  'us-de-c-corp': 'us-de-c-corp-privacy',
  'us-de-llc': 'us-de-llc-privacy',
  'us-wy-llc': 'us-wy-llc-privacy',
};

export function resolveFormationSlug(country, jurisdiction, entityType) {
  const isJamaica = country === 'Jamaica' || jurisdiction === 'Jamaica';
  if (isJamaica) return 'jamaica-ltd';
  if (jurisdiction === 'Wyoming' && (entityType === 'LLC' || entityType === 'S-Corp')) return 'us-wy-llc';
  if (entityType === 'C-Corp' && (jurisdiction === 'Delaware' || country === 'United States')) return 'us-de-c-corp';
  if ((entityType === 'LLC' || entityType === 'S-Corp') && jurisdiction === 'Wyoming') return 'us-wy-llc';
  if ((entityType === 'LLC' || entityType === 'S-Corp') && (jurisdiction === 'Delaware' || country === 'United States')) return 'us-de-llc';
  return null;
}

export function resolveComplianceSlug(country, jurisdiction, entityType) {
  const formation = resolveFormationSlug(country, jurisdiction, entityType);
  if (!formation) return null;
  return FORMATION_SLUG_MAP[formation] || null;
}

/** Merge client profile fields into intake answers (maps_to: clients.field). */
export function buildIntakeAnswers(intakeRow, clientProfile = {}) {
  if (!intakeRow?.artifact_path) return {};
  try {
    const parsed = JSON.parse(intakeRow.artifact_path);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch { /* fall through */ }
  return {};
}

export function mergeProfileIntoIntake(answers, clientProfile = {}, intakeQuestions = []) {
  const merged = { ...answers };
  for (const q of intakeQuestions) {
    if (!q.maps_to || !q.maps_to.startsWith('clients.')) continue;
    const field = q.maps_to.replace('clients.', '');
    if (clientProfile[field] != null && clientProfile[field] !== '' && merged[q.id] == null) {
      merged[q.id] = clientProfile[field];
    }
  }
  return merged;
}

export function evaluateCondition(condition, intake) {
  if (!condition || typeof condition !== 'object') return true;
  return Object.entries(condition).every(([key, expected]) => {
    const actual = intake[key];
    if (Array.isArray(expected)) {
      return expected.includes(actual);
    }
    if (expected === true) return actual === true || actual === 'true' || actual === 'yes' || actual === 'Yes';
    if (expected === false) return actual === false || actual === 'false' || actual === 'no' || actual === 'No';
    return actual === expected;
  });
}

export function shouldShowIntakeQuestion(question, intake) {
  if (!question.show_if) return true;
  return evaluateCondition(question.show_if, intake);
}

export function isIntakeQuestionAnswered(question, intake) {
  const val = intake[question.id];
  if (question.type === 'multiselect') return Array.isArray(val) && val.length > 0;
  if (question.type === 'boolean') return val === true || val === false;
  if (question.type === 'url') return val == null || String(val).trim() !== '' || !question.required;
  return val != null && String(val).trim() !== '';
}

export function isIntakeComplete(blueprint, intake) {
  const questions = blueprint?.intake_questions || [];
  const required = questions.filter((q) => q.required && shouldShowIntakeQuestion(q, intake));
  return required.every((q) => isIntakeQuestionAnswered(q, intake));
}

export function isStepRequired(step, intake) {
  if (!step) return false;
  if (step.required === false && !step.required_if) return false;
  if (step.required_if) return evaluateCondition(step.required_if, intake);
  return step.required !== false;
}

function artifactForKind(artifacts, kind) {
  return (artifacts || []).find((a) => a.kind === kind && a.status === 'active');
}

function stepSatisfied(step, intake, artifacts, docs) {
  if (!step) return true;
  if (step.action_type === 'intake') {
    return isIntakeComplete({ intake_questions: step._intake_questions || [] }, intake);
  }
  if (step.action_type === 'acknowledge') {
    const kind = step.artifact_kind || step.id;
    return !!artifactForKind(artifacts, kind);
  }
  if (step.action_type === 'upload' || step.action_type === 'artifact') {
    const kind = step.artifact_kind || step.id;
    const art = artifactForKind(artifacts, kind);
    if (art && (art.hosted_url || art.artifact_path)) return true;
    const proof = step.vault_proof;
    if (proof?.required) {
      const cat = proof.category;
      return (docs || []).some((d) => d.category === cat);
    }
    if (step.action_type === 'artifact' && art) return true;
    return false;
  }
  return false;
}

/** Parse accept_criteria strings from blueprint. */
export function evaluateAcceptCriteria(blueprint, intake, artifacts, docs) {
  if (!blueprint) return { pass: false, missing: ['No compliance blueprint'] };
  const criteria = blueprint.accept_criteria || [];
  const steps = blueprint.steps || [];
  const stepById = Object.fromEntries(steps.map((s) => [s.id, s]));
  const missing = [];

  for (const line of criteria) {
    const trimmed = String(line).trim();
    if (trimmed === 'compliance_intake complete' || trimmed.endsWith('intake complete')) {
      if (!isIntakeComplete(blueprint, intake)) missing.push('Complete compliance intake');
      continue;
    }
    const whenMatch = trimmed.match(/^(.+?)\s+active\s+when\s+(.+)$/i);
    const simpleActive = trimmed.match(/^(.+?)\s+active$/i);
    if (whenMatch) {
      const stepId = whenMatch[1].trim();
      const condStr = whenMatch[2].trim();
      const condTrue = condStr.match(/^(\w+)\s+is\s+true$/i);
      const condFalse = condStr.match(/^(\w+)\s+is\s+false$/i);
      if (condTrue) {
        const field = condTrue[1];
        if (!evaluateCondition({ [field]: true }, intake)) continue;
      } else if (condFalse) {
        const field = condFalse[1];
        if (!evaluateCondition({ [field]: false }, intake)) continue;
      } else if (condStr.includes(' is true')) {
        const field = condStr.replace(/\s+is\s+true/i, '').trim();
        if (!evaluateCondition({ [field]: true }, intake)) continue;
      }
      const step = stepById[stepId];
      if (step && isStepRequired(step, intake) && !stepSatisfied(step, intake, artifacts, docs)) {
        missing.push(step.title || stepId);
      }
      continue;
    }
    if (simpleActive) {
      const stepId = simpleActive[1].trim();
      if (stepId === 'compliance_intake') {
        if (!isIntakeComplete(blueprint, intake)) missing.push('Complete compliance intake');
        continue;
      }
      const step = stepById[stepId];
      if (!step) {
        const kind = stepId.replace(/_/g, '_');
        if (!artifactForKind(artifacts, kind) && !artifactForKind(artifacts, stepId)) {
          missing.push(stepId);
        }
        continue;
      }
      if (isStepRequired(step, intake) && !stepSatisfied(step, intake, artifacts, docs)) {
        missing.push(step.title || stepId);
      }
      continue;
    }
    if (trimmed.includes('acknowledged')) {
      const stepId = trimmed.split(' ')[0];
      const step = stepById[stepId];
      if (step && isStepRequired(step, intake) && !stepSatisfied(step, intake, artifacts, docs)) {
        missing.push(step.title || stepId);
      }
      continue;
    }
  }

  return { pass: missing.length === 0, missing };
}

export function getComplianceVaultCategories(blueprint) {
  if (!blueprint?.steps) return [];
  const seen = new Set();
  const cats = [];
  for (const step of blueprint.steps) {
    const proof = step.vault_proof;
    if (proof?.category && !seen.has(proof.category)) {
      seen.add(proof.category);
      cats.push({
        id: proof.category,
        label: proof.label || proof.category,
        icon: 'ph-shield-check',
        desc: step.description || `Proof for ${step.title}`,
        required: !!proof.required,
        compliance: true,
      });
    }
  }
  return cats;
}

export const COMPLIANCE_DISCLAIMER =
  'This guided procedure helps you prepare and publish compliance documents. It does not provide legal advice. Termly, OIC, and FinCEN filings are manual in v1 — upload proof when complete.';

export const TERMLY_URL = 'https://termly.io';