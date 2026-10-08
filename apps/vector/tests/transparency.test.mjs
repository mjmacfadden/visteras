import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fakeEl, fakeCanvas } from './helpers/fake-svg.mjs';
const T = await import('../js/visteras-transparency.js');
const { panelForShortcut } = await import('../js/visteras-panel-dock.js');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('Panel shortcuts respect Shift (Illustrator)', () => {
  const k = (key, mods = {}) => panelForShortcut({ key, code: key, ...mods });
  assert.equal(k('F6'), 'color');
  assert.equal(k('F6', { shiftKey: true }), 'appearance', '⇧F6 is Appearance, never Color');
  assert.equal(k('F7'), 'layers');
  assert.equal(k('F10', { metaKey: true }), 'stroke');
  assert.equal(k('F10', { metaKey: true, shiftKey: true }), 'transparency');
  assert.equal(k('F10', { ctrlKey: true, shiftKey: true }), 'transparency');
  assert.equal(k('F9', { metaKey: true }), 'gradient');
  assert.equal(k('F10'), null);
  assert.equal(k('F6', { altKey: true }), null);
  assert.equal(k('F9', { metaKey: true, shiftKey: true }), null);
});

test('Transparency: opacity percent read/apply is one undo step for a multi-selection', () => {
  const a = fakeEl('rect', { opacity: '0.5' }), b = fakeEl('ellipse');
  assert.equal(T.readOpacityPercent(a), 50);
  assert.equal(T.readOpacityPercent(b), 100);
  assert.equal(T.selectionOpacity([a, b]), '');
  const sc = fakeCanvas([a, b]);
  T.applyOpacity(sc, [a, b], 37.4);
  assert.equal(a.getAttribute('opacity'), '0.37');
  assert.equal(b.getAttribute('opacity'), '0.37');
  assert.equal(sc.log.length, 1);
  assert.equal(T.selectionOpacity([a, b]), 37);
  sc.undo();
  assert.equal(a.getAttribute('opacity'), '0.5');
  assert.equal(b.getAttribute('opacity'), null);
  // 100 % removes the attribute; unchanged → no history
  T.applyOpacity(sc, [b], 100);
  assert.equal(sc.log.length, 1);
  // live slider: "from" snapshot is what undo restores
  a.setAttribute('opacity', '0.2');
  T.applyOpacity(sc, [a], 20, new Map([[a, '0.5']]));
  sc.undo();
  assert.equal(a.getAttribute('opacity'), '0.5');
});

test('Transparency: Isolate Blending writes isolation + stored attr; rehydrates after load', () => {
  const g = fakeEl('g', { style: 'mix-blend-mode: multiply;' });
  const sc = fakeCanvas([g]);
  T.applyIsolate(sc, [g], true);
  assert.equal(g.getAttribute('style'), 'mix-blend-mode: multiply; isolation: isolate;');
  assert.equal(g.getAttribute('data-visteras-isolate'), '1');
  assert.equal(T.readIsolate(g), true);
  sc.undo();
  assert.equal(T.readIsolate(g), false);
  const loaded = fakeEl('g', { 'data-visteras-isolate': '1' }); // sanitizer dropped style
  assert.equal(T.syncIsolateStyle(loaded), true);
  assert.equal(loaded.getAttribute('style'), 'isolation: isolate;');
});

test('Window menu: Transparency ⇧⌘F10 and Appearance ⇧F6 (placeholder); panel mounted', () => {
  assert.match(html, /id="action_window_transparency">Transparency <span class="menu_dropdown_shortcut">⇧⌘F10<\/span>/);
  assert.match(html, /id="action_window_appearance"[^>]*>Appearance <span class="menu_dropdown_shortcut">⇧F6<\/span>/);
  assert.match(html, /mountBlendModes\(svgEditor\);[\s\S]*?mountTransparency\(svgEditor\);/);
  const dock = fs.readFileSync(new URL('../js/visteras-panel-dock.js', import.meta.url), 'utf8');
  assert.match(dock, /toggle\('appearance'\)/, '⇧F6 opens Appearance');
  assert.match(dock, /transparencyPane\.id = 'vdock_transparency_panel'/);
  const src = fs.readFileSync(new URL('../js/visteras-transparency.js', import.meta.url), 'utf8');
  assert.match(src, /id="vtr_opacity" class="vtr-input" type="number" min="0" max="100" step="1"/);
  assert.match(src, /Isolate Blending/);
});
