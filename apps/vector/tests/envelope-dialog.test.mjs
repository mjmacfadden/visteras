import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tree, canvas, serialize } from './helpers/envelope-dom.mjs';
import { makeEnvelope, updateEnvelope, revertPreviewEnvelope, restoreEnvelopeAttrs } from '../js/visteras-envelope-model.js?v=envelope-11';
import { readEnvelope } from '../js/visteras-envelope-core.js?v=envelope-11';
import { DEFAULT_WARP, getSessionWarp, setSessionWarp, resetSession, clampPercent, styleIcon, getSessionOpts, placeBeside } from '../js/visteras-envelope-dialogs.js?v=envelope-11';
import { buildOutput, rasterize } from '../js/visteras-envelope-render.js?v=envelope-11';
import { drawMesh, buildMesh } from '../js/visteras-envelope-raster.js?v=envelope-11';
import { STYLES } from '../js/visteras-envelope-core.js?v=envelope-11';

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

test('AT5 Make preview is live, and Cancel leaves the document byte-identical with no undo entry', () => {
  const a = tree('rect', { id: 'a', x: '0', y: '0', width: '10', height: '10' }), b = tree('path', { id: 'b', d: 'M0 0L5 5' });
  const root = tree('g', { class: 'layer' }, [a, b]), sc = canvas([a, b]), before = serialize(root);
  const g = makeEnvelope(sc, [a, b], { style: 'flag', bend: 30 }, {}, { history: false });
  assert.notEqual(serialize(root), before, 'preview shows an envelope');
  updateEnvelope(sc, g, { params: { bend: 80 } }, { history: false });
  assert.equal(readEnvelope(g).params.bend, 80);
  assert.equal(sc.log.length, 0, 'preview never records history');
  revertPreviewEnvelope(g);
  assert.equal(serialize(root), before); assert.equal(sc.log.length, 0);
});

test('AT5 Reset preview restores the original params and output verbatim on Cancel', () => {
  const a = tree('rect', { id: 'a', width: '10' }), root = tree('g', {}, [a]), sc = canvas([a]);
  const g = makeEnvelope(sc, [a]); const log = sc.log.length, before = serialize(root);
  const snap = updateEnvelope(sc, g, { params: { style: 'twist', bend: -40 } }, { history: false });
  updateEnvelope(sc, g, { params: { bend: 10 } }, { history: false });
  assert.equal(sc.log.length, log);
  restoreEnvelopeAttrs(sc, g, snap);
  assert.equal(serialize(root), before); assert.equal(sc.log.length, log);
});

test('Reset / control-bar change is exactly one undo step and redo restores', () => {
  const a = tree('rect', { id: 'a', width: '10' }), root = tree('g', {}, [a]), sc = canvas([a]);
  const g = makeEnvelope(sc, [a]);
  updateEnvelope(sc, g, { params: { style: 'bulge' } }, { label: 'Reset with Warp' });
  assert.equal(sc.log.length, 2); assert.equal(sc.log[1].text, 'Reset with Warp');
  sc.undo(); assert.equal(readEnvelope(g).params.style, 'arc');
  sc.redo(); assert.equal(readEnvelope(g).params.style, 'bulge');
  assert.ok(root.children.includes(g));
});

test('Warp Options defaults and session memory (memory only, normalised)', () => {
  resetSession();
  assert.deepEqual(getSessionWarp(), { style: 'arc', dir: 'h', bend: 50, dh: 0, dv: 0 });
  assert.deepEqual({ ...DEFAULT_WARP }, getSessionWarp());
  setSessionWarp({ style: 'flag', bend: 250, dv: -30 });
  assert.deepEqual(getSessionWarp(), { style: 'flag', dir: 'h', bend: 100, dh: 0, dv: -30 });
  assert.equal(getSessionOpts().fidelity, 50);
  resetSession();
  const src = read('../js/visteras-envelope-dialogs.js');
  assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB|document\.cookie/);
});

