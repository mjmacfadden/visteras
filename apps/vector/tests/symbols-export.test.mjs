/** gravit-gap-5 item 4: save/open round-trip + export parity for symbols. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ATTR, copyInstanceAttrs, expandInstancesInClone } from '../js/visteras-symbols-model.js';
import * as X from '../js/visteras-export-core.js';

class N {
  constructor(tag) { this.localName = tag; this.attrs = {}; this.children = []; this.childNodes = this.children; this.parentNode = null; this.nodeType = 1; }
  get id() { return this.attrs.id || ''; } set id(v) { this.attrs.id = v; }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  removeAttribute(k) { delete this.attrs[k]; }
  get attributes() { return Object.entries(this.attrs).map(([name, value]) => ({ name, value })); }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  remove() { if (this.parentNode) { const i = this.parentNode.children.indexOf(this); this.parentNode.children.splice(i, 1); } this.parentNode = null; }
  replaceWith(n) { const p = this.parentNode; const i = p.children.indexOf(this); p.children[i] = n; n.parentNode = p; this.parentNode = null; }
  closest(sel) { let n = this; while (n) { if (n.localName === sel) return n; n = n.parentNode; } return null; }
  cloneNode(deep) { const n = new N(this.localName); n.attrs = { ...this.attrs }; if (deep) for (const c of this.children) n.appendChild(c.cloneNode(true)); return n; }
  querySelectorAll(sel) { const all = []; const w = (n) => { for (const c of n.children) { all.push(c); w(c); } }; w(this);
    if (sel === 'use') return all.filter((c) => c.localName === 'use');
    if (sel.startsWith('symbol[')) return all.filter((c) => c.localName === 'symbol' && c.getAttribute(ATTR.symbol) === '1');
    return all; }
  querySelector() { return null; }
}
globalThis.CSS = { escape: (s) => s };

test('copyInstanceAttrs keeps appearance (opacity, filter, fx, style) but not href/instance flag', () => {
  const use = new N('use');
  Object.assign(use.attrs, { id: 'u1', href: '#s', [ATTR.instance]: '1', transform: 'matrix(2 0 0 2 5 5)', opacity: '0.5', filter: 'url(#vfx_u1)', 'data-visteras-fx': '{}', style: 'mix-blend-mode:multiply', visibility: 'hidden' });
  const g = copyInstanceAttrs(use, new N('g'), { keepId: true });
  assert.equal(g.getAttribute('transform'), 'matrix(2 0 0 2 5 5)');
  assert.equal(g.getAttribute('opacity'), '0.5');
  assert.equal(g.getAttribute('filter'), 'url(#vfx_u1)');
  assert.equal(g.getAttribute('style'), 'mix-blend-mode:multiply');
  assert.equal(g.getAttribute('href'), null);
  assert.equal(g.getAttribute(ATTR.instance), null);
  assert.equal(g.getAttribute('visibility'), null, 'edit-mode hide never leaks');
  assert.equal(g.id, 'u1');
});

test('expandInstancesInClone expands nested instances (A contains B) and drops panel symbols', () => {
  const root = new N('svg');
  root.ownerDocument = { createElementNS: (_ns, tag) => new N(tag) };
  const defs = root.appendChild(new N('defs'));
  const B = defs.appendChild(new N('symbol')); B.id = 'B'; B.setAttribute(ATTR.symbol, '1');
  B.appendChild(new N('circle'));
  const A = defs.appendChild(new N('symbol')); A.id = 'A'; A.setAttribute(ATTR.symbol, '1');
  const inner = A.appendChild(new N('use')); inner.setAttribute('href', '#B'); inner.setAttribute(ATTR.instance, '1');
  const layer = root.appendChild(new N('g'));
  const u = layer.appendChild(new N('use')); u.id = 'top'; u.setAttribute('href', '#A'); u.setAttribute(ATTR.instance, '1');
  expandInstancesInClone(root);
  const uses = root.querySelectorAll('use').filter((x) => !x.closest('defs'));
  assert.equal(uses.length, 0, 'no instances left outside defs');
  assert.equal(layer.children[0].localName, 'g');
  assert.equal(layer.children[0].children[0].localName, 'g', 'nested instance became a nested group');
  assert.equal(root.querySelectorAll('symbol[x]').length, 0, 'panel symbols pruned');
});

test('Export settings remember Symbols: Keep linked | Expand to groups', () => {
  assert.equal(X.normalizeSettings(null).symbols, 'keep');
  assert.equal(X.normalizeSettings({ symbols: 'expand' }).symbols, 'expand');
  assert.equal(X.normalizeSettings({ symbols: 'weird' }).symbols, 'keep');
  assert.deepEqual(X.SYMBOL_EXPORT_MODES, ['keep', 'expand']);
});

test('Export pipeline: prune unused panel symbols always; PDF always expands; SVG follows the setting', () => {
  const src = fs.readFileSync(new URL('../js/visteras-export.js', import.meta.url), 'utf8');
  assert.match(src, /if \(symbols === 'expand'\) expandInstancesInClone\(clone\); else pruneUnusedPanelSymbols\(clone\);/);
  assert.equal((src.match(/forSvgFile: true, symbols: 'expand' \}\)/g) || []).length, 2, 'both PDF paths expand');
  assert.match(src, /symbols: job\.symbols \|\| loadSettings\(\)\.symbols,/);
  assert.match(src, /id="vexp_as_symbols"><option value="keep"[^>]*>Keep linked \(&lt;use&gt;\)<\/option><option value="expand"[^>]*>Expand to groups<\/option>/);
  assert.match(src, /svgOpts\.hidden = v\.format !== 'svg';/);
});

test('Round-trip: everything lives in data-v-* on <symbol>/<use> (sanitizer keeps data-*), no new .vvd fields', () => {
  const save = fs.readFileSync(new URL('../js/visteras-document-save.js', import.meta.url), 'utf8');
  assert.doesNotMatch(save, /symbol/i, '.vvd payload unchanged');
  const model = fs.readFileSync(new URL('../js/visteras-symbols-model.js', import.meta.url), 'utf8');
  for (const k of ['data-v-symbol', 'data-v-symbol-uid', 'data-v-symbol-name', 'data-v-symbol-type', 'data-v-symbol-export', 'data-v-symbol-reg', 'data-v-symbol-rev', 'data-v-instance']) assert.match(model, new RegExp(`'${k}'`));
  assert.match(model, /sym\.setAttribute\('overflow', 'visible'\)/);
  assert.doesNotMatch(model, /setAttribute\('viewBox'/, 'symbols never get a viewBox');
});
