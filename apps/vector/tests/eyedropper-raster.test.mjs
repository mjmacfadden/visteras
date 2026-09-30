/**
 * Tests for visteras-eyedropper-raster.js (Eyedropper pixel sampling).
 * Image decoding/canvas are faked; the real decode path is checked in
 * headless Chromium (see ~/agent-tools/vector-various-PR.md).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  parsePreserveAspectRatio, mapUserToImagePixel, clientToImagePixel, invertMatrix, applyMatrix,
  rgbaToHex, needsCrossOrigin, createImageSampler, sampleImageElementAt, sampleWithFallback,
  taintError, isTaintError, TAINT_TOAST,
} = await import('../js/visteras-eyedropper-raster.js');
const { solidPaintAt, applyStyleToElements } = await import('../js/visteras-eyedropper.js');

// ─── preserveAspectRatio mapping ─────────────────────────────────────────────
test('parsePreserveAspectRatio — defaults, defer, none, slice', () => {
  assert.deepEqual(parsePreserveAspectRatio(null), { align: 'xMidYMid', slice: false });
  assert.deepEqual(parsePreserveAspectRatio('defer xMinYMax slice'), { align: 'xMinYMax', slice: true });
  assert.deepEqual(parsePreserveAspectRatio('none slice'), { align: 'none', slice: false });
  assert.deepEqual(parsePreserveAspectRatio('bogus'), { align: 'xMidYMid', slice: false });
});

// A 100×50 bitmap placed into a 200×200 box at (10, 20).
const G = { x: 10, y: 20, width: 200, height: 200 };
const N = { width: 100, height: 50 };

test('mapUserToImagePixel — none stretches both axes', () => {
  assert.deepEqual(mapUserToImagePixel(10, 20, G, N, 'none'), { px: 0, py: 0 });
  assert.deepEqual(mapUserToImagePixel(110, 120, G, N, 'none'), { px: 50, py: 25 });
  assert.deepEqual(mapUserToImagePixel(209.9, 219.9, G, N, 'none'), { px: 99, py: 49 });
  assert.equal(mapUserToImagePixel(210, 120, G, N, 'none'), null, 'right edge is outside');
  assert.equal(mapUserToImagePixel(5, 120, G, N, 'none'), null);
});

test('mapUserToImagePixel — meet: scale 2, letterbox bars miss', () => {
  // xMidYMid meet: drawn 200×100, centred vertically → y 70..170
  assert.deepEqual(mapUserToImagePixel(10, 70, G, N, 'xMidYMid meet'), { px: 0, py: 0 });
  assert.deepEqual(mapUserToImagePixel(209, 169, G, N, 'xMidYMid meet'), { px: 99, py: 49 });
  assert.equal(mapUserToImagePixel(100, 60, G, N, 'xMidYMid meet'), null, 'top bar');
  assert.equal(mapUserToImagePixel(100, 175, G, N, 'xMidYMid meet'), null, 'bottom bar');
  // xMinYMin: drawn at the top, y 20..120
  assert.deepEqual(mapUserToImagePixel(10, 20, G, N, 'xMinYMin meet'), { px: 0, py: 0 });
  assert.equal(mapUserToImagePixel(10, 125, G, N, 'xMinYMin'), null);
  // xMaxYMax: drawn at the bottom, y 120..220
  assert.deepEqual(mapUserToImagePixel(10, 120, G, N, 'xMaxYMax meet'), { px: 0, py: 0 });
  assert.equal(mapUserToImagePixel(10, 110, G, N, 'xMaxYMax meet'), null);
});

test('mapUserToImagePixel — slice: scale 4, cropped to the viewport', () => {
  // xMidYMid slice: drawn 400×200 centred horizontally → x from -90
  assert.deepEqual(mapUserToImagePixel(10, 20, G, N, 'xMidYMid slice'), { px: 25, py: 0 });
  assert.deepEqual(mapUserToImagePixel(110, 120, G, N, 'xMidYMid slice'), { px: 50, py: 25 });
  // xMinYMin slice: left part of the bitmap
  assert.deepEqual(mapUserToImagePixel(209, 219, G, N, 'xMinYMin slice'), { px: 49, py: 49 });
  // xMaxYMin slice: right part
  assert.deepEqual(mapUserToImagePixel(10, 20, G, N, 'xMaxYMin slice'), { px: 50, py: 0 });
  // Outside the viewport never hits, even though the slice overflows it.
  assert.equal(mapUserToImagePixel(0, 20, G, N, 'xMidYMid slice'), null);
});

test('mapUserToImagePixel — missing width/height uses the natural size', () => {
  assert.deepEqual(mapUserToImagePixel(3, 4, { x: 0, y: 0 }, N, null), { px: 3, py: 4 });
});

// ─── Transformed image (screen CTM) ──────────────────────────────────────────
function mul(m, n) {
  return {
    a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e, f: m.b * n.e + m.d * n.f + m.f,
  };
}
const T = (x, y) => ({ a: 1, b: 0, c: 0, d: 1, e: x, f: y });
const R = (deg) => { const r = (deg * Math.PI) / 180; return { a: Math.cos(r), b: Math.sin(r), c: -Math.sin(r), d: Math.cos(r), e: 0, f: 0 }; };
const S = (sx, sy = sx) => ({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });

test('invertMatrix / applyMatrix round-trip', () => {
  const m = mul(T(40, -7), mul(R(33), S(1.5, 0.75)));
  const p = applyMatrix(m, 12, 34);
  const q = applyMatrix(invertMatrix(m), p.x, p.y);
  assert.ok(Math.abs(q.x - 12) < 1e-9 && Math.abs(q.y - 34) < 1e-9);
  assert.equal(invertMatrix(S(0)), null);
});

test('clientToImagePixel — rotated 30°, scaled 1.25× (zoom), translated image', () => {
  // screen = pan · zoom · rotate(30 about image centre)
  const ctm = mul(T(300, 150), mul(S(1.25), mul(T(110, 120), mul(R(30), T(-110, -120)))));
  const geom = { x: 10, y: 20, width: 200, height: 200 };
  const nat = { width: 100, height: 100 };
  for (const [ux, uy, px, py] of [[15, 25, 2, 2], [205, 25, 97, 2], [15, 215, 2, 97], [110.5, 120.5, 50, 50]]) {
    const c = applyMatrix(ctm, ux, uy);
    assert.deepEqual(clientToImagePixel(c.x, c.y, ctm, geom, nat, 'none'), { px, py }, `user ${ux},${uy}`);
  }
  // A screen point just outside the rotated box misses.
  const out = applyMatrix(ctm, 5, 120);
  assert.equal(clientToImagePixel(out.x, out.y, ctm, geom, nat, 'none'), null);
});

// ─── Colour ──────────────────────────────────────────────────────────────────
test('rgbaToHex — opaque, transparent (null) and partial alpha over white', () => {
  assert.equal(rgbaToHex(255, 0, 16, 255), '#ff0010');
  assert.equal(rgbaToHex(255, 0, 0, 0), null);
  assert.equal(rgbaToHex(255, 0, 0, 128), '#ff7f7f');
});

test('needsCrossOrigin — only cross-origin http(s)', () => {
  const o = 'http://127.0.0.1:5180';
  assert.equal(needsCrossOrigin('data:image/png;base64,AAA', o), false);
  assert.equal(needsCrossOrigin('blob:http://127.0.0.1:5180/abc', o), false);
  assert.equal(needsCrossOrigin('http://127.0.0.1:5180/a.png', o), false);
  assert.equal(needsCrossOrigin('https://example.com/a.png', o), true);
});

// ─── Fake image/canvas ───────────────────────────────────────────────────────
const RED = [255, 0, 0, 255], GREEN = [0, 255, 0, 255], BLUE = [0, 0, 255, 255], CLEAR = [0, 0, 0, 0];
/** 2×2-quadrant bitmap: TL red, TR green, BL blue, BR transparent. */
const quadrants = (w, h) => (x, y) => (y < h / 2 ? (x < w / 2 ? RED : GREEN) : (x < w / 2 ? BLUE : CLEAR));

