/** Public legal template PDFs — hosted in Supabase public-forms bucket. */
const FALLBACK_SUPABASE_URL = 'https://qatfiicpkunabpphwqee.supabase.co';
const envUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseUrl = envUrl && !envUrl.startsWith('your-') ? envUrl : FALLBACK_SUPABASE_URL;

export const PUBLIC_FORMS_BASE = `${supabaseUrl}/storage/v1/object/public/public-forms`;

export const LEGAL_TEMPLATE_PATHS = {
  founder_agreement: 'templates/founder-agreement-v1.pdf',
  llc_operating_agreement: 'templates/llc-operating-agreement.pdf',
  corp_bylaws: 'templates/corp-bylaws.pdf',
  jm_shareholders_agreement: 'templates/jm-shareholders-agreement.pdf',
  stock_purchase_agreement: 'templates/stock-purchase-agreement.pdf',
};

export function legalTemplateUrl(key) {
  const path = LEGAL_TEMPLATE_PATHS[key];
  if (!path) throw new Error(`Unknown legal template key: ${key}`);
  return `${PUBLIC_FORMS_BASE}/${path}`;
}

/** True when vault card can use DocumentFillPanel (has hosted template). */
export function isFillableTemplateUrl(url) {
  if (!url) return false;
  return url.includes('/public-forms/templates/');
}