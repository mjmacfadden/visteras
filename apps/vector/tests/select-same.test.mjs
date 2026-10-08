import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeColor, paintSignature, strokeWeightSignature, opacitySignature, sameKey } from '../js/visteras-select-same.js';

test('normalizeColor hex / rgb / none', () => {
  assert.equal(normalizeColor('#AbC'), '#aabbcc');
  assert.equal(normalizeColor('rgb(255, 0, 0)'), '#ff0000');
  assert.equal(normalizeColor('none'), 'none');
  assert.equal(normalizeColor(null), 'none');
});

test('sameKey fill / strokeWeight / opacity', () => {
  const el = {
    getAttribute: (k) => ({ fill: '#ff0000', stroke: 'none', 'stroke-width': '2.5', opacity: '0.5' })[k],
    ownerDocument: { getElementById: () => null },
  };
  assert.equal(sameKey(el, 'fill'), '#ff0000');
  assert.equal(sameKey(el, 'strokeWeight'), '2.5');
  assert.equal(sameKey(el, 'opacity'), '0.5');
  assert.equal(paintSignature(el, 'stroke'), 'none');
  assert.equal(strokeWeightSignature(el), '2.5');
  assert.equal(opacitySignature(el), '0.5');
});

test('Select menu injects after Text and before Effect (Illustrator order)', () => {
  const src = fs.readFileSync(new URL('../js/visteras-select-same.js', import.meta.url), 'utf8');
  assert.match(src, /const textMenu = document\.getElementById\('menu_text'\)/);
  assert.match(src, /effectMenu\.before\(entry\)/);
  assert.match(src, /Illustrator order/);
});

test('Select menu includes All, All on Active Artboard, Deselect, Reselect, Inverse, Same', () => {
  const src = fs.readFileSync(new URL('../js/visteras-select-same.js', import.meta.url), 'utf8');
  for (const id of [
    'action_select_all_menu',
    'action_select_all_artboard',
    'action_deselect_all_menu',
    'action_select_reselect',
    'action_select_inverse',
    'menu_select_same',
  ]) {
    assert.match(src, new RegExp(id));
  }
  assert.match(src, /selectAllOnActiveArtboard/);
  assert.match(src, /reselectLast/);
  assert.match(src, /formatBrowserSafeShortcut\(\{ meta: true, key: '6'/);
  assert.match(src, /eventMatchesChord\(e, \{ meta: true, key: '6' \}/);
});

test('index mounts select-same with cache-bust select-2', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /visteras-select-same\.js\?v=select-2/);
  assert.match(html, /mountSelectSame/);
});
