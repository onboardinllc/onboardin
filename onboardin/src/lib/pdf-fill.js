/**
 * Browser PDF fill — document-fill edge (MuPDF AcroForm or coordinate overlay).
 * Node scripts use scripts/pdf-fill-node.mjs instead.
 */
import { getPdfFillStrategy } from './pdf-field-map.js';
import { fillAcroPdfViaEdge, fillCoordinatePdfViaEdge } from './pdf-autofill-edge.js';

export {
  hasAcroFieldMap,
  hasAcroFieldMap as hasCojAcroFieldMap,
  hasCoordinateFieldMap,
  getPdfFillStrategy,
  canAutofillTemplate,
} from './pdf-field-map.js';

export function clearForm6ShellCache() {}

/**
 * Fill a template PDF using the correct engine for its field_map.
 */
export async function buildFilledPdf({
  templatePdfBytes,
  fieldMap,
  fieldValues,
  formKind,
  supabase,
  template,
}) {
  const strategy = getPdfFillStrategy(fieldMap);
  if (!strategy) return { pdfBytes: templatePdfBytes, filledCount: 0 };
  if (!supabase) throw new Error('PDF autofill requires a signed-in session.');

  if (strategy === 'acro') {
    return fillAcroPdfViaEdge({
      supabase,
      template,
      formId: formKind || template?.kind,
      fieldValues,
    });
  }

  // coordinate — text/date fields only (signatures added later in sign overlay)
  const textFieldMap = Object.fromEntries(
    Object.entries(fieldMap || {}).filter(([, def]) => def?.type === 'text' || def?.type === 'date'),
  );
  const textValues = Object.fromEntries(
    Object.entries(fieldValues || {}).filter(([k]) => textFieldMap[k]),
  );
  const hasText = Object.values(textValues).some((v) => String(v).trim());
  if (!hasText) return { pdfBytes: templatePdfBytes, filledCount: 0 };

  return fillCoordinatePdfViaEdge({ supabase, template, fieldValues: textValues });
}

/** @deprecated use buildFilledPdf */
export const buildCojFilledPdf = buildFilledPdf;