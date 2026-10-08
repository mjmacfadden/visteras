import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { appearanceRows, ILLUSTRATOR_STROKE_WEIGHT_PRESETS, stepStrokeWeight, formatStrokeWeight } from '../js/visteras-appearance.js';
import { serializeFx } from '../js/visteras-effects.js';
import { fakeEl } from './helpers/fake-svg.mjs';

test('appearanceRows: empty selection', () => {
  assert.deepEqual(appearanceRows([]), { empty: true, rows: [] });
});

test('appearanceRows: Stroke, Fill, effects, Opacity in Illustrator order', () => {
  const el = fakeEl('rect', {
    id: 'r1', fill: '#ff0000', stroke: '#000000', 'stroke-width': '2', opacity: '0.5',
    'data-visteras-fx': serializeFx({ dropShadow: { enabled: true, x: 4, y: 4, blur: 5, opacity: 75, color: '#000000', mode: 'multiply' }, gaussianBlur: { enabled: false, radius: 4 } }),
  });
  const { empty, rows } = appearanceRows([el]);
  assert.equal(empty, false);
  assert.deepEqual(rows.map((r) => r.kind + ':' + (r.type || r.label)), [
    'stroke:Stroke', 'fill:Fill', 'effect:gaussianBlur', 'effect:dropShadow', 'opacity:Opacity',
  ]);
  assert.equal(rows[0].value, '#000000');
  assert.equal(rows[1].value, '#ff0000');
  assert.equal(rows.find((r) => r.type === 'gaussianBlur').visible, false);
  assert.equal(rows.find((r) => r.type === 'dropShadow').visible, true);
  assert.equal(rows.at(-1).value, '50%');
});

test('appearanceRows: mixed fill shows Mixed; missing stroke is None', () => {
  const a = fakeEl('rect', { id: 'a', fill: '#f00' });
  const b = fakeEl('rect', { id: 'b', fill: '#0f0', stroke: '#00f' });
  const { rows } = appearanceRows([a, b]);
  assert.equal(rows.find((r) => r.kind === 'fill').value, 'mixed');
  assert.equal(rows.find((r) => r.kind === 'stroke').value, 'mixed');
});

test('Appearance panel is wired: dock icon, ⇧F6, Window menu, mount', () => {
  const dock = fs.readFileSync(new URL('../js/visteras-panel-dock.js', import.meta.url), 'utf8');
  const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(dock, /data-panel="appearance"/);
  assert.match(dock, /toggle\('appearance'\)/);
  assert.match(dock, /vdock_appearance_panel/);
  assert.match(index, /mountAppearance/);
  assert.doesNotMatch(index, /Appearance panel coming/);
  assert.match(index, /id="action_window_appearance"/);
  assert.doesNotMatch(index, /action_window_appearance"[^>]*disabled/);
});


test('Illustrator stroke weight presets match AI list', () => {
  assert.deepEqual([...ILLUSTRATOR_STROKE_WEIGHT_PRESETS], [
    0.25, 0.5, 0.75, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
  ]);
  assert.equal(formatStrokeWeight(0.25), '0.25');
  assert.equal(formatStrokeWeight(10), '10');
});

test('stepStrokeWeight follows Illustrator-ish quarters then integers', () => {
  assert.equal(stepStrokeWeight(0, 1), 0.25);
  assert.equal(stepStrokeWeight(0.25, 1), 0.5);
  assert.equal(stepStrokeWeight(1, 1), 2);
  assert.equal(stepStrokeWeight(2, -1), 1);
  assert.equal(stepStrokeWeight(0.5, -1), 0.25);
});

test('Appearance stroke row markup: weight field, presets, steppers, underlined label, swatch menu', () => {
  const src = fs.readFileSync(new URL('../js/visteras-appearance.js', import.meta.url), 'utf8');
  assert.match(src, /vapp_weight_input/);
  assert.match(src, /vapp_weight_presets/);
  assert.match(src, /vapp_weight_spin_btn/);
  assert.match(src, /data-act="stroke-options"/);
  assert.match(src, /data-act="swatches"/);
  assert.match(src, /writeStrokeWidth/);
  assert.match(src, /__visterasDock\.open\('stroke'\)/);
  assert.match(src, /ILLUSTRATOR_STROKE_WEIGHT_PRESETS/);
  const css = fs.readFileSync(new URL('../css/visteras-appearance-panel.css', import.meta.url), 'utf8');
  assert.match(css, /vapp_weight/);
  assert.match(css, /vapp_label_link/);
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /visteras-appearance\.js\?v=appearance-stroke-1/);
});

test('appearanceRows prefers data-visteras-stroke-weight over stroke-width', () => {
  const el = fakeEl('rect', {
    id: 'r', fill: 'none', stroke: '#000', 'stroke-width': '4',
    'data-visteras-stroke-weight': '2',
  });
  const { rows } = appearanceRows([el]);
  assert.equal(rows.find((r) => r.kind === 'stroke').weight, '2');
});
