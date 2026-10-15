import test from 'node:test';
import assert from 'node:assert/strict';
import { STYLES } from '../js/visteras-envelope-core.js?v=envelope-5';
import {
  warpPoint, parsePathData, shapeToPathData, warpTolerance, warpSegments, segmentsToPathData,
  segmentsBounds, countNodes, parseTransform, multiply, applyMatrix, invert, transformSegments,
} from '../js/visteras-envelope-warp.js?v=envelope-5';
import { meshSize, buildMesh, triangleAffine, meshTriangles } from '../js/visteras-envelope-raster.js?v=envelope-5';
import { buildOutput, imageMatrix } from '../js/visteras-envelope-render.js?v=envelope-5';
import { tree, canvas } from './helpers/envelope-dom.mjs';
import { makeEnvelope } from '../js/visteras-envelope-model.js?v=envelope-5';
import { readEnvelope } from '../js/visteras-envelope-core.js?v=envelope-5';

const BOX = [100, 50, 200, 100];
const GRID = [];
for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) GRID.push([BOX[0] + BOX[2] * i / 4, BOX[1] + BOX[3] * j / 4]);
const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

test('AT3 every style is the identity at bend 0 / distortion 0 (within 0.01) in both directions', () => {
  assert.equal(STYLES.length, 15);
  for (const style of STYLES) for (const dir of ['h', 'v']) for (const [x, y] of GRID) {
    const [wx, wy] = warpPoint(x, y, BOX, { style, dir, bend: 0, dh: 0, dv: 0 });
    close(wx, x, 0.01, `${style}/${dir} x`); close(wy, y, 0.01, `${style}/${dir} y`);
  }
});

test('every style moves points at bend 50 and stays finite at ±100', () => {
  for (const style of STYLES) {
    let moved = 0;
    for (const bend of [-100, -50, 50, 100]) for (const dir of ['h', 'v']) for (const [x, y] of GRID) {
      const [wx, wy] = warpPoint(x, y, BOX, { style, dir, bend, dh: 0, dv: 0 });
      assert.ok(Number.isFinite(wx) && Number.isFinite(wy), `${style} ${bend} ${dir}`);
      if (bend === 50 && Math.hypot(wx - x, wy - y) > 0.5) moved++;
    }
    assert.ok(moved > 0, `${style} should deform`);
  }
});

test('arch lifts the top-centre and keeps corners anchored horizontally; vertical swaps axes', () => {
  const [, ty] = warpPoint(200, 50, BOX, { style: 'arch', dir: 'h', bend: 50, dh: 0, dv: 0 });
  assert.ok(ty < 50, 'top centre rises');
  const [cx] = warpPoint(100, 50, BOX, { style: 'arch', dir: 'h', bend: 50, dh: 0, dv: 0 });
  close(cx, 100, 0.01, 'corner x');
  const [vx] = warpPoint(100, 100, BOX, { style: 'arch', dir: 'v', bend: 50, dh: 0, dv: 0 });
  assert.ok(vx < 100, 'vertical arch pushes the left-middle sideways');
});

test('distortion is applied first (horizontal perspective widens one side)', () => {
  const p = { style: 'arc', dir: 'h', bend: 0, dh: 50, dv: 0 };
  const [, l1] = warpPoint(100, 50, BOX, p), [, l2] = warpPoint(100, 150, BOX, p);
  const [, r1] = warpPoint(300, 50, BOX, p), [, r2] = warpPoint(300, 150, BOX, p);
  assert.ok(r2 - r1 > l2 - l1 + 1, 'right edge taller than left edge');
  // Distortion runs before the style: arch with distortion differs from arch alone.
  const a = warpPoint(150, 50, BOX, { style: 'arch', dir: 'h', bend: 50, dh: 0, dv: 0 });
  const ad = warpPoint(150, 50, BOX, { style: 'arch', dir: 'h', bend: 50, dh: 50, dv: 0 });
  assert.notDeepEqual(a, ad);
});

