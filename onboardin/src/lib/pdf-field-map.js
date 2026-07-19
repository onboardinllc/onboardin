/**
 * Detect how a legal_templates.field_map should be filled.
 */

export function hasAcroFieldMap(fieldMap) {
  if (!fieldMap || typeof fieldMap !== 'object') return false;
  return Object.values(fieldMap).some(
    (def) => def && (
      def.acroField != null
      || typeof def.acroIndex === 'number'
      || Array.isArray(def.acroIndices)
    ),
  );
}

export function hasCoordinateFieldMap(fieldMap) {
  if (!fieldMap || typeof fieldMap !== 'object') return false;
  return Object.values(fieldMap).some(
    (def) => def && typeof def.x === 'number' && typeof def.y === 'number',
  );
}

/** @returns {'acro' | 'coordinate' | null} */
export function getPdfFillStrategy(fieldMap) {
  if (hasAcroFieldMap(fieldMap)) return 'acro';
  if (hasCoordinateFieldMap(fieldMap)) return 'coordinate';
  return null;
}

/** True when template is linked and field_map supports server fill. */
export function canAutofillTemplate(template, { requireLinkedUrl } = {}) {
  if (!template?.field_map) return false;
  if (requireLinkedUrl?.download_url && template.template_path !== requireLinkedUrl.download_url) {
    return false;
  }
  return getPdfFillStrategy(template.field_map) != null;
}

/** True when the template's field_map supports the in-app document editor. */
export function canOpenInAppEditor(template) {
  const fieldMap = template?.field_map;
  return hasCoordinateFieldMap(fieldMap) || hasAcroFieldMap(fieldMap);
}

/** @deprecated use hasAcroFieldMap */
export const hasCojAcroFieldMap = hasAcroFieldMap;