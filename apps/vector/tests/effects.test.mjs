import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadModule, fakeEl, fakeCanvas } from './helpers/fake-svg.mjs';
const F = await loadModule('visteras-effects.js');

test('Effects: Illustrator drop shadow defaults and normalization', () => {
  assert.deepEqual(F.FX_DEFAULTS.dropShadow, { enabled: true, mode: 'multiply', opacity: 75, x: 7, y: 7, blur: 5, color: '#000000' });
  const e = F.normalizeEffect('dropShadow', { opacity: 140, x: '3', blur: -2, color: '#abc', mode: 'bogus' });
  assert.deepEqual(e, { enabled: true, mode: 'multiply', opacity: 100, x: 3, y: 7, blur: 0, color: '#aabbcc' });
  assert.deepEqual(F.normalizeEffect('colorAdjust', { brightness: 300, hue: -999 }), { enabled: true, brightness: 100, contrast: 0, saturation: 0, hue: -180 });
  assert.deepEqual(F.parseFx('not json'), {});
  assert.equal(F.serializeFx({}), null);
  const json = F.serializeFx({ dropShadow: { x: 2 }, colorAdjust: { hue: 30 } });
  assert.equal(json, JSON.stringify({ colorAdjust: { enabled: true, brightness: 0, contrast: 0, saturation: 0, hue: 30 }, dropShadow: { enabled: true, mode: 'multiply', opacity: 75, x: 2, y: 7, blur: 5, color: '#000000' } }));
});

test('Effects: filter primitives use only sanitizer-safe SVG 1.1 primitives', () => {
  const fx = F.parseFx({ dropShadow: {}, innerShadow: { mode: 'screen' }, colorAdjust: { brightness: 10, contrast: 20, saturation: -50, hue: 90 }, gaussianBlur: { radius: 4 } });
  const prims = F.buildFilterPrimitives(fx);
  const tags = prims.map((p) => p[0]);
  assert.deepEqual(tags, ['feColorMatrix', 'feColorMatrix', 'feColorMatrix', 'feGaussianBlur', 'feFlood', 'feComposite', 'feOffset', 'feGaussianBlur', 'feComposite', 'feBlend', 'feGaussianBlur', 'feOffset', 'feFlood', 'feComposite', 'feMerge']);
  assert.ok(!JSON.stringify(prims).includes('feDropShadow'), 'no feDropShadow (not in the SVG-Edit whitelist)');
  assert.equal(prims[0][1].values, '1.2 0 0 0 0 0 1.2 0 0 0 0 0 1.2 0 0 0 0 0 1 0');
  assert.equal(prims[1][1].values, '0.5');
  assert.equal(prims[2][1].values, '90');
  assert.equal(prims[9][1].mode, 'screen');
  const merge = prims.at(-1);
  assert.deepEqual(merge[2].map((n) => n[1].in), ['vfxDs', 'vfxInner'], 'shadow under the object');
  // disabled effects are skipped; no-op colour adjust adds nothing
  assert.equal(F.buildFilterPrimitives(F.parseFx({ dropShadow: { enabled: false }, colorAdjust: {} })).length, 0);
  assert.equal(F.brightnessContrastMatrix(0, 0), '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0');
});

test('Effects: user-space filter region pads for offsets and blur', () => {
  const fx = F.parseFx({ dropShadow: { x: 10, y: -20, blur: 8 } });
  const region = F.filterRegion(fx, { x: 0, y: 0, width: 100, height: 0 });
  assert.equal(region.filterUnits, 'userSpaceOnUse');
  assert.equal(F.filterPadding(fx), 36);
  assert.deepEqual([region.x, region.y, region.width, region.height], [-36, -36, 172, 72]);
});

test('Effects: apply / toggle / remove are undoable and keep the filter reference right', () => {
  const a = fakeEl('rect', { id: 'r1' }), b = fakeEl('g', { id: 'g1', filter: 'url(#g1_blur)' });
  const sc = fakeCanvas([a, b]);
  F.applyFx(sc, [a, b], (fx) => ({ ...fx, dropShadow: { x: 3 } }), 'Add Drop Shadow');
  assert.equal(a.getAttribute('filter'), 'url(#vfx_r1)');
  assert.equal(b.getAttribute('filter'), 'url(#vfx_g1)');
  assert.equal(F.parseFx(a.getAttribute('data-visteras-fx')).dropShadow.x, 3);
  assert.equal(sc.log.length, 1);
  assert.equal(sc.log[0].stack.length, 2);
  // toggle off → filter reference removed, data kept (re-selecting shows the values)
  F.applyFx(sc, [a], (fx) => ({ ...fx, dropShadow: { ...fx.dropShadow, enabled: false } }));
  assert.equal(a.getAttribute('filter'), null);
  assert.equal(F.parseFx(a.getAttribute('data-visteras-fx')).dropShadow.enabled, false);
  sc.undo();
  assert.equal(a.getAttribute('filter'), 'url(#vfx_r1)');
  // remove → no data, no filter
  F.applyFx(sc, [a], (fx) => { const n = { ...fx }; delete n.dropShadow; return n; });
  assert.equal(a.getAttribute('data-visteras-fx'), null);
  assert.equal(a.getAttribute('filter'), null);
  sc.undo();
  assert.equal(a.getAttribute('filter'), 'url(#vfx_r1)');
  // unchanged → no history entry
  const n = sc.log.length;
  F.applyFx(sc, [a], (fx) => fx);
  assert.equal(sc.log.length, n);
  assert.equal(F.referencedFilterId(fakeEl('rect', { filter: 'url("#x_blur")' })), 'x_blur');
});

test('Effects: wired as an Appearance-area section with the fx menu', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<div class="prop_section" id="sec_effects"/);
  for (const t of ['dropShadow', 'innerShadow', 'colorAdjust', 'gaussianBlur']) assert.match(html, new RegExp(`<option value="${t}">`));
  assert.match(html, /mountEffects\(svgEditor\);/);
  const src = fs.readFileSync(new URL('../js/visteras-effects.js', import.meta.url), 'utf8');
  assert.match(src, /if \(!keep\.has\(f\.id\)\) f\.remove\(\);/, 'orphan vfx_ filters are swept');
});