test('zero-size bbox is padded instead of dividing by zero', () => {
  const [x, y] = warpPoint(10, 20, [10, 20, 0, 0], { style: 'twist', dir: 'h', bend: 100, dh: 0, dv: 0 });
  assert.ok(Number.isFinite(x) && Number.isFinite(y));
  const [hx, hy] = warpPoint(10, 20, [0, 20, 100, 0], { style: 'arc', dir: 'h', bend: 50, dh: 0, dv: 0 });
  assert.ok(Number.isFinite(hx) && Number.isFinite(hy));
});

test('path parser normalises every command to M/C/Z cubic segments', () => {
  const segs = parsePathData('M0 0 L10 0 H20 V10 C20 20 10 20 10 10 S0 0 0 5 Q5 5 5 10 T10 15 A5 5 0 0 1 20 15 z m5 5 l1 1');
  assert.ok(segs.every((s) => ['M', 'C', 'Z'].includes(s.type)));
  assert.equal(segs.filter((s) => s.type === 'M').length, 2);
  const b = segmentsBounds(segs); assert.ok(b[2] >= 20 && b[3] >= 15);
  for (const [tag, a] of [['rect', { x: 0, y: 0, width: 10, height: 5, rx: 2 }], ['circle', { cx: 5, cy: 5, r: 5 }], ['ellipse', { cx: 5, cy: 5, rx: 5, ry: 2 }], ['line', { x1: 0, y1: 0, x2: 10, y2: 10 }], ['polyline', { points: '0,0 5,5 10,0' }], ['polygon', { points: '0,0 5,5 10,0' }]]) {
    const d = shapeToPathData(tag, a); assert.ok(d && /^M/.test(d), tag);
  }
  const cb = segmentsBounds(parsePathData(shapeToPathData('circle', { cx: 5, cy: 5, r: 5 })));
  close(cb[0], 0, 0.05, 'circle x'); close(cb[2], 10, 0.1, 'circle w');
});

test('transform parsing composes and inverts', () => {
  const m = multiply(parseTransform('translate(10 20)'), parseTransform('scale(2) rotate(90)'));
  const [x, y] = applyMatrix(m, 1, 0); close(x, 10, 1e-9, 'x'); close(y, 22, 1e-9, 'y');
  const [ix, iy] = applyMatrix(invert(m), x, y); close(ix, 1, 1e-9, 'ix'); close(iy, 0, 1e-9, 'iy');
  const t = transformSegments(parsePathData('M0 0L1 0'), parseTransform('matrix(1 0 0 1 5 5)'));
  close(t[0].x ?? t[0].pts?.[0], 5, 1e-9, 'moved');
});

test('AT10 (math) higher fidelity means a tighter tolerance, more nodes and lower error; depth is bounded', () => {
  const tols = [0, 50, 100].map((f) => warpTolerance(BOX, f));
  assert.ok(tols[0] > tols[1] && tols[1] > tols[2]);
  const segs = parsePathData(shapeToPathData('rect', { x: 100, y: 50, width: 200, height: 100 }));
  const runs = [0, 50, 100].map((fidelity) => warpSegments(segs, BOX, { style: 'arc', dir: 'h', bend: 50, dh: 0, dv: 0 }, { fidelity }));
  for (let i = 1; i < runs.length; i++) {
    assert.ok(countNodes(runs[i].segments) >= countNodes(runs[i - 1].segments));
    assert.ok(runs[i].stats.maxError <= runs[i - 1].stats.maxError + 1e-9);
  }
  for (const [i, r] of runs.entries()) {
    assert.ok(r.stats.maxDepth >= 1 && r.stats.maxDepth <= 10);
    assert.ok(r.stats.maxError <= tols[i] * 1.0001 || r.stats.maxDepth === 10, `fidelity run ${i} within tolerance`);
  }
  assert.match(segmentsToPathData(runs[1].segments), /^M[^A-Za-z]*C/);
});

