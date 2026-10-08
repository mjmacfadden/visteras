import test from 'node:test';
import assert from 'node:assert/strict';
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