function fakeEnv({ w = 40, h = 20, taint = () => false, fail = () => false } = {}) {
  const loads = [];
  const createImage = () => {
    const img = { naturalWidth: 0, naturalHeight: 0, crossOrigin: null };
    Object.defineProperty(img, 'src', {
      set(v) {
        loads.push({ src: v, crossOrigin: img.crossOrigin });
        queueMicrotask(() => {
          if (fail(v, img.crossOrigin)) { img.onerror?.(); return; }
          img.naturalWidth = w; img.naturalHeight = h; img._src = v; img._taint = taint(v, img.crossOrigin);
          img.onload?.();
        });
      },
    });
    return img;
  };
  const createCanvas = (cw, ch) => {
    let drawn = null;
    const ctx = {
      drawImage(img) { drawn = img; },
      getImageData(x, y) {
        if (drawn?._taint) { const e = new Error('tainted'); e.name = 'SecurityError'; throw e; }
        return { data: quadrants(cw, ch)(x, y) };
      },
    };
    return { width: cw, height: ch, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,FAKE' };
  };
  return { loads, sampler: createImageSampler({ createImage, createCanvas, baseURI: 'http://127.0.0.1:5180/vector/', origin: 'http://127.0.0.1:5180' }) };
}

function fakeImageEl(href, attrs = {}, ctm = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) {
  const a = { href, x: '0', y: '0', width: '40', height: '20', ...attrs };
  return { nodeName: 'image', getAttribute: (n) => a[n] ?? null, getScreenCTM: () => ctm };
}

const DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANBQEBE+ZT2wAAAABJRU5ErkJggg==';

test('data: URL image — point sample per quadrant, cached per href, no crossOrigin', async () => {
  const { loads, sampler } = fakeEnv();
  const el = fakeImageEl(DATA_URL);
  assert.equal((await sampleImageElementAt(el, 5, 5, sampler)).hex, '#ff0000');
  assert.equal((await sampleImageElementAt(el, 35, 5, sampler)).hex, '#00ff00');
  assert.equal((await sampleImageElementAt(el, 5, 15, sampler)).hex, '#0000ff');
  const clear = await sampleImageElementAt(el, 35, 15, sampler);
  assert.equal(clear.hex, null, 'alpha 0 → null (no-op)');
  assert.equal(await sampleImageElementAt(el, 50, 5, sampler), null, 'outside the image');
  assert.equal(loads.length, 1, 'decoded once, then served from the per-href cache');
  assert.equal(loads[0].crossOrigin, null);
  assert.equal(sampler.has(DATA_URL), true);
});

test('transformed image — rotate(90) scale(2) maps to the right quadrant', async () => {
  const { sampler } = fakeEnv();
  const ctm = mul(T(100, 0), mul(R(90), S(2))); // user (x,y) → screen (100-2y, 2x)
  const el = fakeImageEl(DATA_URL, {}, ctm);
  const at = async (ux, uy) => { const c = applyMatrix(ctm, ux, uy); return (await sampleImageElementAt(el, c.x, c.y, sampler)).hex; };
  assert.equal(await at(5, 5), '#ff0000');
  assert.equal(await at(35, 5), '#00ff00');
  assert.equal(await at(5, 15), '#0000ff');
});

test('blob: loads without crossOrigin; cross-origin http uses anonymous, retries without CORS', async () => {
  const { loads, sampler } = fakeEnv({ fail: (src, co) => src.startsWith('https://') && co === 'anonymous' });
  await sampler.load('blob:http://127.0.0.1:5180/1234');
  assert.equal(loads.at(-1).crossOrigin, null);
  await sampler.load('https://example.com/a.png');
  assert.deepEqual(loads.slice(-2).map((l) => l.crossOrigin), ['anonymous', null]);
  await sampler.load('img/local.png');
  assert.equal(loads.at(-1).src, 'http://127.0.0.1:5180/vector/img/local.png');
});

// ─── Tainted canvas fallback ─────────────────────────────────────────────────
test('tainted image — sample rejects with a SecurityError-style error', async () => {
  const { sampler } = fakeEnv({ taint: (src) => src.startsWith('https://') });
  const el = fakeImageEl('https://example.com/photo.jpg');
  await assert.rejects(sampleImageElementAt(el, 5, 5, sampler), (err) => isTaintError(err));
  const entry = await sampler.load('https://example.com/photo.jpg');
  assert.equal(entry.tainted, true);
  assert.throws(() => sampler.dataUrl(entry), (err) => isTaintError(err));
});

test('sampleWithFallback — tainted → window.EyeDropper inside the gesture', async () => {
  let opened = 0;
  class EyeDropper { async open() { opened++; return { sRGBHex: '#12AB34' }; } }
  const toasts = [];
  const r = await sampleWithFallback(async () => { throw taintError(); }, { EyeDropper, toast: (m) => toasts.push(m) });
  assert.deepEqual(r, { hex: '#12ab34', via: 'eyedropper' });
  assert.equal(opened, 1);
});

test('sampleWithFallback — tainted, no EyeDropper → friendly toast, no colour', async () => {
  const toasts = [];
  const r = await sampleWithFallback(async () => { throw taintError(); }, { EyeDropper: null, toast: (m) => toasts.push(m) });
  assert.equal(r, null);
  assert.deepEqual(toasts, [TAINT_TOAST]);
});

test('sampleWithFallback — vector paint fallback wins over EyeDropper; Esc in EyeDropper → null', async () => {
  class EyeDropper { async open() { throw new Error('AbortError'); } }
  const viaPaint = await sampleWithFallback(async () => { throw taintError(); }, { fallback: () => '#00aa00', EyeDropper });
  assert.deepEqual(viaPaint, { hex: '#00aa00', via: 'paint' });
  const aborted = await sampleWithFallback(async () => { throw taintError(); }, { EyeDropper, toast: () => {} });
  assert.equal(aborted, null);
});

test('sampleWithFallback — success and transparent pass through; other errors toast', async () => {
  assert.deepEqual(await sampleWithFallback(async () => ({ hex: '#abcdef' })), { hex: '#abcdef', via: 'canvas' });
  assert.deepEqual(await sampleWithFallback(async () => ({ hex: null })), { hex: null, via: 'canvas' });
  const toasts = [];
  assert.equal(await sampleWithFallback(async () => { throw new Error('404'); }, { toast: (m) => toasts.push(m), EyeDropper: null }), null);
  assert.equal(toasts.length, 1);
});

// ─── Vector paint at a point / applying a sample ─────────────────────────────
test('solidPaintAt — stroke beats fill; gradients are not solid', () => {
  const css = (map) => () => ({ getPropertyValue: (p) => map[p] ?? '' });
  const I = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; } };
  const shape = (inStroke, inFill) => ({ nodeName: 'rect', getScreenCTM: () => I, isPointInStroke: () => inStroke, isPointInFill: () => inFill });
  const paint = css({ fill: 'rgb(0, 128, 0)', stroke: '#f00' });
  assert.equal(solidPaintAt(shape(true, true), 1, 1, paint), '#ff0000');
  assert.equal(solidPaintAt(shape(false, true), 1, 1, paint), '#008000');
  assert.equal(solidPaintAt(shape(false, false), 1, 1, paint), null);
  assert.equal(solidPaintAt(shape(false, true), 1, 1, css({ fill: 'url(#g)' })), null);
});

test('applyStyleToElements — pixel sample paints only the active well, one named undo step', () => {
  const attrs = { fill: '#000000', stroke: '#111111' };
  const el = { nodeName: 'rect', getAttribute: (n) => attrs[n] ?? null, setAttribute: (n, v) => { attrs[n] = String(v); }, removeAttribute: (n) => { delete attrs[n]; } };
  const cmds = [];
  class ChangeElementCommand { constructor(e, before) { this.before = before; } }
  class BatchCommand { constructor(name) { this.name = name; this.sub = []; } addSubCommand(c) { this.sub.push(c); } }
  applyStyleToElements([el], { stroke: '#ff8800' }, { ChangeElementCommand, BatchCommand, undoMgr: { addCommandToHistory: (c) => cmds.push(c) } }, { ignoreOptions: true, name: 'Eyedropper Sample' });
  assert.equal(attrs.stroke, '#ff8800');
  assert.equal(attrs.fill, '#000000');
  assert.equal(cmds.length, 1);
  assert.equal(cmds[0].name, 'Eyedropper Sample');
  assert.deepEqual(cmds[0].sub[0].before, { stroke: '#111111' });
});
