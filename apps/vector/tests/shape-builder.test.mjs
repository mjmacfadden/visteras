/**
 * Tests for visteras-shape-builder.js pure helpers.
 * Real Paper.js cannot load in Node here, so region math is exercised with a
 * grid-cell mock: each "path" is a set of unit cells, and intersect/subtract
 * are set operations. That checks the partition logic (atomic regions,
 * membership, topmost owner) independently of Paper's curve booleans, which
 * are covered by the browser smoke (tests/README.md).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  MODE,
  shouldCopyAttr,
  resolveSourceBody,
  isShapeBuilderSource,
  collectSources,
  matrixToString,
  absArea,
  splitIslands,
  partitionRegions,
  planOperation,
  sampleSegment,
  cleanItem,
} = await import('../js/visteras-shape-builder.js');

// ─── Grid-cell PathItem mock ─────────────────────────────────────────────────
class Cells {
  constructor(cells) { this.cells = new Set(cells); }
  get area() { return this.cells.size; }
  clone() { return new Cells(this.cells); }
  intersect(o) { return new Cells([...this.cells].filter((c) => o.cells.has(c))); }
  subtract(o) { return new Cells([...this.cells].filter((c) => !o.cells.has(c))); }
}
const box = (x0, y0, x1, y1) => {
  const out = [];
  for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) out.push(`${x},${y}`);
  return new Cells(out);
};

// ─── Minimal element mock ─────────────────────────────────────────────────────
function el(tag, attrs = {}, children = []) {
  return {
    localName: tag,
    nodeName: tag,
    _a: { ...attrs },
    children,
    getAttribute(n) { return this._a[n] ?? null; },
  };
}

test('MODE is shape_builder', () => {
  assert.equal(MODE, 'shape_builder');
});

test('shouldCopyAttr — keeps paint, drops geometry/ids/stroke-align internals', () => {
  for (const a of ['fill', 'stroke', 'stroke-width', 'opacity', 'stroke-dasharray', 'class']) assert.equal(shouldCopyAttr(a), true, a);
  for (const a of ['id', 'd', 'x', 'width', 'cx', 'r', 'points', 'transform', 'clip-path', 'mask',
    'data-visteras-stroke-align', 'data-visteras-stroke-weight', 'data-visteras-sa-body']) assert.equal(shouldCopyAttr(a), false, a);
  assert.equal(shouldCopyAttr(''), false);
});

test('resolveSourceBody — wrap resolves to its body, helper is never a source', () => {
  const body = el('rect', { 'data-visteras-sa-body': '1' });
  const helper = el('rect', { 'data-visteras-stroke-align-helper': '1' });
  const wrap = el('g', { 'data-visteras-sa-wrap': '1' }, [helper, body]);
  assert.equal(resolveSourceBody(wrap), body);
  assert.equal(resolveSourceBody(helper), null);
  const plain = el('circle');
  assert.equal(resolveSourceBody(plain), plain);
});

test('isShapeBuilderSource — closed shapes only', () => {
  for (const t of ['path', 'rect', 'circle', 'ellipse', 'polygon']) assert.equal(isShapeBuilderSource(el(t)), true, t);
  for (const t of ['line', 'polyline', 'text', 'image', 'g']) assert.equal(isShapeBuilderSource(el(t)), false, t);
});

test('collectSources — flattens groups and stroke-align wraps', () => {
  const a = el('rect');
  const b = el('ellipse');
  const body = el('path', { 'data-visteras-sa-body': '1' });
  const helper = el('path', { 'data-visteras-stroke-align-helper': '1' });
  const wrap = el('g', { 'data-visteras-sa-wrap': '1' }, [helper, body]);
  const group = el('g', {}, [b, el('text'), wrap]);
  const out = collectSources([a, group]);
  assert.deepEqual(out.map((s) => s.body), [a, b, body]);
  assert.equal(out[2].node, wrap, 'wrap is the node removed on apply');
});

test('matrixToString — formats and zeroes tiny values', () => {
  assert.equal(matrixToString({ a: 1, b: 1e-15, c: 0, d: 1, e: 10.5, f: -2 }), 'matrix(1 0 0 1 10.5 -2)');
});

test('absArea — absolute value, 0 for missing', () => {
  assert.equal(absArea({ area: -12 }), 12);
  assert.equal(absArea(null), 0);
  assert.equal(absArea({ area: NaN }), 0);
});

test('splitIslands — a simple item is its own island', () => {
  const item = box(0, 0, 2, 2);
  assert.deepEqual(splitIslands({}, item), [item]);
});

test('partitionRegions — two overlapping shapes give 3 atomic regions', () => {
  const regions = partitionRegions({}, [
    { path: box(0, 0, 4, 4), index: 0 },
    { path: box(2, 0, 6, 4), index: 1 },
  ]);
  const summary = regions.map((r) => [r.members.join('+'), r.top, r.item.area]).sort();
  assert.deepEqual(summary, [['0', 0, 8], ['0+1', 1, 8], ['1', 1, 8]].sort());
  // Regions tile the union without overlap.
  const total = regions.reduce((s, r) => s + r.item.area, 0);
  assert.equal(total, 24);
});

test('partitionRegions — three mutually overlapping shapes give 7 regions', () => {
  const regions = partitionRegions({}, [
    { path: box(0, 0, 4, 4), index: 0 },
    { path: box(2, 0, 6, 4), index: 1 },
    { path: box(1, 2, 5, 6), index: 2 },
  ]);
  assert.equal(regions.length, 7);
  const keys = new Set(regions.map((r) => r.members.join('+')));
  for (const k of ['0', '1', '2', '0+1', '0+2', '1+2', '0+1+2']) assert.ok(keys.has(k), k);
});

test('partitionRegions — disjoint shapes stay separate; empty input → []', () => {
  assert.deepEqual(partitionRegions({}, []), []);
  const r = partitionRegions({}, [{ path: box(0, 0, 1, 1), index: 0 }, { path: box(5, 5, 6, 6), index: 1 }]);
  assert.deepEqual(r.map((x) => x.members), [[0], [1]]);
});

test('planOperation — merge keeps unpainted regions grouped by owner', () => {
  const regions = [{ top: 0 }, { top: 1 }, { top: 1 }, { top: 2 }];
  const { merged, keptBySource } = planOperation(regions, [2, 0], 'merge');
  assert.deepEqual(merged, [0, 2]);
  assert.deepEqual([...keptBySource.entries()], [[1, [1]], [2, [3]]]);
});

test('planOperation — delete produces no merged shape', () => {
  const { merged, keptBySource } = planOperation([{ top: 0 }, { top: 1 }], [1], 'delete');
  assert.equal(merged, null);
  assert.deepEqual([...keptBySource.entries()], [[0, [0]]]);
});

test('sampleSegment — evenly samples long drags, first point alone', () => {
  assert.deepEqual(sampleSegment(null, { x: 1, y: 1 }), [{ x: 1, y: 1 }]);
  const pts = sampleSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, 2);
  assert.equal(pts.length, 5);
  assert.deepEqual(pts.at(-1), { x: 10, y: 0 });
});

test('cleanItem — removes sliver children from compound paths', () => {
  const removed = [];
  const mk = (area) => ({ area, remove() { removed.push(area); } });
  const item = { className: 'CompoundPath', children: [mk(100), mk(0.01), mk(50)] };
  cleanItem(item);
  assert.deepEqual(removed, [0.01]);
  const simple = { className: 'Path', area: 1 };
  assert.equal(cleanItem(simple), simple);
});

test('cursor: Selection arrow + badge SVGs, Selection hotspot, ≤32px', async () => {
  const { readFile } = await import('node:fs/promises');
  const { CURSOR_HOTSPOT, CURSOR_PLUS, CURSOR_MINUS, ALT_CLASS } = await import('../js/visteras-shape-builder.js');
  assert.deepEqual(CURSOR_HOTSPOT, [4, 4]);
  assert.equal(typeof ALT_CLASS, 'string');
  const theme = await readFile(new URL('../css/visteras-theme.css', import.meta.url), 'utf8');
  assert.ok(/#workarea \{\s*cursor: url\("data:image\/svg\+xml,[^"]*M4 4 L21 12 L12 12 L12 21 Z[^"]*"\) 4 4,/.test(theme), 'Selection cursor geometry/hotspot changed');
  for (const [file, badge] of [[CURSOR_PLUS, 'M16 18.5 H21 M18.5 16 V21'], [CURSOR_MINUS, 'M16 18.5 H21"']]) {
    const svg = await readFile(new URL('../' + file.replace(/^\.\//, ''), import.meta.url), 'utf8');
    const w = Number(svg.match(/width="(\d+)"/)[1]);
    const h = Number(svg.match(/height="(\d+)"/)[1]);
    assert.ok(w <= 32 && h <= 32);
    assert.ok(svg.includes('d="M4 4 L21 12 L12 12 L12 21 Z"'));
    assert.ok(svg.includes(badge), file);
  }
});
