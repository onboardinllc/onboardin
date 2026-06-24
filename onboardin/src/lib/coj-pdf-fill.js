/**
 * Fill COJ statutory PDFs via AcroForm fields.
 * COJ Form 6 template is encrypted — mobile viewers show blank if we only copy encrypted bytes.
 * We bake field appearances on the encrypted source, copy from an unencrypted visual shell,
 * then draw text at widget rects so filled values are visible everywhere.
 */
import { PDFDocument, StandardFonts, rgb } from '../vendor/pdf-lib.esm.min.js';

const COJ_FORM_6_SHELL_URL = 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/form-6-shell.pdf';

let cachedShellBytes = null;

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

async function loadForm6ShellBytes() {
  if (cachedShellBytes) return cachedShellBytes;
  try {
    const res = await fetch(COJ_FORM_6_SHELL_URL);
    if (!res.ok) return null;
    cachedShellBytes = new Uint8Array(await res.arrayBuffer());
    return cachedShellBytes;
  } catch {
    return null;
  }
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

function setAcroFieldText(acroField, value) {
  if (!acroField || typeof acroField.setText !== 'function') return false;
  try {
    acroField.setText(value);
    return true;
  } catch {
    return false;
  }
}

/** Apply values to AcroForm fields on the encrypted/source doc. */
function applyFieldValues(srcFields, fieldMap, fieldValues, placements) {
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
        if (setAcroFieldText(acro, v)) filledCount += 1;
      });
      continue;
    }

    if (def.acroField == null && typeof def.acroIndex !== 'number') continue;
    const acro = resolveAcroTarget(srcFields, def);
    if (setAcroFieldText(acro, value)) filledCount += 1;
  }
  return filledCount;
}

/** Collect widget paint targets after appearances are generated. */
function collectFieldPaints(pdfDoc, srcFields, fieldMap, fieldValues, placements) {
  const paints = [];
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
        queueFieldPaint(paints, pdfDoc, acro, v, def.fontSize);
      });
      continue;
    }

    if (def.acroField == null && typeof def.acroIndex !== 'number') continue;
    const acro = resolveAcroTarget(srcFields, def);
    queueFieldPaint(paints, pdfDoc, acro, value, def.fontSize);
  }
  return paints;
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

function drawPaintQueue(pdfDoc, paints, font) {
  const pages = pdfDoc.getPages();
  for (const paint of paints) {
    const page = pages[paint.pageIndex];
    if (!page) continue;
    const rect = paint.rect;
    const size = paint.fontSize || Math.min(12, Math.max(9, rect.height * 0.65));
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

  const filledCount = applyFieldValues(srcFields, fieldMap, fieldValues, placements);
  const font = await srcDoc.embedFont(StandardFonts.Helvetica);

  if (filledCount === 0) {
    const pdfBytes = new Uint8Array(await srcDoc.save({ useObjectStreams: false }));
    return { pdfBytes, filledCount };
  }

  const encrypted = templateIsEncrypted(templatePdfBytes);

  if (encrypted) {
    try {
      srcForm.updateFieldAppearances(font);
    } catch {
      /* drawText backup below */
    }

    const paints = collectFieldPaints(srcDoc, srcFields, fieldMap, fieldValues, placements);

    let visualDoc = srcDoc;
    const shellBytes = await loadForm6ShellBytes();
    if (shellBytes) {
      try {
        const shellDoc = await PDFDocument.load(shellBytes);
        if (shellDoc.getPageCount() === srcDoc.getPageCount()) {
          visualDoc = shellDoc;
        }
      } catch {
        /* fall back to encrypted copy */
      }
    }

    const outDoc = await PDFDocument.create();
    const copiedPages = await outDoc.copyPages(visualDoc, visualDoc.getPageIndices());
    copiedPages.forEach((page) => outDoc.addPage(page));
    const outFont = await outDoc.embedFont(StandardFonts.Helvetica);
    drawPaintQueue(outDoc, paints, outFont);
    const pdfBytes = new Uint8Array(await outDoc.save({ useObjectStreams: false }));
    return { pdfBytes, filledCount };
  }

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

/** Test helper — reset cached shell between runs. */
export function clearForm6ShellCache() {
  cachedShellBytes = null;
}