import { isEnvelopeSource } from './visteras-envelope-core.js?v=envelope-11';
/** Layer hierarchy helpers, with DOM creation injected. */
export const isSublayer = el => el?.localName === 'g' && el.getAttribute('data-visteras-sublayer') === '1';
export const isLayerContainer = el => isSublayer(el) || /(?:^|\s)layer(?:\s|$)/.test(el?.getAttribute?.('class') || '');
export function createSublayer(doc, name, id) {
  const group = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('data-visteras-sublayer', '1');
  if (id) group.setAttribute('id', id);
  const title = doc.createElementNS('http://www.w3.org/2000/svg', 'title');
  title.textContent = name; group.appendChild(title);
  return group;
}
export function rowPath(el, root) {
  const path = [];
  for (let node = el; node && node !== root; node = node.parentNode) path.unshift(node);
  return path;
}
export function topmostSelected(elements, root) {
  const selected = new Set(elements.filter(Boolean));
  let top = null;
  const walk = node => {
    if (selected.has(node)) top = node;
    for (const child of node.children || []) walk(child);
  };
  if (root) walk(root);
  return top;
}
/** Flatten sublayer boundaries for Select All / marquee; ordinary groups stay groups. */
export function selectableArtwork(elements) {
  return [...elements].flatMap(el => isEnvelopeSource(el) || el?.getAttribute?.('display') === 'none' ? [] : isSublayer(el) ? selectableArtwork(el.children) :
    el && !['title','desc','defs','metadata'].includes(el.localName) ? [el] : []);
}
