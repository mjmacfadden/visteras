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
  assert.match(html, /<button type="button" id="vfx_add" class="vfx_fx_btn" aria-haspopup="menu"/, 'fx button opens a menu mirroring Effect');
  assert.match(html, /mountEffects\(svgEditor\);/);
  const src = fs.readFileSync(new URL('../js/visteras-effects.js', import.meta.url), 'utf8');
  assert.match(src, /if \(!keep\.has\(f\.id\)\) f\.remove\(\);/, 'orphan vfx_ filters are swept');
});

test('Effects: visualBounds includes drop shadow offset + blur and gaussian blur', () => {
  const box = { x: 10, y: 20, width: 100, height: 50 };
  assert.deepEqual(F.visualBounds({}, box), box, 'no effects → unchanged');
  // drop shadow 7,7 blur 5 → spread 7.5 on the shadow copy
  const ds = F.parseFx({ dropShadow: {} });
  assert.deepEqual(F.visualBounds(ds, box), { x: 9.5, y: 19.5, width: 115, height: 65 });
  const neg = F.parseFx({ dropShadow: { x: -20, y: 0, blur: 0 } });
  assert.deepEqual(F.visualBounds(neg, box), { x: -10, y: 20, width: 120, height: 50 });
  assert.deepEqual(F.visualBounds(F.parseFx({ gaussianBlur: { radius: 4 } }), box), { x: 4, y: 14, width: 112, height: 62 });
  assert.deepEqual(F.visualBounds(F.parseFx({ innerShadow: { x: 50, y: 50, blur: 30 } }), box), box, 'inner shadow stays inside');
  assert.deepEqual(F.visualBounds(F.parseFx({ dropShadow: { enabled: false, x: 99 } }), box), box, 'hidden effects ignored');
});

test('Effects: getVisualBounds unions the stroked bbox with effect extents', () => {
  const el = fakeEl('rect', { id: 'r', stroke: '#000', 'stroke-width': '4', 'data-visteras-fx': JSON.stringify({ dropShadow: { x: 10, y: 10, blur: 0 } }) });
  el.getBBox = () => ({ x: 0, y: 0, width: 100, height: 100 });
  // no screen CTM in the fake → local space; stroke adds 2 on each side
  assert.deepEqual(F.getVisualBounds(el), { x: -2, y: -2, width: 114, height: 114 });
  const sc = { getStrokedBBox: () => ({ x: -2, y: -2, width: 104, height: 104 }) };
  assert.deepEqual(F.getVisualBounds(el, sc), { x: -2, y: -2, width: 114, height: 114 });
  const plain = fakeEl('rect', { id: 'p' });
  assert.deepEqual(F.getVisualBounds(plain, sc), { x: -2, y: -2, width: 104, height: 104 }, 'no effects → stroked bbox');
  assert.equal(F.strokeOutset(fakeEl('rect', { stroke: 'none', 'stroke-width': '9' })), 0);
  const src = fs.readFileSync(new URL('../js/visteras-effects.js', import.meta.url), 'utf8');
  assert.match(src, /getVisualBounds: \(el\) => getVisualBounds\(el, sc\)/, 'exposed on window.__visterasEffects');
});

test('Effect menu: Illustrator structure (Apply Last, Last Effect, raster settings, Illustrator / Photoshop Effects)', () => {
  const html = F.effectMenuHtml();
  const order = ['Apply Last Effect', 'Last Effect…', 'Document Raster Effects Settings…', 'Illustrator Effects', 'Stylize', 'Drop Shadow…', 'SVG Filters', 'Color Adjust…', 'Photoshop Effects', 'Blur', 'Gaussian Blur…'];
  const idx = order.map((t) => html.indexOf(t));
  assert.ok(idx.every((i) => i >= 0), JSON.stringify(idx));
  assert.deepEqual([...idx].sort((a, b) => a - b), idx);
  assert.match(html, /id="action_effect_apply_last"[^>]*><span class="menu_label">Apply Last Effect<\/span><span class="menu_dropdown_shortcut">⇧⌘E<\/span>/);
  assert.match(html, /<span class="menu_dropdown_shortcut">⌥⇧⌘E<\/span>/);
  assert.match(html, /class="menu_dropdown_item disabled"[^>]*id="action_effect_raster_settings"/);
  assert.equal((html.match(/menu_has_submenu/g) || []).length, 3);
  assert.doesNotMatch(html, /Inner Shadow/, 'Inner Shadow is legacy: not offered in menus');
  const pop = F.effectMenuHtml({ prefix: 'vfx_menu_', withLast: false });
  assert.doesNotMatch(pop, /Apply Last|Raster|menu_dropdown_separator/);
  assert.match(pop, /id="vfx_menu_dropShadow"/);
  const idx2 = ['Stylize', 'SVG Filters', 'Blur'].map((t) => pop.indexOf(t));
  assert.deepEqual([...idx2].sort((a, b) => a - b), idx2, 'fx popup mirrors the Effect menu order');
  const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(index.indexOf('id="menu_object"') < index.indexOf('id="menu_effect"') && index.indexOf('id="menu_effect"') < index.indexOf('id="menu_view"'), 'Effect sits between Object and View');
  assert.match(index, /setupMenuBar\(\);\n[^\n]*\n\s*mountMenus\(\);/);
  const src = fs.readFileSync(new URL('../js/visteras-effects.js', import.meta.url), 'utf8');
  assert.match(src, /e\.code !== 'KeyE'/);
  assert.match(src, /if \(e\.altKey\) lastDialog\(\); else applyLast\(\);/);
});

test('Menus: submenu + keyboard module is delegated and keyboard-safe', () => {
  const src = fs.readFileSync(new URL('../js/visteras-menus.js', import.meta.url), 'utf8');
  assert.match(src, /'\.vmenu-root \.menu_has_submenu'/);
  assert.match(src, /const lists = openLists\(doc\);\n\s*if \(!lists\.length\) return;/, 'keys only taken while a menu is open');
  assert.match(src, /flip-left/);
  const css = fs.readFileSync(new URL('../css/visteras-menus.css', import.meta.url), 'utf8');
  assert.match(css, /var\(--vui-menu-item-padding\)/);
  assert.match(css, /--studio-orange, #fa7c1b/);
});