test('number fields clamp to −100…100 and ignore garbage', () => {
  assert.equal(clampPercent('150'), 100); assert.equal(clampPercent('-180'), -100);
  assert.equal(clampPercent('42%'), 42); assert.equal(clampPercent('abc', -100, 100, 7), 7);
  assert.equal(clampPercent('', -100, 100, 5), 5); assert.equal(clampPercent('12.6'), 13);
});

test('every style has an inline icon drawn from the warp (no fixed colours)', () => {
  for (const s of STYLES) { const svg = styleIcon(s); assert.match(svg, /^<svg[^>]+aria-hidden="true"/); assert.match(svg, /stroke="currentColor"/); assert.doesNotMatch(svg, /NaN/); }
  assert.notEqual(styleIcon('arc'), styleIcon('flag'));
});

test('dialog wiring: title, controls, Preview on at every open (not remembered), undo blocked, rAF preview, one-step commit', () => {
  const src = read('../js/visteras-envelope-dialogs.js');
  assert.match(src, /Warp Options/);
  for (const id of ['vwarp_style', 'vwarp_preview', 'vwarp_ok', 'vwarp_cancel']) assert.match(src, new RegExp(`id="${id}"`));
  assert.match(src, /pctRow\('vwarp_bend', 'Bend', state\.bend\)/); assert.match(src, /pctRow\('vwarp_dh', 'Horizontal'/); assert.match(src, /pctRow\('vwarp_dv', 'Vertical'/);
  assert.match(src, /min="-100" max="100"/);
  assert.match(src, /name="vwarp_dir" value="h"> Horizontal/); assert.match(src, /name="vwarp_dir" value="v"> Vertical/);
  assert.match(src, /preview\.checked = true; renderPreview\(\);/, 'Preview is ticked and rendered on open');
  assert.doesNotMatch(src, /preview[^\n]*(localStorage|sessionStorage|setSession)/i, 'Preview state is never stored');
  assert.doesNotMatch(src, /preview:\s*preview\.checked/, 'Preview is not part of session memory');
  assert.match(src, /requestAnimationFrame\(renderPreview\)/);
  assert.match(src, /\/\^\[zy\]\$\/i\.test\(e\.key\)/);
  assert.match(src, /history: false/);
  assert.match(src, /label: 'Reset with Warp'/);
  const env = read('../js/visteras-envelope.js');
  assert.match(env, /openWarpOptions\(sc, \{ envelope: sel\[0\] \}\)/);
  assert.match(env, /Expand the symbol first/);
  assert.match(env, /id="sec_envelope"|sec\.id = 'sec_envelope'/);
  assert.match(env, /label: 'Envelope Warp'/);
  const html = read('../index.html');
  assert.match(html, /visteras-envelope\.js\?v=envelope-11/);
});

test('AT14 image envelope: Clipping Mask → clipPath, Transparency → alpha (injected fake canvas)', async () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'imageSmoothingEnabled' ? undefined : (...args) => calls.push([k, ...args])), set: (_t, k, v) => { calls.push(['set', k, v]); return true; } });
  const fakeCanvasEl = { width: 0, height: 0, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,FAKE' };
  const io = { loadImage: async () => ({ naturalWidth: 40, naturalHeight: 20 }), createCanvas: () => fakeCanvasEl };
  const img = tree('image', { id: 'i', x: '0', y: '0', width: '40', height: '20', href: 'data:x' });
  const make = (preserve, aa) => {
    const root = tree('g', {}, [img.cloneNode(true)]), el = root.children[0], sc = canvas([el]);
    return { g: makeEnvelope(sc, [el], { style: 'arch', bend: 60 }, { preserve, aa }), el };
  };
  for (const [preserve, aa] of [['clip', true], ['alpha', false]]) {
    calls.length = 0;
    const { g, el } = make(preserve, aa);
    const data = readEnvelope(g);
    const r = await rasterize(el, [1, 0, 0, 1, 0, 0], data, { createElement: () => { throw Error('real canvas used'); } }, io);
    assert.equal(r.href, 'data:image/png;base64,FAKE');
    assert.ok(calls.some((c) => c[0] === 'set' && c[1] === 'imageSmoothingEnabled' && c[2] === aa), 'Anti-Alias maps to imageSmoothingEnabled');
    assert.ok(calls.filter((c) => c[0] === 'drawImage').length >= 8 * 8 * 2, 'mesh triangles drawn');
    let n = 0;
    const out = buildOutput(g, { doc: { createElementNS: (_n, t) => tree(t) }, nextId: () => `x${++n}`, outlines: new Map(), rasters: new Map([[el, r]]) }, (s) => s.cloneNode(true));
    const image = out.querySelectorAll('*').find((x) => x.localName === 'image');
    assert.equal(image.getAttribute('preserveAspectRatio'), 'none');
    assert.equal(image.getAttribute('href'), r.href);
    if (preserve === 'clip') {
      assert.match(image.getAttribute('clip-path'), /^url\(#x\d+\)$/);
      assert.ok(out.querySelectorAll('*').some((x) => x.localName === 'clipPath'));
      assert.equal(image.getAttribute('data-visteras-envelope-preserve'), 'clip');
    } else {
      assert.equal(image.getAttribute('clip-path'), null, 'Transparency: no clip, pixels outside stay transparent');
      assert.equal(image.getAttribute('data-visteras-envelope-preserve'), 'alpha');
    }
  }
  // Mesh draws only inside triangles: nothing is painted outside (alpha preserved).
  calls.length = 0;
  drawMesh(ctx, {}, buildMesh(10, 10, [1, 0, 0, 1, 0, 0], [0, 0, 10, 10], { style: 'arc', dir: 'h', bend: 50, dh: 0, dv: 0 }, 2), 1, { antiAlias: false });
  assert.equal(calls.filter((c) => c[0] === 'clip').length, calls.filter((c) => c[0] === 'drawImage').length);
  assert.ok(!calls.some((c) => c[0] === 'fillRect'));
});

test('fix 2: Warp Options opens beside the selection, never over it, and stays inside the window', () => {
  const view = { width: 1400, height: 900 }, box = { w: 380, h: 330 };
  const overlaps = (r, p) => p.x < r.x + r.width && p.x + box.w > r.x && p.y < r.y + r.height && p.y + box.h > r.y;
  const inView = (p) => p.x >= 0 && p.y >= 0 && p.x + box.w <= view.width && p.y + box.h <= view.height;
  for (const r of [{ x: 300, y: 300, width: 400, height: 200 }, { x: 900, y: 100, width: 450, height: 200 }, { x: 100, y: 50, width: 1200, height: 300 }, { x: 0, y: 0, width: 300, height: 850 }]) {
    const p = placeBeside(r, box, view);
    assert.ok(!overlaps(r, p), `covers ${JSON.stringify(r)} at ${JSON.stringify(p)}`); assert.ok(inView(p));
  }
  const right = placeBeside({ x: 300, y: 300, width: 400, height: 200 }, box, view);
  assert.ok(right.x >= 724, 'prefers the right-hand side like Illustrator');
  assert.ok(inView(placeBeside(null, box, view)));
  // Whole window covered: falls back to a corner, still inside the window.
  assert.ok(inView(placeBeside({ x: 0, y: 0, width: 1400, height: 900 }, box, view)));
});

test('fix 2: the modal layer is transparent (canvas never dimmed) and the title bar is the drag handle', () => {
  const src = fs.readFileSync(new URL('../js/visteras-envelope-dialogs.js', import.meta.url), 'utf8');
  assert.match(src, /\.venv_modal\.visteras_modal_overlay\{[^}]*background:transparent/);
  assert.doesNotMatch(src, /rgba\(0,0,0,\.45\)/);
  assert.match(src, /visteras_modal_header\{cursor:move/);
  assert.equal((src.match(/  mountMovable\(overlay, sc, /g) || []).length, 2, 'both envelope dialogs are movable');
  assert.match(src, /range\.oninput = /, 'slider previews on input, not just change');
  assert.match(src, /num\.oninput = /, 'typed numbers preview while typing');
  assert.match(src, /const schedule = \(\) => \{ if \(closed \|\| !preview\.checked\) return;/, 'a late change after Cancel cannot re-create the preview');
});
