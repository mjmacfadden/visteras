/** gravit-gap-5 item 3: Edit Symbol in isolation — one undo step, exits, save while editing. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SymbolEditCommand, collapseHistory, setSymbolChildren, contentChildren, stripIds, EDIT_ALERT_KEY } from '../js/visteras-symbol-edit.js';

class N {
  constructor(tag) { this.localName = tag; this.attrs = {}; this.children = []; this.parentNode = null; }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(c) { if (c.parentNode) c.remove(); c.parentNode = this; this.children.push(c); return c; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((x) => x !== this); this.parentNode = null; }
  cloneNode(deep) { const n = new N(this.localName); n.attrs = { ...this.attrs }; if (deep) for (const c of this.children) n.appendChild(c.cloneNode(true)); return n; }
  querySelectorAll(sel) { const all = []; const w = (n) => { for (const c of n.children) { all.push(c); w(c); } }; w(this); return sel === '[id]' ? all.filter((c) => 'id' in c.attrs) : all; }
}

test('collapseHistory truncates to the entry pointer (drops redo) and pushes one command', () => {
  const um = {
    undoStack: ['a', 'b', 'e1', 'e2', 'e3'], undoStackPointer: 5,
    addCommandToHistory(c) { this.undoStack.push(c); this.undoStackPointer = this.undoStack.length; },
  };
  collapseHistory(um, 2, 'EDIT');
  assert.deepEqual(um.undoStack, ['a', 'b', 'EDIT']);
  assert.equal(um.undoStackPointer, 3);
  const um2 = { undoStack: ['a', 'b', 'c'], undoStackPointer: 1, addCommandToHistory() { throw new Error('no'); } };
  collapseHistory(um2, 2, null);
  assert.deepEqual(um2.undoStack, ['a'], 'user undid below entry: keep only what is still applied');
});

test('SymbolEditCommand swaps children snapshots and rev; title kept', () => {
  const sym = new N('symbol'); sym.setAttribute('data-v-symbol-rev', '2');
  const title = new N('title'); sym.appendChild(title);
  const a = new N('rect'); a.setAttribute('id', 'r1'); a.setAttribute('fill', 'red');
  sym.appendChild(a);
  const before = contentChildren(sym).map((c) => c.cloneNode(true));
  a.setAttribute('fill', 'blue');
  const after = contentChildren(sym).map((c) => c.cloneNode(true));
  const events = [];
  const cmd = new SymbolEditCommand({ call: (e) => events.push(e) }, sym, before, after, '2', '3');
  cmd.unapply();
  assert.equal(contentChildren(sym)[0].getAttribute('fill'), 'red');
  assert.equal(contentChildren(sym)[0].getAttribute('id'), 'r1', 'ids preserved');
  assert.equal(sym.getAttribute('data-v-symbol-rev'), '2');
  assert.equal(sym.children[0], title);
  cmd.apply();
  assert.equal(contentChildren(sym)[0].getAttribute('fill'), 'blue');
  assert.equal(sym.getAttribute('data-v-symbol-rev'), '3');
  // snapshots stay pristine after repeated apply/unapply
  contentChildren(sym)[0].setAttribute('fill', 'green');
  cmd.unapply(); cmd.apply();
  assert.equal(contentChildren(sym)[0].getAttribute('fill'), 'blue');
  assert.equal(cmd.getText(), 'Edit Symbol');
  assert.ok(events.length >= 2);
});

test('stripIds removes ids recursively (placeholder clones never duplicate ids)', () => {
  const g = new N('g'); g.setAttribute('id', 'g1');
  const r = new N('rect'); r.setAttribute('id', 'r1'); g.appendChild(r);
  stripIds(g);
  assert.equal(g.getAttribute('id'), null);
  assert.equal(r.getAttribute('id'), null);
});

test('setSymbolChildren replaces content but keeps <title>', () => {
  const sym = new N('symbol'); const t = new N('title'); sym.appendChild(t); sym.appendChild(new N('rect'));
  setSymbolChildren(sym, [new N('circle'), new N('path')]);
  assert.deepEqual(sym.children.map((c) => c.localName), ['title', 'circle', 'path']);
});

test('Wiring: dblclick/Esc/back arrow exits, save + export serialize the committed symbol', () => {
  const src = fs.readFileSync(new URL('../js/visteras-symbol-edit.js', import.meta.url), 'utf8');
  assert.match(src, /addEventListener\('dblclick'/);
  assert.match(src, /e\.key !== 'Escape'/);
  assert.match(src, /id="vsym_edit_back"/);
  assert.match(src, /Symbol Editing Mode: \$\{name\}/);
  assert.match(src, /sc\.setContext\?\.\(group\)/);
  assert.match(src, /sc\.getSvgString = function \(\.\.\.args\) \{ return withCommitted\(\(\) => getSvgString\(\.\.\.args\)\); \}/);
  assert.match(src, /Don't Show Again/);
  assert.equal(EDIT_ALERT_KEY, 'visteras-vector-symbol-edit-alert');
  const exp = fs.readFileSync(new URL('../js/visteras-export.js', import.meta.url), 'utf8');
  assert.match(exp, /window\.__visterasSymbolEdit\?\.cloneCommitted\?\.\(\) \|\| sc\.getSvgContent\(\)\.cloneNode\(true\)/);
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /mountSymbolEdit\(svgEditor\);/);
  const guard = fs.readFileSync(new URL('../../../scripts/check-no-doc-localstorage.mjs', import.meta.url), 'utf8');
  assert.match(guard, /visteras-symbol-edit\.js', key: 'EDIT_ALERT_KEY'/);
});
