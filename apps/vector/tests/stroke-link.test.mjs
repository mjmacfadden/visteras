/**
 * Tests for visteras-stroke-link.js: stroke colour none ⇒ weight 0;
 * weight 0→>0 with stroke none ⇒ black. Pure decision helpers, plus the
 * mounted rule against a fake DOM / MutationObserver / undo manager (one
 * history entry per change, loop guard, defaults).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  isNonePaint, effectiveStroke, decideStrokeLink, oldValuesFromRecords, decideDefaults, defaultsPatch, mountStrokeLink, BLACK,
} = await import('../js/visteras-stroke-link.js');

const S = (stroke, width) => ({ stroke, width });

test('decideStrokeLink — colour → none triggers weight 0', () => {
  assert.equal(decideStrokeLink(S('#ff0000', 5), S('none', 5)), 'stroke-none');
  assert.equal(decideStrokeLink(S('#ff0000', 5), S(null, 5)), 'stroke-none');
  assert.equal(decideStrokeLink(S('#ff0000', 0), S('none', 0)), 'stroke-none');
});

test('decideStrokeLink — weight 0 → >0 with stroke none triggers black', () => {
  assert.equal(decideStrokeLink(S('none', 0), S('none', 0.25)), 'weight-up');
  assert.equal(decideStrokeLink(S('none', 0), S('none', 3)), 'weight-up');
});

test('decideStrokeLink — no trigger: >0→>0, non-none stroke weight change, none→none, unknown prev', () => {
  assert.equal(decideStrokeLink(S('none', 1), S('none', 2)), null); // >0 → >0 never changes colour
  assert.equal(decideStrokeLink(S('#00ff00', 0), S('#00ff00', 4)), null); // stroke not none: untouched
  assert.equal(decideStrokeLink(S('none', 3), S('none', 0)), null);
  assert.equal(decideStrokeLink(S('none', 0), S('none', 0)), null);
  assert.equal(decideStrokeLink(S(null, null), S('none', 2)), null); // unknown before
  assert.equal(decideStrokeLink(S('#123456', 2), S('#abcdef', 2)), null);
  // Results of the rule never satisfy the other trigger (idempotent, no loop).
  assert.equal(decideStrokeLink(S('none', 5), S('none', 0)), null);
  assert.equal(decideStrokeLink(S('none', 3), S(BLACK, 3)), null);
});

test('isNonePaint', () => {
  for (const v of [null, '', 'none', 'NONE', ' transparent ']) assert.equal(isNonePaint(v), true);
  for (const v of ['#000', 'red', 'url(#g)']) assert.equal(isNonePaint(v), false);
});

test('effectiveStroke — Outside/Inside bodies use stored paint and user weight', () => {
  const attrs = { stroke: 'none', 'stroke-width': '8', 'data-visteras-stroke-align': 'outside', 'data-visteras-stroke-paint': '#ff0000', 'data-visteras-stroke-weight': '8' };
  assert.deepEqual(effectiveStroke((n) => attrs[n] ?? null), { stroke: '#ff0000', width: 8, aligned: true });
  const plain = { stroke: '#00f', 'stroke-width': '2.5' };
  assert.deepEqual(effectiveStroke((n) => plain[n] ?? null), { stroke: '#00f', width: 2.5, aligned: false });
  const centre = { stroke: 'none', 'stroke-width': '3', 'data-visteras-stroke-align': 'center', 'data-visteras-stroke-paint': '#f00' };
  assert.equal(effectiveStroke((n) => centre[n] ?? null).stroke, 'none');
});

test('oldValuesFromRecords — first oldValue per attribute wins', () => {
  const m = oldValuesFromRecords([
    { attributeName: 'stroke', oldValue: '#f00' },
    { attributeName: 'stroke', oldValue: 'none' },
    { attributeName: 'stroke-width', oldValue: null },
  ]);
  assert.equal(m.get('stroke'), '#f00');
  assert.equal(m.get('stroke-width'), null);
  assert.equal(m.has('stroke-width'), true);
});

test('decideDefaults / defaultsPatch', () => {
  assert.deepEqual(defaultsPatch(decideDefaults({ stroke: '#000000', stroke_width: 5 }, { stroke: 'none', stroke_width: 5 })), { stroke_width: 0, _visterasStrokeAlign: 'center' });
  assert.deepEqual(defaultsPatch(decideDefaults({ stroke: 'none', stroke_width: 0 }, { stroke: 'none', stroke_width: 2 })), { stroke: BLACK });
  assert.equal(decideDefaults({ stroke: 'none', stroke_width: 1 }, { stroke: 'none', stroke_width: 2 }), null);
  assert.equal(decideDefaults({ stroke: '#f00', stroke_width: 0 }, { stroke: '#f00', stroke_width: 2 }), null);
  assert.equal(defaultsPatch(null), null);
});

// ─── Mounted rule against fakes ──────────────────────────────────────────────
function setupFakes() {
  let moCallback = null;
  let queued = [];
  globalThis.window = globalThis;
  globalThis.document = { getElementById: () => null };
  globalThis.getComputedStyle = () => ({ stroke: 'none' });
  globalThis.MutationObserver = class {
    constructor(cb) { moCallback = cb; }
    observe() {}
    takeRecords() { const r = queued; queued = []; return r; }
  };
  delete globalThis.__visterasStrokeLinkMounted;
  const content = { contains: () => true };
  const makeEl = (id, attrs) => {
    const el = {
      id, nodeType: 1, nodeName: 'rect', isConnected: true, parentNode: { getAttribute: () => null },
      _a: { ...attrs },
      getAttribute(n) { return n in this._a ? this._a[n] : null; },
      setAttribute(n, v) { const old = this.getAttribute(n); this._a[n] = String(v); queued.push({ type: 'attributes', target: this, attributeName: n, oldValue: old }); },
      removeAttribute(n) { if (!(n in this._a)) return; const old = this._a[n]; delete this._a[n]; queued.push({ type: 'attributes', target: this, attributeName: n, oldValue: old }); },
      hasAttribute(n) { return n in this._a; },
      closest() { return null; },
      contains(o) { return o === this; },
    };
    return el;
  };
  class ChangeElementCommand {
    constructor(elem, oldValues) {
      this.elem = elem; this.oldValues = oldValues; this.newValues = {};
      for (const n of Object.keys(oldValues)) this.newValues[n] = elem.getAttribute(n);
    }
    elements() { return [this.elem]; }
    set(vals) { for (const [n, v] of Object.entries(vals)) { if (v == null) this.elem.removeAttribute(n); else this.elem.setAttribute(n, v); } }
    apply() { this.set(this.newValues); }
    unapply() { this.set(this.oldValues); }
  }
  class BatchCommand {
    constructor(text) { this.text = text; this.stack = []; }
    getText() { return this.text; }
    addSubCommand(c) { this.stack.push(c); }
    elements() { return [...new Set(this.stack.flatMap((c) => c.elements()))]; }
    apply(h) { this.stack.forEach((c) => c.apply(h)); }
    unapply(h) { [...this.stack].reverse().forEach((c) => c.unapply(h)); }
  }
  const undoMgr = {
    undoStack: [], undoStackPointer: 0,
    addCommandToHistory(c) { this.undoStack = this.undoStack.slice(0, this.undoStackPointer); this.undoStack.push(c); this.undoStackPointer = this.undoStack.length; },
    undo() { if (this.undoStackPointer > 0) this.undoStack[--this.undoStackPointer].unapply(); },
    redo() { if (this.undoStackPointer < this.undoStack.length) this.undoStack[this.undoStackPointer++].apply(); },
  };
  const calls = [];
  const sc = {
    undoMgr, history: { BatchCommand, ChangeElementCommand },
    getSvgRoot: () => ({}), getSvgContent: () => content,
    getSelectedElements: () => sc._sel, _sel: [],
    call: (name) => calls.push(name),
    curShape: { stroke: '#000000', stroke_width: 1, fill: '#ccc' },
    curText: { stroke: 'none', stroke_width: 0 },
  };
  sc.curProperties = sc.curShape;
  const fire = () => { const r = queued; queued = []; moCallback(r); };
  return { sc, undoMgr, makeEl, fire, ChangeElementCommand, BatchCommand, calls, queued: () => queued };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

test('mounted: recorded stroke → none merges weight 0 into the SAME history entry; undo/redo one step', async () => {
  const f = setupFakes();
  const link = mountStrokeLink({ svgCanvas: f.sc });
  assert.ok(link);
  const el = f.makeEl('r1', { stroke: '#0000ff', 'stroke-width': '5' });
  f.sc._sel = [el];
  // A source changes the stroke with history (like changeSelectedAttribute).
  el.setAttribute('stroke', 'none');
  f.undoMgr.addCommandToHistory(new f.ChangeElementCommand(el, { stroke: '#0000ff' }));
  f.fire();
  assert.equal(el._a.stroke, 'none');
  assert.equal(el._a['stroke-width'], '0');
  assert.equal(f.undoMgr.undoStack.length, 1, 'one history entry');
  assert.equal(link.stats.merged, 1);
  // Our own writes must not re-trigger (records were discarded).
  assert.deepEqual(f.queued(), []);
  f.undoMgr.undo();
  assert.equal(el._a.stroke, '#0000ff');
  assert.equal(el._a['stroke-width'], '5');
  assert.equal(f.undoMgr.undoStack.length, 1);
  f.undoMgr.redo();
  assert.equal(el._a.stroke, 'none');
  assert.equal(el._a['stroke-width'], '0');
  assert.equal(f.undoMgr.undoStack.length, 1, 'undo/redo do not add entries (loop guard)');
  assert.equal(link.stats.objectRuns, 1);
  await tick();
});

test('mounted: live weight 0 → 2 with stroke none sets black as ONE standalone entry; undo restores both', async () => {
  const f = setupFakes();
  const link = mountStrokeLink({ svgCanvas: f.sc });
  const el = f.makeEl('r2', { stroke: 'none', 'stroke-width': '0' });
  f.sc._sel = [el];
  el.setAttribute('stroke-width', '2'); // live stepper (no history)
  f.fire();
  assert.equal(el._a.stroke, BLACK);
  assert.equal(f.undoMgr.undoStack.length, 1);
  assert.equal(link.stats.standalone, 1);
  // Further live >0 → >0 changes never touch the colour and add no entries.
  el.setAttribute('stroke-width', '3');
  f.fire();
  assert.equal(el._a.stroke, BLACK);
  assert.equal(f.undoMgr.undoStack.length, 1);
  f.undoMgr.undo();
  assert.equal(el._a.stroke, 'none');
  assert.equal(el._a['stroke-width'], '0');
  f.undoMgr.redo();
  assert.equal(el._a.stroke, BLACK);
  assert.equal(el._a['stroke-width'], '3', 'redo restores the latest live weight');
  await tick();
});

test('mounted: weight change on a non-none stroke is untouched; >0→>0 with none untouched', async () => {
  const f = setupFakes();
  const link = mountStrokeLink({ svgCanvas: f.sc });
  const a = f.makeEl('a', { stroke: '#ff0000', 'stroke-width': '0' });
  const b = f.makeEl('b', { stroke: 'none', 'stroke-width': '1' });
  a.setAttribute('stroke-width', '4');
  b.setAttribute('stroke-width', '2');
  f.fire();
  assert.equal(a._a.stroke, '#ff0000');
  assert.equal(b._a.stroke, 'none');
  assert.equal(f.undoMgr.undoStack.length, 0);
  assert.equal(link.stats.objectRuns, 0);
  await tick();
});

test('mounted: Outside-stroked body → none removes align state through the colour system; undo re-renders it', async () => {
  const f = setupFakes();
  const alignCalls = [];
  const api = {
    readElementStrokeWeight: (e) => Number(e.getAttribute('data-visteras-stroke-weight') ?? e.getAttribute('stroke-width')),
    applyStrokeAlignToElement: (e, sc, o) => {
      alignCalls.push(o.align);
      if (o.align === 'center') { e.removeAttribute('data-visteras-sa-body'); e.setAttribute('data-visteras-stroke-align', 'center'); }
      else e.setAttribute('data-visteras-sa-body', '1');
    },
    syncFromCanvas() {},
  };
  mountStrokeLink({ svgCanvas: f.sc }, api);
  const el = f.makeEl('o', {
    stroke: 'none', 'stroke-width': '8', 'data-visteras-stroke-align': 'outside', 'data-visteras-stroke-paint': '#ff0000',
    'data-visteras-stroke-weight': '8', 'data-visteras-sa-body': '1',
  });
  f.sc._sel = [el];
  el.setAttribute('data-visteras-stroke-paint', 'none'); // what applyPaintAttribute does for aligned bodies
  f.fire();
  assert.deepEqual(alignCalls, ['center']);
  for (const n of ['data-visteras-stroke-align', 'data-visteras-stroke-paint', 'data-visteras-stroke-weight', 'data-visteras-sa-body']) assert.equal(n in el._a, false, n);
  assert.equal(el._a.stroke, 'none');
  assert.equal(el._a['stroke-width'], '0');
  assert.equal(f.undoMgr.undoStack.length, 1);
  f.undoMgr.undo();
  assert.equal(el._a['data-visteras-stroke-align'], 'outside');
  assert.equal(el._a['data-visteras-stroke-paint'], '#ff0000');
  assert.equal(el._a['stroke-width'], '8');
  assert.equal(alignCalls.at(-1), 'outside', 'undo re-renders the Outside helper');
  f.undoMgr.redo();
  assert.equal('data-visteras-stroke-align' in el._a, false);
  assert.equal(el._a['stroke-width'], '0');
  await tick();
});

test('mounted: defaults (nothing selected) follow the rule once per change, no loop', async () => {
  const f = setupFakes();
  const link = mountStrokeLink({ svgCanvas: f.sc });
  f.sc._sel = [];
  f.sc.curShape.stroke = 'none';
  await tick();
  assert.equal(f.sc.curShape.stroke_width, 0);
  assert.equal(f.sc.curShape._visterasStrokeAlign, 'center');
  assert.equal(link.stats.defaultRuns, 1);
  f.sc.curShape.stroke_width = 2;
  await tick();
  assert.equal(f.sc.curShape.stroke, BLACK);
  assert.equal(link.stats.defaultRuns, 2);
  f.sc.curShape.stroke_width = 3; // >0 → >0
  await tick();
  assert.equal(link.stats.defaultRuns, 2);
  // Eyedropper-style batch in one task: stroke none + width 1 ⇒ weight 0 wins, no black.
  f.sc.curShape.stroke = 'none';
  f.sc.curShape.stroke_width = 1;
  await tick();
  assert.equal(f.sc.curShape.stroke, 'none');
  assert.equal(f.sc.curShape.stroke_width, 0);
  // With a selection the objects rule owns it: defaults untouched.
  f.sc._sel = [f.makeEl('x', {})];
  f.sc.curShape.stroke_width = 4;
  await tick();
  assert.equal(f.sc.curShape.stroke, 'none');
  assert.equal(link.stats.defaultRuns, 3);
});
