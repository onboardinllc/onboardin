/**
 * Filing adapter stubs - Phase A only.
 * Phase C replaces submitViaApi with a real COJ API call.
 */

const COJ_PORTAL_URLS = {
  coj_form_6: 'https://www.orcjamaica.com',
  coj_brf1: 'https://www.orcjamaica.com/Forms.aspx',
  coj_form_1a: 'https://www.orcjamaica.com',
  coj_bor: 'https://www.orcjamaica.com',
};

export function getCojPortalUrl(formId) {
  return COJ_PORTAL_URLS[formId] || 'https://www.orcjamaica.com';
}

export async function markFiledManual(supabase, jobId) {
  const { error } = await supabase
    .from('document_jobs')
    .update({ status: 'filed_pending', updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) throw new Error(error.message);
}

export function submitViaApi() {
  throw new Error('not_implemented');
}
