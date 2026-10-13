/** Illustrator Layers names. No DOM or window access at import time. */
export const cleanName = text => String(text || '').trim().replace(/\s+/g, ' ');
const titleOf = el => [...(el?.children || [])].find(child => child.localName === 'title');
export function defaultObjectName(el) {
  if (el?.getAttribute?.('data-visteras-compound')) return '<Compound Path>';
  if (el?.getAttribute?.('data-visteras-clip')) return '<Clip Group>';
  if (el?.localName === 'text') return cleanName(el.textContent).slice(0, 30) || '<Text>';
  return ({ rect: '<Rectangle>', path: '<Path>', circle: '<Ellipse>', ellipse: '<Ellipse>', line: '<Line>',
    polygon: '<Polygon>', polyline: '<Path>', g: '<Group>', image: '<Image>', use: '<Symbol>' })[el?.localName] || '<Object>';
}
export function displayName(el) {
  const name = cleanName(el?.getAttribute?.('data-visteras-name')) || cleanName(el?.getAttribute?.('aria-label')) || cleanName(titleOf(el)?.textContent);
  if (name) return name;
  if (el?.localName === 'use') {
    const href = el.getAttribute('href') || el.getAttribute('xlink:href') || '';
    const symbol = href.startsWith('#') ? el.ownerDocument?.getElementById(href.slice(1)) : null;
    const symbolName = cleanName(symbol?.getAttribute?.('data-v-symbol-name')) || cleanName(titleOf(symbol)?.textContent);
    if (symbolName) return symbolName;
  }
  return defaultObjectName(el);
}
export function nextLayerName(names) {
  const max = Math.max(0, ...names.map(name => Number(/^Layer (\d+)$/.exec(cleanName(name))?.[1]) || 0));
  return `Layer ${max + 1}`;
}
export function layerNames(root) {
  return [...(root?.querySelectorAll?.('g.layer, g[data-visteras-sublayer]') || [])].map(el => titleOf(el)?.textContent || '');
}
export function renameObject(sc, el, name) {
  const next = cleanName(name), old = el.getAttribute('data-visteras-name');
  if ((old || '') === next) return false;
  if (next) el.setAttribute('data-visteras-name', next);
  else el.removeAttribute('data-visteras-name');
  sc.addCommandToHistory(new sc.history.ChangeElementCommand(el, { 'data-visteras-name': old }, 'Rename object'));
  sc.call('changed', [el]);
  return true;
}
