/** Selectors for editor-only guide layers (ruler guides + smart guides). */
export const EXPORT_GUIDE_SELECTORS = [
  '#visteras_ruler_guides',
  '#visteras_smart_guides',
  '.visteras-guides-layer',
  '.visteras-smart-guides-layer',
  '.visteras-guide-wrap',
  '.visteras-ruler-guide',
  '.visteras-smart-guide',
  '[data-guide-id]',
  '#visteras_document_grid',
  '.visteras-document-grid',
  '#visteras_grid_pattern',
].join(', ');

/**
 * Remove ruler / smart guides from an SVG root (clone or live). Illustrator never
 * exports guides; they live only in the document model (rulerGuides) and on screen.
 * Mutates `root` and returns the count of nodes removed.
 */
export function stripExportGuides(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return 0;
  const nodes = [...root.querySelectorAll(EXPORT_GUIDE_SELECTORS)];
  // Also drop a top-level guides group matched by id when querySelectorAll is a stub.
  for (const id of ['visteras_ruler_guides', 'visteras_smart_guides']) {
    const el = typeof root.getElementById === 'function' ? root.getElementById(id) : null;
    if (el && !nodes.includes(el)) nodes.push(el);
  }
  for (const n of nodes) {
    try { n.remove(); } catch { try { n.parentNode?.removeChild?.(n); } catch { /* ignore */ } }
  }
  return nodes.length;
}

/** Keep the crop when an exported SVG is embedded or reopened with visible overflow. */
export function clipExportToRect(root, rect) {
  const ns = 'http://www.w3.org/2000/svg', doc = root.ownerDocument;
  let id = 'visteras-export-clip', suffix = 0;
  const ids = new Set([...root.querySelectorAll('[id]')].map(el => el.id || el.getAttribute('id')));
  while (ids.has(id)) id = `visteras-export-clip-${++suffix}`;
  const defs = doc.createElementNS(ns, 'defs');
  const clip = doc.createElementNS(ns, 'clipPath');
  clip.setAttribute('id', id);
  clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
  const bounds = doc.createElementNS(ns, 'rect');
  for (const key of ['x', 'y', 'width', 'height']) bounds.setAttribute(key, rect[key]);
  clip.append(bounds); defs.append(clip);
  const group = doc.createElementNS(ns, 'g');
  group.setAttribute('clip-path', `url(#${id})`);
  const nonRendering = new Set(['defs', 'style', 'title', 'desc', 'metadata']);
  for (const child of [...root.children]) {
    if (!nonRendering.has(child.localName)) group.append(child);
  }
  root.append(defs, group);
  root.setAttribute('overflow', 'hidden');
  root.style?.setProperty('overflow', 'hidden');
}
