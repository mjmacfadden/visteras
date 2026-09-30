/**
 * Tests for visteras-eyedropper.js pure helper functions.
 * Note: DOM-dependent functions (mountEyedropperTool, cursor HUD, etc.)
 * are not testable in Node without a full browser environment.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Minimal DOM shim for sampleStyleFrom / applyStyleToElements ─────────────
function makeSvgElement(attrs = {}) {
  const el = {
    nodeName: 'rect',
    _attrs: { ...attrs },
    getAttribute(a) { return this._attrs[a] ?? null; },
    setAttribute(a, v) { this._attrs[a] = String(v); },
    removeAttribute(a) { delete this._attrs[a]; },
  };
  return el;
}

// Dynamically import from the module
const { sampleStyleFrom, applyStyleToElements } = await import('../js/visteras-eyedropper.js');

// ─── sampleStyleFrom ──────────────────────────────────────────────────────────
test('sampleStyleFrom — returns fill and stroke from element', () => {
  const el = makeSvgElement({ fill: '#f00', stroke: '#00f', 'stroke-width': '2', opacity: '0.8' });
  const result = sampleStyleFrom(el);
  assert.equal(result['fill'], '#f00');
  assert.equal(result['stroke'], '#00f');
  assert.equal(result['stroke-width'], '2');
  assert.equal(result['opacity'], '0.8');
});

test('sampleStyleFrom — returns empty object for svg element', () => {
  const el = { nodeName: 'svg', getAttribute: () => '#fff' };
  const result = sampleStyleFrom(el);
  assert.deepEqual(result, {});
});

test('sampleStyleFrom — returns empty object for null', () => {
  const result = sampleStyleFrom(null);
  assert.deepEqual(result, {});
});

test('sampleStyleFrom — omits null attributes', () => {
  const el = makeSvgElement({ fill: '#abc' }); // no stroke or opacity
  const result = sampleStyleFrom(el);
  assert.equal(result['fill'], '#abc');
  assert.equal('stroke' in result, false);
  assert.equal('opacity' in result, false);
});

test('sampleStyleFrom — captures stroke-dasharray and linecap', () => {
  const el = makeSvgElement({
    'stroke-dasharray': '4 2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
  const result = sampleStyleFrom(el);
  assert.equal(result['stroke-dasharray'], '4 2');
  assert.equal(result['stroke-linecap'], 'round');
  assert.equal(result['stroke-linejoin'], 'round');
});

// ─── applyStyleToElements ─────────────────────────────────────────────────────
function makeHistory() {
  const applied = [];
  class ChangeElementCommand {
    constructor(el, changes) { applied.push({ el, changes }); }
  }
  class BatchCommand {
    constructor(name) { this.name = name; this.sub = []; }
    addSubCommand(c) { this.sub.push(c); }
  }
  const undoMgr = { cmds: [], addCommandToHistory(c) { this.cmds.push(c); } };
  return { ChangeElementCommand, BatchCommand, undoMgr, applied };
}

test('applyStyleToElements — applies fill to a single target', () => {
  const el = makeSvgElement({ fill: '#000' });
  const history = makeHistory();
  applyStyleToElements([el], { fill: '#ff0' }, history);
  assert.equal(el._attrs['fill'], '#ff0');
  assert.equal(history.undoMgr.cmds.length, 1);
});

test('applyStyleToElements — applies to multiple targets', () => {
  const el1 = makeSvgElement({ fill: '#000' });
  const el2 = makeSvgElement({ fill: '#111' });
  const history = makeHistory();
  applyStyleToElements([el1, el2], { fill: '#ff0' }, history);
  assert.equal(el1._attrs['fill'], '#ff0');
  assert.equal(el2._attrs['fill'], '#ff0');
  assert.equal(history.undoMgr.cmds.length, 1); // one batch
});

test('applyStyleToElements — no-ops on empty target array', () => {
  const history = makeHistory();
  applyStyleToElements([], { fill: '#red' }, history);
  assert.equal(history.undoMgr.cmds.length, 0);
});

test('applyStyleToElements — no-ops on empty style', () => {
  const el = makeSvgElement({ fill: '#f00' });
  const history = makeHistory();
  applyStyleToElements([el], {}, history);
  assert.equal(history.undoMgr.cmds.length, 0);
  assert.equal(el._attrs['fill'], '#f00'); // unchanged
});

test('applyStyleToElements — applies stroke-width', () => {
  const el = makeSvgElement({ 'stroke-width': '1' });
  const history = makeHistory();
  applyStyleToElements([el], { 'stroke-width': '4' }, history);
  assert.equal(el._attrs['stroke-width'], '4');
});
