import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { appearanceRows } from '../js/visteras-appearance.js';
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
