/**
 * COJ Form 6 — readable AcroForm field names (pdf-lib indices are wrong / encrypted).
 * Fill by name like Acrobat: DAY, MONTH, YEAR, REQUESTED BY, STREET 1, NAME 1.
 */

/** @type {Record<string, Record<string, string | { day: string, month: string, year: string }>>} */
export const COJ_ACRO_PDF_FIELDS = {
  coj_form_6: {
    proposed_company_name: 'NAME 1',
    applicant_name: 'REQUESTED BY',
    applicant_address: 'STREET 1',
    reservation_date: { day: 'DAY', month: 'MONTH', year: 'YEAR' },
  },
};

/** @param {string} isoDate YYYY-MM-DD or dd/mm/yyyy */
export function splitReservationDate(isoDate) {
  const v = String(isoDate ?? '').trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [year, month, day] = v.split('-');
    return { day, month, year: year.slice(-2) };
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) {
    const [d, m, y] = v.split('/');
    return { day: d.padStart(2, '0'), month: m.padStart(2, '0'), year: y.slice(-2) };
  }
  return null;
}

/**
 * Map resolved placeholder field_values → PDF AcroForm field name → value.
 * @param {string} formKind
 * @param {Record<string, string>} fieldValues
 * @param {Record<string, { acroField?: string, type?: string }>} [fieldMap]
 * @returns {Record<string, string>}
 */
export function cojPdfFieldNameValues(formKind, fieldValues, fieldMap = {}) {
  const out = {};
  const spec = COJ_ACRO_PDF_FIELDS[formKind];

  if (spec) {
    for (const [key, pdfName] of Object.entries(spec)) {
      if (!pdfName || typeof pdfName !== 'string') continue;
      const v = String(fieldValues?.[key] ?? '').trim();
      if (v) out[pdfName] = v;
    }
    const dateSpec = spec.reservation_date;
    const dateVal = fieldValues?.reservation_date;
    if (dateSpec && typeof dateSpec === 'object' && dateVal) {
      const parts = splitReservationDate(dateVal);
      if (parts) {
        if (parts.day) out[dateSpec.day] = parts.day;
        if (parts.month) out[dateSpec.month] = parts.month;
        if (parts.year) out[dateSpec.year] = parts.year;
      }
    }
  }

  // Form 1A and others: readable acroField names on template.field_map
  for (const [key, def] of Object.entries(fieldMap || {})) {
    if (!def?.acroField || out[def.acroField]) continue;
    const v = String(fieldValues?.[key] ?? '').trim();
    if (v) out[String(def.acroField)] = v;
  }

  return out;
}