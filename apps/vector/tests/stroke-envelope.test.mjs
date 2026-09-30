/**
 * Tests for visteras-stroke-envelope.js — the stroke region used by Offset
 * Path and Outline Stroke. Pure point helpers plus real Paper.js booleans.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newScope } from './helpers/paper-node.mjs';

const { dedupePoints, arcSteps, strokePieces, strokeEnvelope, offsetItem, outlineItem, uniteAll } = await import('../js/visteras-stroke-envelope.js');

const B = (it) => [it.bounds.x, it.bounds.y, it.bounds.width, it.bounds.height].map((v) => Math.round(v * 100) / 100);
const A = (it) => Math.round(Math.abs(it.area));
const sq = (s, x = 0, y = 0, w = 100, h = 100) => new s.Path.Rectangle({ point: [x, y], size: [w, h], insert: false });

test('dedupePoints — drops repeats, closing duplicate and straight-through vertices', () => {
  assert.deepEqual(dedupePoints([[0, 0], [0, 0], [10, 0], [20, 0], [20, 10], [0, 0]], true), [[0, 0], [20, 0], [20, 10]]);
  assert.deepEqual(dedupePoints([[0, 0], [5, 0], [10, 0]], false), [[0, 0], [10, 0]]);
});

test('arcSteps — more steps for bigger radius / tighter tolerance; none for zero angle', () => {
  assert.equal(arcSteps(10, 0), 0);
  assert.ok(arcSteps(100, Math.PI, 0.1) > arcSteps(10, Math.PI, 0.1));
  assert.ok(arcSteps(10, Math.PI, 0.01) > arcSteps(10, Math.PI, 0.1));
});

test('strokePieces — one polygon per edge (+ caps for open paths)', () => {
  const closed = strokePieces([[0, 0], [100, 0], [100, 100], [0, 100]], true, 5, { join: 'miter' });
  assert.equal(closed.length, 4);
  const open = strokePieces([[0, 0], [100, 0]], false, 5, { cap: 'round' });
  assert.equal(open.length, 3);
  assert.equal(strokePieces([[0, 0], [100, 0]], false, 5, { cap: 'butt' }).length, 1);
  assert.deepEqual(strokePieces([[0, 0], [100, 0]], false, 0), []);
});

test('strokePieces — miter corner reaches r·√2 on a right angle; bevel does not', () => {
  const far = (polys) => Math.max(...polys.flat().map(([x, y]) => Math.hypot(x - 100, y - 0)).filter((d) => d < 30));
  const miter = strokePieces([[0, 0], [100, 0], [100, 100]], false, 10, { join: 'miter', miterLimit: 4 });
  const bevel = strokePieces([[0, 0], [100, 0], [100, 100]], false, 10, { join: 'bevel' });
  assert.ok(Math.abs(far(miter.slice(0, 1)) - 10 * Math.SQRT2) < 1e-6);
  assert.ok(far(bevel.slice(0, 1)) <= 10 + 1e-9);
});

test('strokePieces — miter over the limit falls back to bevel', () => {
  // ~10° turn back: miter ratio ≈ 11.5 > limit 4.
  const pts = [[0, 0], [100, 0], [0, 17.6]];
  const a = strokePieces(pts, false, 5, { join: 'miter', miterLimit: 4 });
  const b = strokePieces(pts, false, 5, { join: 'bevel' });
  assert.deepEqual(a, b);
});

test('offsetItem — square +10 by join type (exact areas)', () => {
  const s = newScope();
  const m = offsetItem(s, sq(s), 10, { join: 'miter', miterLimit: 4 });
  assert.deepEqual(B(m), [-10, -10, 120, 120]); assert.equal(A(m), 14400);
  const b = offsetItem(s, sq(s), 10, { join: 'bevel' });
  assert.deepEqual(B(b), [-10, -10, 120, 120]); assert.equal(A(b), 14200);
  const r = offsetItem(s, sq(s), 10, { join: 'round' });
  assert.deepEqual(B(r), [-10, -10, 120, 120]);
  assert.ok(Math.abs(A(r) - (14000 + Math.PI * 100)) < 40, String(A(r)));
});

test('offsetItem — negative offset keeps convex corners sharp', () => {
  const s = newScope();
  const r = offsetItem(s, sq(s), -10, { join: 'round' });
  assert.deepEqual(B(r), [10, 10, 80, 80]); assert.equal(A(r), 6400);
});

test('offsetItem — concave L-shape: miter expands correctly (7500 → 9600)', () => {
  const s = newScope();
  const L = sq(s).subtract(sq(s, 50, 50, 60, 60), { insert: false });
  const r = offsetItem(s, L, 5, { join: 'miter' });
  assert.deepEqual(B(r), [-5, -5, 110, 110]); assert.equal(A(r), 9600);
});

test('offsetItem — circle keeps its shape (area within 1%)', () => {
  const s = newScope();
  const r = offsetItem(s, new s.Path.Circle({ center: [0, 0], radius: 50, insert: false }), 10, { join: 'round' });
  assert.ok(Math.abs(A(r) - Math.PI * 3600) / (Math.PI * 3600) < 0.01, String(A(r)));
});

test('offsetItem — compound path with a hole: hole shrinks as the outside grows', () => {
  const s = newScope();
  const ring = sq(s).subtract(sq(s, 30, 30, 40, 40), { insert: false });
  const r = offsetItem(s, ring, 5, { join: 'miter' });
  assert.deepEqual(B(r), [-5, -5, 110, 110]);
  assert.equal(A(r), 110 * 110 - 30 * 30);
});

test('outlineItem — centre / inside / outside and open butt line', () => {
  const s = newScope();
  assert.equal(A(outlineItem(s, sq(s), 10, { join: 'miter' })), 110 * 110 - 90 * 90);
  const inside = outlineItem(s, sq(s), 10, { join: 'miter', align: 'inside' });
  assert.deepEqual(B(inside), [0, 0, 100, 100]); assert.equal(A(inside), 10000 - 6400);
  const outside = outlineItem(s, sq(s), 10, { join: 'miter', align: 'outside' });
  assert.deepEqual(B(outside), [-10, -10, 120, 120]); assert.equal(A(outside), 14400 - 10000);
  const line = outlineItem(s, new s.Path({ segments: [[0, 0], [100, 0]], insert: false }), 10, { cap: 'butt' });
  assert.deepEqual(B(line), [0, -5, 100, 10]);
  const sqCap = outlineItem(s, new s.Path({ segments: [[0, 0], [100, 0]], insert: false }), 10, { cap: 'square' });
  assert.deepEqual(B(sqCap), [-5, -5, 110, 10]);
  assert.equal(outlineItem(s, sq(s), 0), null);
});

test('strokeEnvelope / uniteAll — empty input is null', () => {
  const s = newScope();
  assert.equal(uniteAll(s, []), null);
  assert.equal(strokeEnvelope(s, new s.Path({ insert: false }), 5), null);
});
