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
