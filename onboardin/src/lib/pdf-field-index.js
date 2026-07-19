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
import { PDFDocument, PDFTextField, PDFCheckBox, PDFSignature } from '../vendor/pdf-lib.esm.min.js';

const KNOWN_TYPES = ['text', 'signature', 'date', 'checkbox'];

function inferTypeFromName(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('signature') || n.includes('sign_here') || /\bsig\b/.test(n)) return 'signature';
  if (n.includes('date')) return 'date';
  return 'text';
}

function acroFieldType(field, fieldKey) {
  // instanceof, not constructor.name - the vendored bundle is minified
  if (PDFSignature && field instanceof PDFSignature) return 'signature';
  if (PDFCheckBox && field instanceof PDFCheckBox) return 'checkbox';
  if (PDFTextField && field instanceof PDFTextField) return inferTypeFromName(fieldKey);
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

  // Widgets often omit /P; resolve pages from each page's /Annots instead.
  const widgetDictToPage = new Map();
  pages.forEach((page, pageIndex) => {
    let annots;
    try {
      annots = page.node.Annots();
    } catch {
      return;
    }
    if (!annots) return;
    for (let i = 0; i < annots.size(); i += 1) {
      try {
        const dict = pdfDoc.context.lookup(annots.get(i));
        if (dict) widgetDictToPage.set(dict, pageIndex);
      } catch {
        /* skip unresolvable annot */
      }
    }
  });

  const seenKeys = new Set();
  fields.forEach((field, acroIndex) => {
    const name = field.getName();
    let fieldKey = normalizeKey(name) || `field_${acroIndex}`;
    // Encrypted PDFs (COJ Form 6) garble names; keep every widget addressable
    if (seenKeys.has(fieldKey)) fieldKey = `${fieldKey}_${acroIndex}`;
    seenKeys.add(fieldKey);
    const widgets = field.acroField?.getWidgets?.() || [];
    widgets.forEach((widget) => {
      let rect;
      try {
        rect = widget.getRectangle();
      } catch {
        return;
      }
      let pageIndex = widgetDictToPage.has(widget.dict) ? widgetDictToPage.get(widget.dict) : -1;
      if (pageIndex < 0) {
        const pRef = widget.P();
        pageIndex = pRef ? pageRefs.findIndex((r) => r === pRef || String(r) === String(pRef)) : -1;
      }
      if (pageIndex < 0) pageIndex = 0;
      const pageHeight = pages[pageIndex].getSize().height;
      let value = null;
      try {
        value = typeof field.getText === 'function' ? field.getText() : null;
      } catch {
        /* non-text or unreadable */
      }
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
        ...(value ? { value } : {}),
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
export async function indexTemplateFields(pdfBytes, existingMap = {}, { valueHints } = {}) {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages().map((p) => {
    const { width, height } = p.getSize();
    return { width, height };
  });

  const scanned = await scanAcroFormFields(pdfDoc);
  const curated = normalizeFieldIndex(existingMap);

  // Curated acro entries carry no bounds; adopt page + rect from the widget
  // they target (by field name, or by index for encrypted-name PDFs).
  const byAcroName = new Map();
  const byAcroIndex = new Map();
  for (const entry of scanned) {
    if (entry.acroField != null && !byAcroName.has(entry.acroField)) byAcroName.set(entry.acroField, entry);
    if (typeof entry.acroIndex === 'number' && !byAcroIndex.has(entry.acroIndex)) byAcroIndex.set(entry.acroIndex, entry);
  }
  // Filled working copies carry the fill engine's own output; a unique value
  // match is ground truth for where a key actually lands (index order can
  // differ between fill engines on encrypted PDFs).
  const byValue = new Map();
  for (const entry of scanned) {
    if (!entry.value) continue;
    const key = entry.value.trim();
    if (!key) continue;
    byValue.set(key, byValue.has(key) ? null : entry);
  }

  const withBounds = (entry) => {
    if (typeof entry.x === 'number') return entry;
    const src = existingMap?.[entry.fieldKey] || {};
    const hint = String(valueHints?.[entry.fieldKey] ?? '').trim();
    const targetIndex = typeof entry.acroIndex === 'number'
      ? entry.acroIndex
      : (Array.isArray(src.acroIndices) ? src.acroIndices[0] : undefined);
    const widget = (hint && byValue.get(hint))
      || (entry.acroField != null && byAcroName.get(entry.acroField))
      || (typeof targetIndex === 'number' && byAcroIndex.get(targetIndex))
      || null;
    if (!widget) return entry;
    return { ...entry, page: widget.page, x: widget.x, y: widget.y, w: widget.w, h: widget.h };
  };

  const byKey = new Map();
  const curatedKeys = new Set(curated.map((c) => c.fieldKey));
  for (const entry of scanned) if (!curatedKeys.has(entry.fieldKey)) byKey.set(entry.fieldKey, entry);
  for (const entry of curated) byKey.set(entry.fieldKey, withBounds(entry));

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
