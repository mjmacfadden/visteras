/**
 * gravit-gap-5 item 1: Symbols data model + purge guard + effects-in-symbol fix.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ATTR, REG_POINTS, registrationPoint, planNewSymbol, parseTranslate,
  translateString, wouldCreateCycle, symbolReferencesId, isPanelSymbol,
  writeSymbolMeta, readSymbolMeta, pruneUnusedPanelSymbols, expandInstancesInClone,
  shiftElement, uuid,
} from '../js/visteras-symbols-model.js';

// ── Minimal DOM ──────────────────────────────────────────────────────────────
class N {
  constructor(tag) {
    this.localName = tag; this.tagName = tag; this.attrs = {}; this.children = [];
    this.childNodes = this.children; this.parentNode = null; this.nodeType = 1;
  }
  get id() { return this.attrs.id || ''; }
  set id(v) { this.attrs.id = v; }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  removeAttribute(k) { delete this.attrs[k]; }
  hasAttribute(k) { return k in this.attrs; }
  appendChild(c) { c.parentNode?.children && (c.parentNode.children = c.parentNode.children.filter((x) => x !== c)); c.parentNode = this; this.children.push(c); return c; }
  insertBefore(c, ref) {
    c.parentNode?.children && (c.parentNode.children = c.parentNode.children.filter((x) => x !== c));
    c.parentNode = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i >= 0) this.children.splice(i, 0, c); else this.children.push(c);
    return c;
  }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; }
  replaceWith(n) { if (!this.parentNode) return; const p = this.parentNode; const i = p.children.indexOf(this); p.children[i] = n; n.parentNode = p; this.parentNode = null; }
  cloneNode(deep) {
    const n = new N(this.localName); n.attrs = { ...this.attrs };
    if (deep) for (const c of this.children) n.appendChild(c.cloneNode(true));
    return n;
  }
  querySelector(sel) {
    const all = [];
    const walk = (n) => { for (const c of n.children) { all.push(c); walk(c); } };
    walk(this);
    if (sel.startsWith('#')) return all.find((c) => c.id === sel.slice(1)) || null;
    if (sel.includes('symbol[')) return all.find((c) => c.localName === 'symbol' && c.getAttribute(ATTR.symbol) === '1') || null;
    if (sel.startsWith('use')) return all.find((c) => c.localName === 'use') || null;
    if (sel === ':scope > title') return this.children.find((c) => c.localName === 'title') || null;
    return null;
  }
  querySelectorAll(sel) {
    const all = [];
    const walk = (n) => { for (const c of n.children) { all.push(c); walk(c); } };
    walk(this);
    if (sel.startsWith('symbol[')) return all.filter((c) => c.localName === 'symbol' && c.getAttribute(ATTR.symbol) === '1');
    if (sel === 'use') return all.filter((c) => c.localName === 'use');
    if (sel === '*') return all;
    return all;
  }
  get nextSibling() { if (!this.parentNode) return null; const i = this.parentNode.children.indexOf(this); return this.parentNode.children[i + 1] || null; }
  get firstChild() { return this.children[0] || null; }
  get attributes() { return Object.entries(this.attrs).map(([name, value]) => ({ name, value })); }
  compareDocumentPosition(other) {
    const root = this; // walk up
    let a = this, b = other;
    const pathA = [], pathB = [];
    while (a) { pathA.unshift(a); a = a.parentNode; }
    while (b) { pathB.unshift(b); b = b.parentNode; }
    // find common parent children order
    for (let i = 0; i < Math.min(pathA.length, pathB.length); i++) {
      if (pathA[i] !== pathB[i]) {
        const parent = pathA[i - 1];
        if (!parent) return 0;
        const ia = parent.children.indexOf(pathA[i]), ib = parent.children.indexOf(pathB[i]);
        return ia < ib ? 4 : 2; // FOLLOWING : PRECEDING
      }
    }
    return 0;
  }
}
globalThis.Node = { DOCUMENT_POSITION_FOLLOWING: 4, DOCUMENT_POSITION_PRECEDING: 2 };
globalThis.CSS = { escape: (s) => s };
globalThis.document = { createElementNS: (_ns, tag) => new N(tag) };

test('registrationPoint covers all 9 positions', () => {
  const b = { x: 10, y: 20, width: 100, height: 50 };
  assert.deepEqual(registrationPoint(b, 'nw'), { x: 10, y: 20 });
  assert.deepEqual(registrationPoint(b, 'c'), { x: 60, y: 45 });
  assert.deepEqual(registrationPoint(b, 'se'), { x: 110, y: 70 });
  assert.deepEqual(registrationPoint(b, 'n'), { x: 60, y: 20 });
  assert.equal(REG_POINTS.length, 9);
});

test('planNewSymbol: offsets for center registration and builds use transform', () => {
  const a = new N('rect'); a.setAttribute('x', '10'); a.setAttribute('y', '20'); a.setAttribute('width', '40'); a.setAttribute('height', '30');
  a.getBBox = () => ({ x: 10, y: 20, width: 40, height: 30 });
  const plan = planNewSymbol([a], { name: 'Coin', reg: 'c', uid: 'u1' });
  assert.equal(plan.meta.name, 'Coin');
  assert.equal(plan.meta.uid, 'u1');
  assert.deepEqual(plan.regPoint, { x: 30, y: 35 });
  assert.deepEqual(plan.offset, { dx: -30, dy: -35 });
  assert.equal(plan.useTransform, translateString(30, 35));
});

test('planNewSymbol: each of 9 registration points', () => {
  const el = new N('rect');
  el.getBBox = () => ({ x: 0, y: 0, width: 100, height: 100 });
  for (const reg of REG_POINTS) {
    const plan = planNewSymbol([el], { reg });
    assert.equal(plan.meta.reg, reg);
    assert.deepEqual(plan.offset, { dx: -plan.regPoint.x, dy: -plan.regPoint.y });
  }
});

test('cycle guard: A contains use→A rejected; A→B→A rejected', () => {
  const root = new N('svg');
  const a = new N('symbol'); a.id = 'A'; a.setAttribute(ATTR.symbol, '1');
  const b = new N('symbol'); b.id = 'B'; b.setAttribute(ATTR.symbol, '1');
  const useA = new N('use'); useA.setAttribute('href', '#A');
  const useB = new N('use'); useB.setAttribute('href', '#B');
  a.appendChild(useB); b.appendChild(useA);
  root.appendChild(a); root.appendChild(b);
  assert.equal(symbolReferencesId(root, a, 'A'), true);
  assert.equal(wouldCreateCycle(root, 'A', [useA]), true);
  assert.equal(wouldCreateCycle(root, 'A', [new N('rect')]), false);
});

test('writeSymbolMeta / readSymbolMeta round-trip', () => {
  const sym = new N('symbol');
  writeSymbolMeta(sym, { uid: 'abc', name: 'Coin', type: 'dynamic', exportType: 'graphic', reg: 'c', rev: 3 });
  assert.equal(sym.getAttribute('overflow'), 'visible');
  assert.equal(sym.getAttribute(ATTR.symbol), '1');
  const m = readSymbolMeta(sym);
  assert.deepEqual(m, { id: '', uid: 'abc', name: 'Coin', type: 'dynamic', exportType: 'graphic', reg: 'c', rev: 3 });
  assert.ok(isPanelSymbol(sym));
});

test('shiftElement updates translate and x/y', () => {
  const el = new N('rect');
  el.setAttribute('x', '10'); el.setAttribute('y', '20');
  shiftElement(el, -10, -20);
  assert.equal(el.getAttribute('x'), '0');
  assert.equal(el.getAttribute('y'), '0');
  assert.ok(el.getAttribute('transform').includes('matrix'));
});

test('pruneUnusedPanelSymbols + expandInstancesInClone', () => {
  const root = new N('svg');
  root.ownerDocument = { createElementNS: (_ns, tag) => new N(tag) };
  const defs = new N('defs'); root.appendChild(defs);
  const used = new N('symbol'); used.id = 's1'; used.setAttribute(ATTR.symbol, '1');
  const child = new N('rect'); child.setAttribute('fill', 'red'); used.appendChild(child);
  const unused = new N('symbol'); unused.id = 's2'; unused.setAttribute(ATTR.symbol, '1');
  defs.appendChild(used); defs.appendChild(unused);
  const use = new N('use'); use.setAttribute('href', '#s1'); use.setAttribute(ATTR.instance, '1'); use.setAttribute('transform', 'matrix(1 0 0 1 50 60)');
  root.appendChild(use);
  pruneUnusedPanelSymbols(root);
  assert.equal(defs.children.map((c) => c.id).join(','), 's1');
  expandInstancesInClone(root);
  assert.equal(root.querySelectorAll('use').length, 0);
  assert.equal(root.children.some((c) => c.localName === 'g'), true);
});

test('parseTranslate reads matrix and translate()', () => {
  assert.deepEqual(parseTranslate('translate(3, 4)'), { x: 3, y: 4 });
  assert.deepEqual(parseTranslate('matrix(1 0 0 1 9 8)'), { x: 9, y: 8 });
});

test('uuid looks like a UUID', () => {
  assert.match(uuid(), /^[0-9a-f-]{36}$/i);
});

test('Purge guard: Editor.js skips symbol[data-v-symbol]', () => {
  const ed = fs.readFileSync(new URL('../Editor.js', import.meta.url), 'utf8');
  assert.match(ed, /symbol:not\(\[data-v-symbol\]\)/);
  assert.doesNotMatch(ed, /querySelectorAll\("linearGradient, radialGradient, filter, marker, svg, symbol"\)/);
});

test('Effects: syncAllFx keeps filters inside <symbol>', () => {
  const src = fs.readFileSync(new URL('../js/visteras-effects.js', import.meta.url), 'utf8');
  assert.match(src, /if \(el\.closest\('defs'\) && !el\.closest\('symbol'\)\) continue;/);
  assert.match(src, /if \(\(el\.closest\('defs'\) && !el\.closest\('symbol'\)\) \|\| el\.hasAttribute\(FX_ATTR\)/);
});

test('documentMatrix is exported for New Symbol baking', () => {
  const src = fs.readFileSync(new URL('../js/visteras-object-transform.js', import.meta.url), 'utf8');
  assert.match(src, /export function documentMatrix/);
});

test('createSymbol / placeInstance / breakLinkToSymbol / duplicate / replace (fake canvas)', async () => {
  const M = await import('../js/visteras-symbols-model.js');
  const root = new N('svg');
  root.ownerDocument = { createElementNS: (_ns, tag) => new N(tag), getElementById: (id) => {
    const all = []; const walk = (n) => { for (const c of n.children) { all.push(c); walk(c); } }; walk(root);
    return all.find((c) => c.id === id) || null;
  } };
  const defs = new N('defs'); root.appendChild(defs);
  const layer = new N('g'); layer.setAttribute('class', 'layer'); root.appendChild(layer);
  // Fake classList for layer filter in placeInstance
  Object.defineProperty(layer, 'classList', { value: { contains: (c) => c === 'layer' } });
  // placeInstance uses querySelectorAll(':scope > g.layer') — enrich root
  const origQSA = root.querySelectorAll.bind(root);
  root.querySelectorAll = (sel) => {
    if (sel === ':scope > g.layer') return [layer];
    return origQSA(sel);
  };

  let nid = 0;
  const history = [];
  class InsertElementCommand { constructor(el) { this.el = el; } }
  class RemoveElementCommand { constructor(el) { this.el = el; } }
  class ChangeElementCommand { constructor(el, old) { this.el = el; this.old = old; } }
  class BatchCommand {
    constructor(text) { this.text = text; this.stack = []; }
    addSubCommand(c) { this.stack.push(c); }
    isEmpty() { return !this.stack.length; }
  }
  const rect = new N('rect');
  rect.id = 'r1';
  rect.setAttribute('x', '10'); rect.setAttribute('y', '20');
  rect.setAttribute('width', '40'); rect.setAttribute('height', '30');
  rect.getBBox = () => ({ x: 10, y: 20, width: 40, height: 30 });
  layer.appendChild(rect);

  const sc = {
    getSvgContent: () => root,
    findDefs: () => defs,
    getSelectedElements: () => [rect],
    getNextId: () => `svg_${++nid}`,
    getStrokedBBox: (els) => els[0].getBBox(),
    clearSelection() {},
    addToSelection() {},
    call() {},
    setUseData() {},
    addCommandToHistory: (c) => history.push(c),
    history: { BatchCommand, InsertElementCommand, RemoveElementCommand, ChangeElementCommand },
  };

  const created = M.createSymbol(sc, [rect], { name: 'Coin', reg: 'c' });
  assert.ok(created.symbol);
  assert.ok(created.use);
  assert.equal(created.symbol.getAttribute('overflow'), 'visible');
  assert.equal(created.symbol.getAttribute(M.ATTR.symbol), '1');
  assert.equal(created.use.getAttribute('href'), `#${created.symbol.id}`);
  assert.equal(history.at(-1).text, 'New Symbol');
  assert.equal(layer.children.includes(rect), false);
  assert.ok(created.symbol.children.includes(rect));

  const placed = M.placeInstance(sc, created.symbol, { x: 200, y: 100 });
  assert.ok(placed.use);
  assert.equal(history.at(-1).text, 'Place Symbol');

  const broken = M.breakLinkToSymbol(sc, placed.use);
  assert.ok(broken.group);
  assert.ok(M.isPanelSymbol(created.symbol)); // symbol kept
  assert.equal(history.at(-1).text, 'Break Link to Symbol');

  const dup = M.duplicateSymbol(sc, created.symbol);
  assert.ok(dup.symbol);
  assert.notEqual(dup.symbol.getAttribute(M.ATTR.uid), created.symbol.getAttribute(M.ATTR.uid));
  assert.match(dup.symbol.getAttribute(M.ATTR.name), /copy$/);

  // Make another instance and replace it with the duplicate
  const p2 = M.placeInstance(sc, created.symbol, { x: 0, y: 0 });
  const replaced = M.replaceSymbol(sc, [p2.use], dup.symbol);
  assert.equal(p2.use.getAttribute('href'), `#${dup.symbol.id}`);
  assert.equal(history.at(-1).text, 'Replace Symbol');
});
