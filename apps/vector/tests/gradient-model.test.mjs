import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './helpers/fake-svg.mjs';
const G = await loadModule('visteras-gradient-model.js');

const close = (a, b, eps = 1e-3, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} ≈ ${b}`);
const closeModel = (m, exp, eps = 1e-3) => { for (const k of ['ox', 'oy', 'angle', 'length', 'aspect']) if (k in exp) close(m[k], exp[k], eps, k); if (exp.type) assert.equal(m.type, exp.type); };
const specOf = (enc) => ({ tag: enc.tag, attrs: Object.fromEntries(Object.entries(enc.attrs).map(([k, v]) => [k, String(v)])), stops: enc.stops.map((s) => ({ offset: String(s.offset), color: s.color, opacity: String(s.opacity), midpoint: s.midpoint == null ? null : String(s.midpoint), synthetic: !!s.synthetic })) });
// Render a model point the way SVG would: bbox.origin + diag(w,h)·gT·p
const userPoint = (enc, bbox, p) => G.apply(G.multiply(G.translate(bbox.x, bbox.y), G.multiply(G.scale(bbox.width, bbox.height), G.parseTransform(enc.attrs.gradientTransform))), p);

test('Gradient model: linear encode/decode round trip on a non-square box', () => {
  const bbox = { x: 10, y: 20, width: 300, height: 100 };
  const m = G.normalizeModel({ type: 'linear', ox: 30, oy: 40, angle: 30, length: 120, stops: [{ o: 0, c: '#ff0000' }, { o: 1, c: '#0000ff', a: 0.5 }] });
  const enc = G.encodeGradient(m, bbox);
  assert.equal(enc.tag, 'linearGradient');
  assert.equal(enc.attrs['data-visteras-gradient'], '1');
  assert.equal(enc.attrs.gradientUnits, undefined, 'objectBoundingBox (default)');
  assert.equal(enc.attrs.gradientTransform, 'scale(0.00333333 0.01) rotate(-30 30 40)');
  // θ is exact in user space (not skewed by the 3:1 box)
  const p1 = userPoint(enc, bbox, { x: +enc.attrs.x1, y: +enc.attrs.y1 }), p2 = userPoint(enc, bbox, { x: +enc.attrs.x2, y: +enc.attrs.y2 });
  close(p1.x, 40); close(p1.y, 60);
  close(G.angleOf(p2.x - p1.x, p2.y - p1.y), 30); close(Math.hypot(p2.x - p1.x, p2.y - p1.y), 120);
  closeModel(G.decodeGradient(specOf(enc), bbox), { type: 'linear', ox: 30, oy: 40, angle: 30, length: 120 });
  assert.deepEqual(G.decodeGradient(specOf(enc), bbox).stops.map((s) => [s.o, s.c, s.a]), [[0, '#ff0000', 1], [1, '#0000ff', 0.5]]);
});

test('Gradient model: radial angle + aspect round trip, perpendicular axis', () => {
  const bbox = { x: 0, y: 0, width: 200, height: 50 };
  const m = { type: 'radial', ox: 100, oy: 25, angle: -45, length: 60, aspect: 40, stops: [] };
  const enc = G.encodeGradient(m, bbox);
  assert.equal(enc.tag, 'radialGradient');
  assert.match(enc.attrs.gradientTransform, /rotate\(45 100 25\) translate\(100 25\) scale\(1 0\.4\) translate\(-100 -25\)$/);
  closeModel(G.decodeGradient(specOf(enc), bbox), { type: 'radial', ox: 100, oy: 25, angle: -45, length: 60, aspect: 40 });
  // the minor axis really is perpendicular in user space
  const c = userPoint(enc, bbox, { x: 100, y: 25 }), u = userPoint(enc, bbox, { x: 160, y: 25 }), v = userPoint(enc, bbox, { x: 100, y: 85 });
  close((u.x - c.x) * (v.x - c.x) + (u.y - c.y) * (v.y - c.y), 0, 1e-6, 'dot');
  close(Math.hypot(v.x - c.x, v.y - c.y), 24);
  assert.equal(G.encodeGradient(m, { x: 0, y: 0, width: 100, height: 0 }), null, 'zero-height box: no OBB gradient');
});

test('Gradient model: third-party gradients read the same way (plain OBB, percentages, userSpace)', () => {
  const bbox = { x: 0, y: 0, width: 200, height: 100 };
  closeModel(G.decodeGradient({ tag: 'linearGradient', attrs: {}, stops: [] }, bbox), { ox: 0, oy: 0, angle: 0, length: 200 });
  closeModel(G.decodeGradient({ tag: 'linearGradient', attrs: { x1: '0%', y1: '0%', x2: '0%', y2: '100%' }, stops: [] }, bbox), { angle: -90, length: 100 });
  closeModel(G.decodeGradient({ tag: 'radialGradient', attrs: {}, stops: [] }, bbox), { ox: 100, oy: 50, length: 100, aspect: 50 });
  closeModel(G.decodeGradient({ tag: 'linearGradient', attrs: { gradientUnits: 'userSpaceOnUse', x1: '50', y1: '10', x2: '150', y2: '10' }, stops: [] }, { x: 50, y: 0, width: 100, height: 20 }), { ox: 0, oy: 10, length: 100, angle: 0 });
});

test('Gradient model: rebase after a non-uniform resize stretches proportionally', () => {
  const m = G.defaultModel({ x: 0, y: 0, width: 100, height: 100 }, { angle: 45 });
  const enc = G.encodeGradient(m, { x: 0, y: 0, width: 100, height: 100 });
  // object later resized to 200×100: same gradient element read at the new bbox
  const r = G.decodeGradient(specOf(enc), { x: 0, y: 0, width: 200, height: 100 });
  close(r.angle, G.angleOf(2, -1));
  // writing again (rebase) keeps that effective geometry exactly
  const again = G.decodeGradient(specOf(G.encodeGradient(r, { x: 0, y: 0, width: 200, height: 100 })), { x: 0, y: 0, width: 200, height: 100 });
  closeModel(again, r);
});

test('Gradient model: defaults (linear fits the box at any angle, radial centred)', () => {
  closeModel(G.defaultModel({ width: 200, height: 100 }), { ox: 0, oy: 50, length: 200, angle: 0 });
  closeModel(G.defaultModel({ width: 200, height: 100 }, { angle: 90 }), { ox: 100, oy: 100, length: 100, angle: 90 });
  closeModel(G.defaultModel({ width: 200, height: 100 }, { type: 'radial' }), { ox: 100, oy: 50, length: 100, aspect: 100 });
  assert.deepEqual(G.normalizeStops([]).map((s) => s.c), ['#ffffff', '#000000']);
});

test('Gradient model: midpoints expand to 3 synthetic stops and read back', () => {
  const stops = [{ o: 0, c: '#000000', mid: 25 }, { o: 1, c: '#ffffff' }];
  const ex = G.expandStops(stops);
  assert.equal(ex.length, 5);
  assert.deepEqual(ex.map((s) => !!s.synthetic), [false, true, true, true, false]);
  assert.equal(ex[0].midpoint, 25);
  assert.deepEqual(ex.slice(1, 4).map((s) => s.offset), [0.25, 0.5, 0.75]);
  // f(u) = u^p with f(0.25) = 0.5 → the synthetic stop at u=0.25 is mid-grey
  assert.equal(ex[1].color, '#808080');
  assert.equal(G.colorAt(stops, 0.25).c, '#808080');
  const back = G.readStops(ex);
  assert.deepEqual(back.map((s) => [s.o, s.c, s.mid]), [[0, '#000000', 25], [1, '#ffffff', 50]]);
  assert.equal(G.expandStops([{ o: 0, c: '#000' }, { o: 1, c: '#fff' }]).length, 2, 'm = 50 → no extra stops');
  assert.equal(G.normalizeStops([{ o: 0, mid: 2 }, { o: 1 }])[0].mid, 13, 'midpoint clamps to 13–87');
});

test('Gradient model: reverse, add (interpolated), delete (min 2), swap, duplicate, move', () => {
  const s = [{ o: 0, c: '#ff0000', mid: 30 }, { o: 0.4, c: '#00ff00' }, { o: 1, c: '#0000ff', a: 0.2 }];
  const r = G.reverseStops(s);
  assert.deepEqual(r.map((x) => [x.o, x.c, x.mid]), [[0, '#0000ff', 50], [0.6, '#00ff00', 70], [1, '#ff0000', 50]]);
  const add = G.addStop([{ o: 0, c: '#000000' }, { o: 1, c: '#ffffff' }], 0.5);
  assert.equal(add.index, 1); assert.equal(add.stops[1].c, '#808080');
  assert.equal(G.deleteStop(add.stops, 1).length, 2);
  assert.equal(G.deleteStop(G.deleteStop(add.stops, 1), 0).length, 2, 'never below 2 stops');
  const sw = G.swapStops(s, 0, 2);
  assert.deepEqual(sw.map((x) => [x.o, x.c, x.a]), [[0, '#0000ff', 0.2], [0.4, '#00ff00', 1], [1, '#ff0000', 1]]);
  const dup = G.duplicateStop(s, 0, 0.7);
  assert.equal(dup.stops.length, 4); assert.equal(dup.stops[dup.index].c, '#ff0000'); assert.equal(dup.stops[dup.index].o, 0.7);
  const mv = G.moveStop(s, 0, 0.9);
  assert.equal(mv.index, 1); assert.equal(mv.stops[1].c, '#ff0000');
});

test('Gradient model: 45° snapping and angle normalisation', () => {
  assert.equal(G.snapAngle(37), 45); assert.equal(G.snapAngle(-100), -90); assert.equal(G.snapAngle(170), 180); assert.equal(G.snapAngle(-170), 180);
  assert.equal(G.normalizeAngle(270), -90); assert.equal(G.normalizeAngle(-180), 180);
  assert.equal(G.angleOf(1, -1), 45, 'Illustrator angles are CCW (SVG y-down)');
});

test('Gradient model: one document vector across objects (incl. rotation) → per-object models', () => {
  const docModel = { type: 'linear', ox: 0, oy: 50, angle: 0, length: 400, stops: [] };
  // object A at x 0..100 (no transform); object B at x 300..400 rotated 90° about its centre
  const a = G.modelFromDocument(docModel, G.IDENTITY, { x: 0, y: 0, width: 100, height: 100 });
  closeModel(a, { ox: 0, oy: 50, angle: 0, length: 400 });
  const rot = G.rotate(90, 350, 50);
  const b = G.modelFromDocument(docModel, rot, { x: 300, y: 0, width: 100, height: 100 });
  // in B's local frame the document +x axis points along local −y (θ = 90°) and the origin is far away
  close(b.angle, 90); close(b.length, 400);
  const back = G.modelToDocument(b, rot, { x: 300, y: 0, width: 100, height: 100 });
  closeModel(back, docModel);
});

test('Gradient model: H/V flip mirroring', () => {
  const bbox = { width: 200, height: 100 };
  const m = { type: 'linear', ox: 20, oy: 30, angle: 30, length: 100, stops: [] };
  closeModel(G.flipModel(m, bbox, 'h'), { ox: 180, oy: 30, angle: 150, length: 100 });
  closeModel(G.flipModel(m, bbox, 'v'), { ox: 20, oy: 70, angle: -30, length: 100 });
  const rad = { type: 'radial', ox: 50, oy: 50, angle: 20, length: 40, aspect: 50, stops: [] };
  closeModel(G.flipModel(rad, bbox, 'h'), { ox: 150, angle: 160, length: 40, aspect: 50 });
});

test('Gradient model: CSS preview and swatch schema', () => {
  assert.equal(G.cssGradient({ stops: [{ o: 0, c: '#ffffff' }, { o: 1, c: '#000000', a: 0.5 }] }), 'linear-gradient(90deg, rgba(255, 255, 255, 1) 0%, rgba(0, 0, 0, 0.5) 100%)');
  assert.match(G.cssGradient({ type: 'radial', stops: [] }), /^radial-gradient\(circle, /);
  assert.equal(G.GRADIENT_PRESETS.length, 6);
  const list = G.parseSwatchList(JSON.stringify([{ name: 'X', type: 'radial', aspect: 50, stops: [{ o: 0, c: '#f00' }, { o: 1, c: 'blue' }] }, 7, null]));
  assert.equal(list.length, 1); assert.equal(list[0].stops[0].c, '#ff0000'); assert.equal(list[0].type, 'radial');
  assert.deepEqual(G.parseSwatchList('{bad'), []);
  assert.equal(G.GRADIENT_SWATCHES_KEY, 'visteras-vector-gradient-swatches');
});
