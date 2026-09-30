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
    hasAttribute(a) { return a in this._attrs; },
  };
  return el;
}

// Dynamically import from the module
const {
  sampleStyleFrom, applyStyleToElements, normalizePaint, normalizeDash,
  resolveBody, expandTargets, styleFromCurShape,
} = await import('../js/visteras-eyedropper.js');

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

test('sampleStyleFrom — marks missing attributes null (reset on apply)', () => {
  const el = makeSvgElement({ fill: '#abc' }); // no stroke or opacity
  const result = sampleStyleFrom(el);
  assert.equal(result['fill'], '#abc');
  assert.equal(result['stroke'], null);
  assert.equal(result['opacity'], null);
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

// ─── Computed style, resets, stroke-align ─────────────────────────────────────
function computedFrom(map) {
  return () => ({ getPropertyValue: (p) => map[p] ?? '' });
}

test('sampleStyleFrom — reads computed style (inherited/group, style="", class paint)', () => {
  const el = makeSvgElement({}); // no own paint attributes at all
  const gcs = computedFrom({
    fill: 'rgb(0, 170, 0)', stroke: 'url("http://x/vector/index.html#grad1")', 'stroke-width': '5px',
    'fill-opacity': '1', 'stroke-opacity': '0.5', opacity: '1', 'stroke-dasharray': '4px, 2px',
    'stroke-linecap': 'round', 'stroke-linejoin': 'miter', 'stroke-miterlimit': '4', 'mix-blend-mode': 'multiply',
  });
  const s = sampleStyleFrom(el, { getComputedStyle: gcs });
  assert.equal(s.fill, '#00aa00');
  assert.equal(s.stroke, 'url(#grad1)');
  assert.equal(s['stroke-width'], '5');
  assert.equal(s['stroke-opacity'], '0.5');
  assert.equal(s['stroke-dasharray'], '4 2');
  assert.equal(s['stroke-linecap'], 'round');
  assert.equal(s['mix-blend-mode'], 'multiply');
  // Defaults become null so they reset the target.
  assert.equal(s['fill-opacity'], null);
  assert.equal(s.opacity, null);
  assert.equal(s['stroke-linejoin'], null);
  assert.equal(s['stroke-miterlimit'], null);
  assert.equal(s['stroke-align'], 'center');
});

test('sampleStyleFrom — Outside/Inside aligned body reports its stored stroke paint and user weight', () => {
  const el = makeSvgElement({
    fill: '#ffcc00', stroke: 'none', 'stroke-width': '6',
    'data-visteras-stroke-align': 'outside', 'data-visteras-stroke-weight': '6', 'data-visteras-stroke-paint': '#ff0000',
  });
  const s = sampleStyleFrom(el, { getComputedStyle: null });
  assert.equal(s.stroke, '#ff0000');
  assert.equal(s['stroke-width'], '6');
  assert.equal(s['stroke-align'], 'outside');
});

test('resolveBody — stroke helper resolves to its body (never samples the 2x helper)', () => {
  const body = makeSvgElement({ id: 'b1', fill: '#123456', 'data-visteras-stroke-weight': '4', 'data-visteras-stroke-align': 'inside' });
  const helper = makeSvgElement({ 'data-visteras-stroke-align-helper': '1', 'data-visteras-helper-for': 'b1', 'stroke-width': '8' });
  helper.ownerDocument = { getElementById: (id) => (id === 'b1' ? body : null) };
  assert.equal(resolveBody(helper), body);
  const s = sampleStyleFrom(helper, { getComputedStyle: null });
  assert.equal(s.fill, '#123456');
  assert.equal(s['stroke-width'], '4');
  // With the colour-system API, its resolver wins.
  const api = { resolveStrokeAlignBody: () => body };
  assert.equal(resolveBody(helper, api), body);
});

test('applyStyleToElements — null values remove the attribute on the target', () => {
  const el = makeSvgElement({ fill: '#000', 'stroke-dasharray': '5 5', opacity: '0.3', 'stroke-linecap': 'round' });
  const history = makeHistory();
  applyStyleToElements([el], { fill: '#f00', 'stroke-dasharray': null, opacity: null, 'stroke-linecap': null }, history);
  assert.equal(el._attrs.fill, '#f00');
  assert.equal('stroke-dasharray' in el._attrs, false);
  assert.equal('opacity' in el._attrs, false);
  assert.equal('stroke-linecap' in el._attrs, false);
  assert.equal(history.undoMgr.cmds.length, 1);
  assert.equal(history.undoMgr.cmds[0].name, 'Eyedropper Apply');
  // The undo record holds the previous values.
  assert.deepEqual(history.applied[0].changes, { fill: '#000', 'stroke-dasharray': '5 5', opacity: '0.3', 'stroke-linecap': 'round' });
});

test('applyStyleToElements — strips matching inline style properties and records style', () => {
  const style = new Map([['fill', '#0f0'], ['stroke', '#00f']]);
  const el = makeSvgElement({ style: 'fill:#0f0;stroke:#00f' });
  el.style = {
    getPropertyValue: (p) => style.get(p) || '',
    removeProperty: (p) => { style.delete(p); el._attrs.style = [...style].map(([k, v]) => `${k}:${v}`).join(';'); },
    setProperty: (p, v) => { style.set(p, v); },
  };
  const history = makeHistory();
  applyStyleToElements([el], { fill: '#f00' }, history);
  assert.equal(el._attrs.fill, '#f00');
  assert.equal(style.has('fill'), false, 'inline fill removed so the attribute wins');
  assert.equal(style.get('stroke'), '#00f', 'unrelated inline props kept');
  assert.equal(history.applied[0].changes.style, 'fill:#0f0;stroke:#00f');
});

test('applyStyleToElements — groups apply to painted leaves; one batch', () => {
  const a = makeSvgElement({ fill: '#000' });
  const b = makeSvgElement({ fill: '#111' });
  b.nodeName = 'circle';
  const g = { nodeName: 'g', children: [a, b], getAttribute: () => null };
  const history = makeHistory();
  applyStyleToElements([g], { fill: '#abcdef' }, history);
  assert.equal(a._attrs.fill, '#abcdef');
  assert.equal(b._attrs.fill, '#abcdef');
  assert.equal(history.undoMgr.cmds.length, 1);
  assert.equal(history.undoMgr.cmds[0].sub.length, 2);
});

test('applyStyleToElements — stroke-align targets re-render through the colour system', () => {
  const el = makeSvgElement({ fill: '#000', stroke: '#000', 'stroke-width': '1' });
  const calls = [];
  const api = {
    readElementStrokeAlign: (e) => e.getAttribute('data-visteras-stroke-align') || 'center',
    readElementStrokeWeight: (e) => Number(e.getAttribute('data-visteras-stroke-weight') || e.getAttribute('stroke-width')),
    applyStrokeAlignToElement: (e, sc, opts) => {
      calls.push(opts);
      e.setAttribute('data-visteras-stroke-align', opts.align);
      e.setAttribute('data-visteras-stroke-weight', String(opts.userWidth));
      e.setAttribute('data-visteras-stroke-paint', e.getAttribute('stroke'));
      e.setAttribute('stroke', 'none');
    },
  };
  const history = makeHistory();
  applyStyleToElements([el], { stroke: '#ff0000', 'stroke-width': '6', 'stroke-align': 'outside' }, history, { api, sc: {} });
  assert.deepEqual(calls, [{ align: 'outside', userWidth: 6 }]);
  assert.equal(el._attrs['data-visteras-stroke-paint'], '#ff0000');
  const rec = history.applied[0].changes;
  assert.ok('data-visteras-stroke-align' in rec && 'stroke' in rec && 'stroke-width' in rec, 'align attrs recorded for undo');
  assert.equal(rec.stroke, '#000');
});

test('normalizePaint / normalizeDash', () => {
  assert.equal(normalizePaint('rgb(255, 0, 16)'), '#ff0010');
  assert.equal(normalizePaint('rgba(0, 0, 0, 0)'), 'none');
  assert.equal(normalizePaint('transparent'), 'none');
  assert.equal(normalizePaint('url(#g)'), 'url(#g)');
  assert.equal(normalizePaint('#ABC'), '#abc');
  assert.equal(normalizePaint(''), null);
  assert.equal(normalizeDash('4px, 2px'), '4 2');
  assert.equal(normalizeDash('none'), 'none');
  assert.equal(normalizeDash('0'), 'none');
});

test('expandTargets — dedupes and skips helpers/non-leaf elements', () => {
  const a = makeSvgElement({});
  const helper = makeSvgElement({ 'data-visteras-stroke-align-helper': '1' });
  const img = makeSvgElement({}); img.nodeName = 'image';
  assert.deepEqual(expandTargets([a, a, img]), [a]);
  assert.deepEqual(expandTargets([helper]).length, 0);
});

test('styleFromCurShape — current defaults for Option-click with no selection', () => {
  const s = styleFromCurShape({ fill: 'FF0000', stroke: '#000000', stroke_width: 3, opacity: 1, fill_opacity: 0.5, stroke_dasharray: 'none', stroke_linecap: 'butt', stroke_linejoin: 'round' });
  assert.equal(s.fill, '#ff0000');
  assert.equal(s.stroke, '#000000');
  assert.equal(s['stroke-width'], '3');
  assert.equal(s.opacity, null);
  assert.equal(s['fill-opacity'], '0.5');
  assert.equal(s['stroke-dasharray'], null);
  assert.equal(s['stroke-linecap'], null);
  assert.equal(s['stroke-linejoin'], 'round');
});
