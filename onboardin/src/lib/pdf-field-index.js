/**
 * Template field indexing - builds a normalized field index for a PDF template.
 *
 * Sources, merged in order:
 *   1. AcroForm widgets scanned from the PDF bytes (type, page, bounds).
 *   2. An existing legal_templates.field_map (coordinate or acro entries).
 *
 * All coordinates in the index use top-left UI origin in PDF points,
 * matching legal_templates.field_map and the burn-in math in
 * document-sign-pdf.js (pdfY = pageHeight - y - h).
 */
import { PDFDocument } from '../vendor/pdf-lib.esm.min.js';

const KNOWN_TYPES = ['text', 'signature', 'date', 'checkbox'];

function inferTypeFromName(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('signature') || n.includes('sign_here') || /\bsig\b/.test(n)) return 'signature';
  if (n.includes('date')) return 'date';
  return 'text';
}

function acroFieldType(field, fieldKey) {
  const ctor = field?.constructor?.name || '';
  if (ctor.includes('Signature')) return 'signature';
  if (ctor.includes('CheckBox')) return 'checkbox';
  if (ctor.includes('TextField')) return inferTypeFromName(fieldKey);
  return inferTypeFromName(fieldKey);
}

function normalizeKey(name) {
  return String(name || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

/**
 * Normalize an existing field_map object into index entries.
 * Coordinate entries carry page + bounds; acro entries carry acroField/acroIndex.
 */
export function normalizeFieldIndex(fieldMap) {
  const out = [];
  for (const [fieldKey, def] of Object.entries(fieldMap || {})) {
    if (!def || typeof def !== 'object') continue;
    const entry = {
      fieldKey,
      type: KNOWN_TYPES.includes(def.type) ? def.type : inferTypeFromName(fieldKey),
      page: typeof def.page === 'number' ? def.page : 0,
    };
    if (typeof def.x === 'number' && typeof def.y === 'number') {
      entry.x = def.x;
      entry.y = def.y;
      entry.w = typeof def.w === 'number' ? def.w : 200;
      entry.h = typeof def.h === 'number' ? def.h : 24;
    }
    if (def.acroField != null) entry.acroField = def.acroField;
    if (typeof def.acroIndex === 'number') entry.acroIndex = def.acroIndex;
    if (typeof def.fontSize === 'number') entry.fontSize = def.fontSize;
    out.push(entry);
  }
  return out;
}

/**
 * Scan AcroForm widgets in the PDF and return index entries with
 * top-left UI bounds. Returns [] for flat PDFs (no form).
 */
export async function scanAcroFormFields(pdfDoc) {
  const entries = [];
  let fields = [];
  try {
    fields = pdfDoc.getForm().getFields();
  } catch {
    return entries;
  }
  const pages = pdfDoc.getPages();
  const pageRefs = pages.map((p) => p.ref);

  fields.forEach((field, acroIndex) => {
    const name = field.getName();
    const fieldKey = normalizeKey(name) || `field_${acroIndex}`;
    const widgets = field.acroField?.getWidgets?.() || [];
    widgets.forEach((widget) => {
      let rect;
      try {
        rect = widget.getRectangle();
      } catch {
        return;
      }
      const pRef = widget.P();
      let pageIndex = pRef ? pageRefs.findIndex((r) => r === pRef || String(r) === String(pRef)) : -1;
      if (pageIndex < 0) pageIndex = 0;
      const pageHeight = pages[pageIndex].getSize().height;
      entries.push({
        fieldKey,
        type: acroFieldType(field, fieldKey),
        page: pageIndex,
        x: rect.x,
        y: pageHeight - rect.y - rect.height,
        w: rect.width,
        h: rect.height,
        acroField: name,
        acroIndex,
      });
    });
  });
  return entries;
}

/**
 * Build the normalized field index for template PDF bytes.
 * existingMap entries win on fieldKey collisions (curated over scanned).
 *
 * @returns {{ pageCount: number, pages: {width:number,height:number}[], fields: object[] }}
 */
export async function indexTemplateFields(pdfBytes, existingMap = {}) {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages().map((p) => {
    const { width, height } = p.getSize();
    return { width, height };
  });

  const scanned = await scanAcroFormFields(pdfDoc);
  const curated = normalizeFieldIndex(existingMap);
  const byKey = new Map();
  for (const entry of scanned) byKey.set(entry.fieldKey, entry);
  for (const entry of curated) {
    const prior = byKey.get(entry.fieldKey);
    byKey.set(entry.fieldKey, prior ? { ...prior, ...entry } : entry);
  }

  const fields = Array.from(byKey.values()).filter((f) => {
    if (typeof f.x === 'number') {
      const pg = pages[f.page] || pages[0];
      return pg && f.x >= 0 && f.y >= 0 && f.x + f.w <= pg.width + 1 && f.y + f.h <= pg.height + 1;
    }
    return f.acroField != null || typeof f.acroIndex === 'number';
  });

  return { pageCount: pages.length, pages, fields };
}

/** Convert index entries back to a legal_templates.field_map object. */
export function fieldIndexToFieldMap(fields) {
  const map = {};
  for (const f of fields || []) {
    const def = { page: f.page, type: f.type };
    if (typeof f.x === 'number') {
      def.x = f.x;
      def.y = f.y;
      def.w = f.w;
      def.h = f.h;
    }
    if (f.acroField != null) def.acroField = f.acroField;
    if (typeof f.acroIndex === 'number') def.acroIndex = f.acroIndex;
    if (typeof f.fontSize === 'number') def.fontSize = f.fontSize;
    map[f.fieldKey] = def;
  }
  return map;
}
