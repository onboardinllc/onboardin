/**
 * Node-only PDF fill — PyMuPDF AcroForm or pdf-lib coordinate overlay.
 * Used by local verification scripts; not bundled into the PWA.
 */
import { getPdfFillStrategy } from '../src/lib/pdf-field-map.js';
import { fillCojPdfWithMupdf } from './coj-mupdf-bridge.mjs';
import { buildSignedPdf } from '../src/lib/document-sign-pdf.js';

export async function buildFilledPdf({
  templatePdfBytes,
  fieldMap,
  fieldValues,
  formKind,
}) {
  const strategy = getPdfFillStrategy(fieldMap);
  if (!strategy) return { pdfBytes: templatePdfBytes, filledCount: 0 };

  if (strategy === 'acro') {
    return fillCojPdfWithMupdf({ templatePdfBytes, formKind, fieldValues, fieldMap });
  }

  const textFieldMap = Object.fromEntries(
    Object.entries(fieldMap || {}).filter(([, def]) => def?.type === 'text' || def?.type === 'date'),
  );
  const textValues = Object.fromEntries(
    Object.entries(fieldValues || {}).filter(([k]) => textFieldMap[k]),
  );
  const hasText = Object.values(textValues).some((v) => String(v).trim());
  if (!hasText) return { pdfBytes: templatePdfBytes, filledCount: 0 };

  const pdfBytes = await buildSignedPdf({
    templatePdfBytes,
    fieldMap: textFieldMap,
    fieldValues: textValues,
    placements: {},
  });
  const filledCount = Object.keys(textValues).filter((k) => String(textValues[k]).trim()).length;
  return { pdfBytes, filledCount };
}

export const buildCojFilledPdf = buildFilledPdf;