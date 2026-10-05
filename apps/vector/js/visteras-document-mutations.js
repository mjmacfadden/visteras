// SVG-Edit writes these root attributes when laying out or zooming the viewport.
// Actual document dimensions are represented by viewBox and document metadata.
const viewportAttributes = new Set(['x', 'y', 'width', 'height', 'overflow', 'style']);

export function hasArtworkMutations(records, content) {
  if (!content) return false;
  const attributes = new Map();
  for (const record of records) {
    if (!content.contains(record.target)) continue;
    if (record.type !== 'attributes') return true;
    if (record.target === content && viewportAttributes.has(record.attributeName)) continue;
    // Compare the earliest value with the final value, not intermediate writes.
    let names = attributes.get(record.target);
    if (!names) attributes.set(record.target, names = new Map());
    const key = `${record.attributeNamespace || ''}:${record.attributeName}`;
    if (!names.has(key)) names.set(key, record);
  }
  for (const [target, names] of attributes) {
    for (const record of names.values()) {
      const value = record.attributeNamespace
        ? target.getAttributeNS(record.attributeNamespace, record.attributeName)
        : target.getAttribute(record.attributeName);
      if (value !== record.oldValue) return true;
    }
  }
  return false;
}
