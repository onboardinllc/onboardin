/**
 * Pure helpers for the COJ formation packet (Jamaica Ltd).
 * No Supabase imports — data comes in from the caller.
 */

export const COJ_PACKET_FORMS = [
  {
    form_id: 'coj_form_6',
    kind: 'coj_form_6',
    label: 'Form 6 — Name Reservation',
    download_url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/form-6.pdf',
    portal_url: 'https://www.orcjamaica.com',
  },
  {
    form_id: 'coj_brf1',
    kind: 'coj_brf1',
    label: 'BRF1 Super Form',
    download_url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/brf1.pdf',
    portal_url: 'https://www.orcjamaica.com/Forms.aspx',
  },
  {
    form_id: 'coj_form_1a',
    kind: 'coj_form_1a',
    label: 'Form 1A — Articles',
    download_url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/form-1a.pdf',
    portal_url: null,
  },
  {
    form_id: 'coj_bor',
    kind: 'coj_bor',
    label: 'BOR (Form A)',
    download_url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/form-a.pdf',
    portal_url: null,
  },
];

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

export function workingCopyPath(clientId, formId, ts, filename) {
  const safeFilename = filename ? filename.replace(/[^a-zA-Z0-9._-]/g, '_') : 'working.pdf';
  return `${clientId}/articles/${formId}/working-${ts || Date.now()}.${safeFilename.split('.').pop() || 'pdf'}`;
}

export function assertWorkingCopyPath(clientId, formId) {
  if (!UUID_RE.test(clientId)) throw new Error('Invalid clientId in working copy path.');
  if (!COJ_FORM_IDS.includes(formId)) throw new Error(`Invalid COJ form_id: ${formId}`);
}
