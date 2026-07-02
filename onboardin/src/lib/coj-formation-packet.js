/**
 * Pure helpers for the COJ formation packet (Jamaica Ltd).
 * No Supabase imports - data comes in from the caller.
 * Form URLs/CTAs are sourced from vault procedures (articles process steps).
 */
import { JAMAICA_LTD } from './procedures.js';
import { canAutofillTemplate } from './pdf-field-map.js';

/** Map hosted PDF filename → packet form ids (must match legal_templates.kind). */
const COJ_URL_FORM_META = {
  'form-6.pdf': { form_id: 'coj_form_6', kind: 'coj_form_6', label: 'Form 6 - Name Reservation' },
  'brf1.pdf': { form_id: 'coj_brf1', kind: 'coj_brf1', label: 'BRF1 Super Form' },
  'form-1a.pdf': { form_id: 'coj_form_1a', kind: 'coj_form_1a', label: 'Form 1A - Articles' },
  'form-a.pdf': { form_id: 'coj_bor', kind: 'coj_bor', label: 'BOR (Form A)' },
};

function buildCojPacketFormsFromVault() {
  const articles = JAMAICA_LTD.find((c) => c.id === 'articles');
  const steps = articles?.process?.tracks?.[0]?.steps?.filter((s) => s.url) || [];
  const forms = [];
  for (const step of steps) {
    const fileKey = Object.keys(COJ_URL_FORM_META).find((k) => step.url.includes(k));
    if (!fileKey) continue;
    const meta = COJ_URL_FORM_META[fileKey];
    forms.push({
      form_id: meta.form_id,
      kind: meta.kind,
      label: meta.label,
      download_url: step.url,
      download_cta: step.cta || 'Download form',
      portal_url: step.portalUrl || null,
      portal_cta: step.portalCta || null,
      step_action: step.action,
    });
  }
  return forms;
}

export const COJ_PACKET_FORMS = buildCojPacketFormsFromVault();

/** True when legal_templates row points at the same official PDF as the vault step. */
export function isCojTemplateLinked(template, formDef) {
  if (!template?.template_path || !formDef?.download_url) return false;
  return template.template_path === formDef.download_url;
}

/** Autofill is allowed when template is linked and field_map is fillable. */
export function canCojAutofill(template, formDef) {
  if (!isCojTemplateLinked(template, formDef)) return false;
  return canAutofillTemplate(template);
}

export const COJ_FORM_IDS = COJ_PACKET_FORMS.map((f) => f.form_id);

export const COJ_FORM_STATUSES = {
  DRAFT: 'draft',
  PREFILLED: 'prefilled',
  WORKING_SAVED: 'working_saved',
  READY_TO_FILE: 'ready_to_file',
  FILED_PENDING: 'filed_pending',
  VOIDED: 'voided',
};

export const FORMATION_DRAFT_SCHEMA = {
  proposed_company_name: '',
  registered_office_address: '',
  authorized_share_capital: '',
  directors: [{ name: '', address: '', trn: '' }],
  shareholders: [{ name: '', address: '', trn: '', shares: '' }],
  bor_notes: '',
};

/**
 * Counts how many COJ forms have at least one working copy saved.
 * jobs: array of document_jobs rows with template kind + status.
 * docs: array of documents rows with category field.
 */
export function resolvePacketProgress(jobs, docs) {
  const jobList = Array.isArray(jobs) ? jobs : Object.values(jobs || {});
  const savedFormIds = new Set(
    (docs || [])
      .filter((d) => COJ_FORM_IDS.includes(d.category))
      .map((d) => d.category),
  );
  const filedFormIds = new Set(
    jobList
      .filter((j) => {
        const formId = j.kind || j.form_id;
        return j.status === COJ_FORM_STATUSES.FILED_PENDING && COJ_FORM_IDS.includes(formId);
      })
      .map((j) => j.kind || j.form_id),
  );
  return {
    saved: savedFormIds.size,
    filed: filedFormIds.size,
    total: COJ_PACKET_FORMS.length,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Canonical editable COJ form path - one per form, upserted on autofill or manual save. */
export function cojWorkingCopyCanonicalPath(clientId, formId) {
  return `${clientId}/articles/${formId}/working-latest.pdf`;
}

export function workingCopyPath(clientId, formId, ts, filename) {
  const safeFilename = filename ? filename.replace(/[^a-zA-Z0-9._-]/g, '_') : 'working.pdf';
  return `${clientId}/articles/${formId}/working-${ts || Date.now()}.${safeFilename.split('.').pop() || 'pdf'}`;
}

export function assertWorkingCopyPath(clientId, formId) {
  if (!UUID_RE.test(clientId)) throw new Error('Invalid clientId in working copy path.');
  if (!COJ_FORM_IDS.includes(formId)) throw new Error(`Invalid COJ form_id: ${formId}`);
}
