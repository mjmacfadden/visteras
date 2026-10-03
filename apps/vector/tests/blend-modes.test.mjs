import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadModule, fakeEl, fakeCanvas } from './helpers/fake-svg.mjs';
const B = await loadModule('visteras-blend-modes.js');

test('Blend modes: Illustrator list and order, CSS values', () => {
  assert.deepEqual(B.BLEND_MODES.map((m) => m.label), ['Normal', 'Darken', 'Multiply', 'Color Burn', 'Lighten', 'Screen', 'Color Dodge', 'Overlay', 'Soft Light', 'Hard Light', 'Difference', 'Exclusion', 'Hue', 'Saturation', 'Color', 'Luminosity']);
  assert.equal(B.normalizeBlendMode('Color-Burn'), 'color-burn');
  assert.equal(B.normalizeBlendMode('plus-lighter'), 'normal');
  const html = B.blendOptionsHtml();
  assert.equal((html.match(/<option disabled>/g) || []).length, 5, 'five separators like Illustrator');
});

test('Blend modes: style helpers keep other inline properties', () => {
  assert.equal(B.setStyleProp('opacity: 0.5', 'mix-blend-mode', 'multiply'), 'opacity: 0.5; mix-blend-mode: multiply;');
  assert.equal(B.setStyleProp('mix-blend-mode: screen; fill: red', 'mix-blend-mode', null), 'fill: red;');
  assert.equal(B.setStyleProp('mix-blend-mode: screen', 'mix-blend-mode', null), null);
  assert.equal(B.styleProp('fill:red; mix-blend-mode : overlay', 'mix-blend-mode'), 'overlay');
});

test('Blend modes: apply to multi-selection + group is one undoable step', () => {
  const a = fakeEl('rect', { style: 'fill: red' }), g = fakeEl('g');
  const sc = fakeCanvas([a, g]);
  const changed = B.applyBlendMode(sc, [a, g], 'multiply');
  assert.equal(changed.length, 2);
  assert.equal(a.getAttribute('data-visteras-blend'), 'multiply');
  assert.equal(a.getAttribute('style'), 'fill: red; mix-blend-mode: multiply;');
  assert.equal(g.getAttribute('style'), 'mix-blend-mode: multiply;');
  assert.equal(sc.log.length, 1);
  assert.equal(sc.log[0].stack.length, 2);
  assert.equal(B.selectionBlendMode([a, g]), 'multiply');
  sc.undo();
  assert.equal(a.getAttribute('style'), 'fill: red');
  assert.equal(a.getAttribute('data-visteras-blend'), null);
  assert.equal(g.getAttribute('style'), null);
  sc.redo();
  assert.equal(B.readBlendMode(g), 'multiply');
  // Normal removes the property and the stored attribute; same value → no history
  B.applyBlendMode(sc, [a], 'normal');
  assert.equal(a.getAttribute('style'), 'fill: red;');
  assert.equal(a.getAttribute('data-visteras-blend'), null);
  const n = sc.log.length;
  B.applyBlendMode(sc, [a], 'normal');
  assert.equal(sc.log.length, n);
  assert.equal(B.selectionBlendMode([a, g]), '', 'mixed selection shows blank');
});

test('Blend modes: stored attribute restores the style after the sanitizer dropped it', () => {
  const el = fakeEl('path', { 'data-visteras-blend': 'screen' }); // what a reopened .vvd looks like
  assert.equal(B.syncBlendStyle(el), true);
  assert.equal(el.getAttribute('style'), 'mix-blend-mode: screen;');
  assert.equal(B.syncBlendStyle(el), false, 'idempotent');
  const imported = fakeEl('path', { style: 'mix-blend-mode: hard-light' });
  B.syncBlendStyle(imported);
  assert.equal(imported.getAttribute('data-visteras-blend'), 'hard-light');
});

test('Blend modes: wired into the Appearance panel and the eyedropper keeps the stored mode', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<div class="prop_row visteras_blend_row" id="prop_row_blend">\s*<div id="slot_blend_mode"/);
  assert.ok(html.indexOf('id="slot_blend_mode"') > html.indexOf('id="slot_opacity"'), 'next to opacity');
  assert.match(html, /mountBlendModes\(svgEditor\);/);
  const eye = fs.readFileSync(new URL('../js/visteras-eyedropper.js', import.meta.url), 'utf8');
  assert.match(eye, /setAttr\('data-visteras-blend', v == null \|\| v === 'normal' \? null : v\);/);
});
