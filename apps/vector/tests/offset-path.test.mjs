/**
 * Tests for visteras-offset-path.js (Offset Path / Outline Stroke).
 *
 * Uses the real Paper.js (tests/helpers/paper-node.mjs) so the geometry is
 * checked, not mocked: the original implementation "passed" mock tests while
 * producing an unchanged copy, because Paper's booleans ignore strokeWidth.
 * importSVG needs a DOM, so each test injects the Paper item it would return.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newScope } from './helpers/paper-node.mjs';

const { computeOffsetPath, readStrokeSpec, collectLeaves, DEFAULT_OFFSET_OPTIONS } = await import('../js/visteras-offset-path.js');

const scopeWith = (make) => { const s = newScope(); s.project.importSVG = () => make(s); return s; };
const boundsOfD = (s, d) => { const p = new s.CompoundPath({ pathData: d, insert: false }); const b = p.bounds; return [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 100) / 100); };
const rect = (s) => new s.Path.Rectangle({ point: [0, 0], size: [100, 50], insert: false });

test('computeOffsetPath — zero / tiny / non-finite offsets return null', () => {
  const s = scopeWith(rect);
  assert.equal(computeOffsetPath(s, {}, { offset: 0 }), null);
  assert.equal(computeOffsetPath(s, {}, { offset: 0.0001 }), null);
  assert.equal(computeOffsetPath(s, {}, { offset: NaN }), null);
});

test('computeOffsetPath — positive offset really grows the shape (regression: identical copy)', () => {
  const s = scopeWith(rect);
  const r = computeOffsetPath(s, {}, { offset: 10, joins: 'miter', miterLimit: 4 });
  assert.ok(r?.d);
  assert.deepEqual(boundsOfD(s, r.d), [-10, -10, 120, 70]);
});

test('computeOffsetPath — negative offset shrinks', () => {
  const s = scopeWith(rect);
  const r = computeOffsetPath(s, {}, { offset: -10, joins: 'round' });
  assert.deepEqual(boundsOfD(s, r.d), [10, 10, 80, 30]);
});

test('computeOffsetPath — shrinking past the middle yields nothing', () => {
  const s = scopeWith(rect);
  assert.equal(computeOffsetPath(s, {}, { offset: -30, joins: 'miter' }), null);
});

test('computeOffsetPath — shapes (Paper Shape) are expanded to paths', () => {
  const s = scopeWith((sc) => new sc.Shape.Circle({ center: [0, 0], radius: 20, insert: false }));
  const r = computeOffsetPath(s, {}, { offset: 5, joins: 'round' });
  const b = boundsOfD(s, r.d);
  assert.ok(Math.abs(b[2] - 50) < 0.3 && Math.abs(b[0] + 25) < 0.2, JSON.stringify(b));
});

test('computeOffsetPath — groups are united before offsetting', () => {
  const s = scopeWith((sc) => new sc.Group({ insert: false, children: [new sc.Path.Rectangle({ point: [0, 0], size: [10, 10], insert: false }), new sc.Path.Rectangle({ point: [20, 0], size: [10, 10], insert: false })] }));
  const r = computeOffsetPath(s, {}, { offset: 2, joins: 'miter' });
  assert.deepEqual(boundsOfD(s, r.d), [-2, -2, 34, 14]);
});

test('computeOffsetPath — open paths grow into their outline; cannot shrink', () => {
  const s = scopeWith((sc) => new sc.Path({ segments: [[0, 0], [100, 0]], insert: false }));
  assert.deepEqual(boundsOfD(s, computeOffsetPath(s, {}, { offset: 5, joins: 'miter' }).d), [0, -5, 100, 10]);
  assert.equal(computeOffsetPath(s, {}, { offset: -5, joins: 'miter' }), null);
});

test('computeOffsetPath — returns null when importSVG throws or yields nothing', () => {
  const s = newScope();
  s.project.importSVG = () => { throw new Error('bad'); };
  assert.equal(computeOffsetPath(s, {}, { offset: 5 }), null);
  s.project.importSVG = () => new s.Group({ insert: false });
  assert.equal(computeOffsetPath(s, {}, { offset: 5 }), null);
});

test('DEFAULT_OFFSET_OPTIONS — Illustrator defaults: Miter, limit 4, offset 10, keep original', () => {
  assert.deepEqual({ ...DEFAULT_OFFSET_OPTIONS }, { offset: 10, joins: 'miter', miterLimit: 4, copyOriginal: true });
  assert.ok(Object.isFrozen(DEFAULT_OFFSET_OPTIONS));
});

test('computeOffsetPath — joins default to Miter (sharp corners, exact area)', () => {
  const s = scopeWith((sc) => new sc.Path.Rectangle({ point: [0, 0], size: [100, 100], insert: false }));
  const r = computeOffsetPath(s, {}, { offset: 10 });
  const p = new s.CompoundPath({ pathData: r.d, insert: false });
  assert.deepEqual(boundsOfD(s, r.d), [-10, -10, 120, 120]);
  assert.equal(Math.round(Math.abs(p.area)), 14400);
});

test('computeOffsetPath — miter limit is passed to the envelope (default 4 bevels a sharp tip)', () => {
  const tri = (sc) => new sc.Path({ segments: [[0, 0], [100, 0], [0, 20]], closed: true, insert: false });
  const s = scopeWith(tri);
  const def = boundsOfD(s, computeOffsetPath(s, {}, { offset: 5 }).d);
  const lim4 = boundsOfD(s, computeOffsetPath(s, {}, { offset: 5, joins: 'miter', miterLimit: 4 }).d);
  const lim20 = boundsOfD(s, computeOffsetPath(s, {}, { offset: 5, joins: 'miter', miterLimit: 20 }).d);
  assert.deepEqual(def, lim4, 'default = miter limit 4');
  assert.ok(lim20[2] > lim4[2] + 20, `limit 20 keeps the long tip: ${lim20} vs ${lim4}`);
});

// ─── readStrokeSpec ─────────────────────────────────────────────────────────
function el(attrs, computed = {}) {
  return { nodeName: 'path', isConnected: true, _c: computed, getAttribute: (n) => attrs[n] ?? null };
}
const getCS = (e) => ({ getPropertyValue: (p) => e._c[p] ?? '' });

test('readStrokeSpec — attribute stroke, width, joins, caps, opacity', () => {
  const s = readStrokeSpec(el({ stroke: '#cc3322' }, { stroke: 'rgb(204, 51, 34)', 'stroke-width': '8px', 'stroke-linejoin': 'round', 'stroke-linecap': 'square', 'stroke-miterlimit': '10', 'stroke-opacity': '0.5' }), getCS);
  assert.deepEqual({ ...s }, { color: '#cc3322', width: 8, align: 'center', join: 'round', cap: 'square', miterLimit: 10, opacity: 0.5, dashed: false });
});

test('readStrokeSpec — style= stroke resolved from computed style', () => {
  const s = readStrokeSpec(el({ style: 'stroke:#8a2be2;stroke-width:4' }, { stroke: 'rgb(138, 43, 226)', 'stroke-width': '4px' }), getCS);
  assert.equal(s.color, '#8a2be2');
  assert.equal(s.width, 4);
});

test('readStrokeSpec — Inside/Outside bodies use stored paint + user weight', () => {
  const s = readStrokeSpec(el({ stroke: 'none', 'stroke-width': '8', 'data-visteras-stroke-align': 'outside', 'data-visteras-stroke-paint': '#ff7700', 'data-visteras-stroke-weight': '8' }, { stroke: 'none', 'stroke-width': '8px' }), getCS);
  assert.equal(s.color, '#ff7700');
  assert.equal(s.width, 8);
  assert.equal(s.align, 'outside');
});

test('readStrokeSpec — no stroke, none, or zero width ⇒ null', () => {
  assert.equal(readStrokeSpec(el({}, { stroke: 'none' }), getCS), null);
  assert.equal(readStrokeSpec(el({ stroke: '#000' }, { stroke: 'rgb(0, 0, 0)', 'stroke-width': '0px' }), getCS), null);
});

// ─── collectLeaves ──────────────────────────────────────────────────────────
function node(nodeName, attrs = {}, children = []) {
  const n = { nodeName, attrs, children, parentNode: null, getAttribute: (k) => attrs[k] ?? null };
  for (const c of children) c.parentNode = n;
  n.querySelectorAll = () => { const out = []; const walk = (x) => { for (const c of x.children) { if (['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line'].includes(c.nodeName)) out.push(c); walk(c); } }; walk(n); return out; };
  return n;
}

test('collectLeaves — groups expand to shapes, wraps map to bodies, helpers skipped, no duplicates', () => {
  const body = node('rect', { 'data-visteras-sa-body': '1', id: 'b' });
  const helper = node('rect', { 'data-visteras-stroke-align-helper': '1' });
  const wrap = node('g', { 'data-visteras-sa-wrap': '1' }, [helper, body]);
  const a = node('path'); const b2 = node('ellipse');
  const g = node('g', {}, [a, b2, node('text')]);
  const leaves = collectLeaves([g, wrap, a, node('image')]);
  assert.deepEqual(leaves, [a, b2, body]);
});
