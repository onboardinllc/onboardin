/**
 * Fill COJ statutory PDFs via AcroForm fields.
 * COJ Form 6 template is encrypted — Chrome ignores new content on encrypted saves.
 * We read widget rects from the source form, copy pages into an unencrypted PDF,
 * and draw black text at those rects so the browser PDF viewer shows filled values.
 */
import { PDFDocument, StandardFonts, rgb } from '../vendor/pdf-lib.esm.min.js';

/** Browser-safe — Buffer is Node-only and breaks mobile autofill. */
function templateIsEncrypted(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const needle = [0x2f, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74]; // /Encrypt
  for (let i = 0; i <= u8.length - needle.length; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (u8[i + j] !== needle[j]) { match = false; break; }
    }
    if (match) return true;
  }
  return false;
}

function fieldValueForKey(key, def, fieldValues, placements) {
  if (def.type === 'date') {
    return String(placements?.[key]?.value ?? fieldValues?.[key] ?? '').trim();
  }
  return String(fieldValues?.[key] ?? '').trim();
}

function resolveAcroTarget(fields, def) {
  if (typeof def.acroIndex === 'number' && fields[def.acroIndex]) {
    return fields[def.acroIndex];
  }
  if (def.acroField) {
    const name = String(def.acroField);
    return fields.find((f) => f.getName() === name) ?? null;
  }
  return null;
}

function pageIndexForWidget(pdfDoc, widget) {
  const pageRef = widget.P?.();
  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].ref === pageRef) return i;
  }
  return 0;
}

/** Parse ISO or dd/mm/yyyy → { day, month, year } strings for COJ date boxes. */
function splitDateParts(value) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  let day = '';
  let month = '';
  let year = '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    [year, month, day] = v.split('-');
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) {
    [day, month, year] = v.split('/');
    day = day.padStart(2, '0');
    month = month.padStart(2, '0');
  } else {
    return { combined: v };
  }
  return { day, month, year };
}

/** COJ year box is narrow — use last two digits when needed. */
function formatDateBoxValue(value, boxIndex, rect) {
  const v = String(value ?? '').trim();
  if (boxIndex === 2 && v.length === 4 && rect?.width != null && rect.width < 40) {
    return v.slice(-2);
  }
  return v;
}

function queueFieldPaint(paints, pdfDoc, acroField, value, fontSize) {
  const text = String(value ?? '').trim();
  if (!text || !acroField?.acroField) return false;

  const widgets = acroField.acroField.getWidgets?.() ?? [];
  let queued = false;
  widgets.forEach((widget, boxIndex) => {
    const rect = widget.getRectangle?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const pageIndex = pageIndexForWidget(pdfDoc, widget);
    const boxText = formatDateBoxValue(text, boxIndex, rect);
    paints.push({ pageIndex, rect, value: boxText, fontSize });
    queued = true;
  });
  return queued;
}

function prepareFieldPaint(pdfDoc, paints, acroField, value, fontSize) {
  if (!acroField || typeof acroField.setText !== 'function') return false;
  try {
    acroField.setText(value);
  } catch {
    return false;
  }
  return queueFieldPaint(paints, pdfDoc, acroField, value, fontSize);
}

function drawPaintQueue(pdfDoc, paints, font) {
  const pages = pdfDoc.getPages();
  for (const paint of paints) {
    const page = pages[paint.pageIndex];
    if (!page) continue;
    const rect = paint.rect;
    const size = paint.fontSize || Math.min(11, Math.max(7, rect.height * 0.65));
    const y = rect.y + Math.max(2, (rect.height - size) * 0.35);
    page.drawText(paint.value, {
      x: rect.x + 2,
      y,
      size,
      font,
      color: rgb(0, 0, 0),
    });
  }
}

/**
 * @param {{
 *   templatePdfBytes: Uint8Array,
 *   fieldMap: Record<string, object>,
 *   fieldValues: Record<string, string>,
 *   placements?: Record<string, { value?: string, placed?: boolean }>,
 * }} opts
 */
export async function buildCojFilledPdf({
  templatePdfBytes,
  fieldMap,
  fieldValues,
  placements = {},
}) {
  const srcDoc = await PDFDocument.load(templatePdfBytes, { ignoreEncryption: true });
  const srcForm = srcDoc.getForm();
  const srcFields = srcForm.getFields();
  const paints = [];

  let filledCount = 0;
  for (const [key, def] of Object.entries(fieldMap || {})) {
    if (!def) continue;
    const value = fieldValueForKey(key, def, fieldValues, placements);
    if (!value && !Array.isArray(def.acroIndices)) continue;

    if (Array.isArray(def.acroIndices) && def.type === 'date') {
      const parts = splitDateParts(value);
      if (!parts) continue;
      const values = parts.combined
        ? [parts.combined]
        : [parts.day, parts.month, parts.year];
      def.acroIndices.forEach((idx, i) => {
        const v = values[i];
        if (!v) return;
        const acro = srcFields[idx];
        if (prepareFieldPaint(srcDoc, paints, acro, v, def.fontSize)) filledCount += 1;
      });
      continue;
    }

    if (def.acroField == null && typeof def.acroIndex !== 'number') continue;
    const acro = resolveAcroTarget(srcFields, def);
    if (prepareFieldPaint(srcDoc, paints, acro, value, def.fontSize)) filledCount += 1;
  }

  const font = await srcDoc.embedFont(StandardFonts.Helvetica);

  if (filledCount === 0) {
    const pdfBytes = new Uint8Array(await srcDoc.save({ useObjectStreams: false }));
    return { pdfBytes, filledCount };
  }

  // Encrypted COJ templates (Form 6): Chrome won't render in-place edits — burn into an unencrypted copy.
  if (templateIsEncrypted(templatePdfBytes)) {
    const outDoc = await PDFDocument.create();
    const copiedPages = await outDoc.copyPages(srcDoc, srcDoc.getPageIndices());
    copiedPages.forEach((page) => outDoc.addPage(page));
    const outFont = await outDoc.embedFont(StandardFonts.Helvetica);
    drawPaintQueue(outDoc, paints, outFont);
    const pdfBytes = new Uint8Array(await outDoc.save({ useObjectStreams: false }));
    return { pdfBytes, filledCount };
  }

  // Unencrypted templates: keep AcroForm fields editable with generated appearances.
  try {
    srcForm.updateFieldAppearances(font);
  } catch {
    /* optional */
  }
  const pdfBytes = new Uint8Array(await srcDoc.save({ useObjectStreams: false }));
  return { pdfBytes, filledCount };
}

/** True when field_map has at least one AcroForm target. */
export function hasCojAcroFieldMap(fieldMap) {
  if (!fieldMap || typeof fieldMap !== 'object') return false;
  return Object.values(fieldMap).some(
    (def) => def && (
      def.acroField != null
      || typeof def.acroIndex === 'number'
      || Array.isArray(def.acroIndices)
    ),
  );
}