test('raster mesh: size follows fidelity, triangles tile the grid, affine maps exactly', () => {
  assert.equal(meshSize(0), 8); assert.equal(meshSize(100), 64);
  assert.equal(meshTriangles(4).length, 4 * 4 * 2);
  const a = triangleAffine([0, 0], [10, 0], [0, 10], [5, 5], [25, 5], [5, 25]);
  const map = (p) => [a[0] * p[0] + a[2] * p[1] + a[4], a[1] * p[0] + a[3] * p[1] + a[5]];
  assert.deepEqual(map([10, 0]).map((v) => Math.round(v * 1e6) / 1e6), [25, 5]);
  const id = buildMesh(80, 60, [1, 0, 0, 1, 100, 50], BOX, { style: 'arc', dir: 'h', bend: 0, dh: 0, dv: 0 }, 4);
  close(id.bounds[0], 100, 0.01, 'mesh x'); close(id.bounds[2], 80, 0.01, 'mesh w');
  const im = imageMatrix({ x: 0, y: 0, width: 100, height: 100 }, 50, 25, [1, 0, 0, 1, 0, 0]);
  assert.deepEqual(im, [2, 0, 0, 2, 0, 25]);
});

const fakeEnv = () => {
  let n = 0;
  return { doc: { createElementNS: (_ns, tag) => tree(tag) }, nextId: () => `gen${++n}`, outlines: new Map(), rasters: new Map() };
};

test('render: shapes become warped paths with group transforms baked, strokes scaled; images without a raster stay flagged', () => {
  const r = tree('rect', { id: 'r', x: '100', y: '50', width: '200', height: '100', fill: 'red', stroke: '#000', 'stroke-width': '2' });
  const g = tree('g', { id: 'g', transform: 'scale(2)' }, [tree('circle', { id: 'c', cx: '60', cy: '40', r: '10' })]);
  const img = tree('image', { id: 'i', x: '0', y: '0', width: '10', height: '10', href: 'data:,' });
  const layer = tree('g', { class: 'layer' }, [r, g, img]), sc = canvas([r, g, img]);
  const env = makeEnvelope(sc, [r, g, img], { style: 'arch', bend: 50 });
  const out = buildOutput(env, fakeEnv(), (n) => n.cloneNode(true));
  const all = out.querySelectorAll('*');
  const paths = all.filter((n) => n.localName === 'path');
  assert.equal(paths.length, 2);
  assert.ok(!all.some((n) => ['rect', 'circle'].includes(n.localName)));
  assert.equal(paths[0].getAttribute('fill'), 'red');
  assert.equal(all.find((n) => n.localName === 'g' && !n.getAttribute('transform')) !== undefined, true);
  assert.equal(all.find((n) => n.localName === 'image').getAttribute('data-visteras-envelope-unwarped'), 'image');
  assert.ok(layer.children.includes(env));
});

test('stage 3 lifts the same-layer limit: Make across layers wraps foreign items to keep their placement, undo restores', () => {
  const a = tree('rect', { id: 'a', x: '0', y: '0', width: '10', height: '10' });
  const b = tree('rect', { id: 'b', x: '20', y: '0', width: '10', height: '10' });
  const layer1 = tree('g', { class: 'layer' }, [a]), grp = tree('g', { id: 'grp', transform: 'translate(5 5)' }, [b]);
  const layer2 = tree('g', { class: 'layer' }, [grp]);
  tree('svg', {}, [layer1, layer2]);
  const sc = canvas([a, b]);
  const env = makeEnvelope(sc, [a, b]);
  assert.ok(env, 'envelope created');
  const { src } = readEnvelope(env);
  const flat = src.querySelectorAll('*');
  assert.ok(flat.includes(a) && flat.includes(b));
  assert.equal(sc.log.length, 1);
  sc.undo();
  assert.equal(a.parentNode, layer1); assert.equal(b.parentNode, grp);
});
