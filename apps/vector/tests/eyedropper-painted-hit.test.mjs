/**
 * Eyedropper hit-testing: painted areas only (Illustrator behaviour).
 * Stock SVG-Edit gives the current layer pointer-events:all (children inherit),
 * so the browser hit-tests unfilled interiors; isPaintedHit re-checks paint.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { isPaintedHit, isPaintPainted, effectiveOpacity } = await import('../js/visteras-eyedropper.js');

// Fake geometry: a 100×100 square at 0,0; "stroke band" = within 3 of the edge.
const inSquare = (p) => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100;
const onEdge = (p, w = 6) => { const d = Math.min(Math.abs(p.x), Math.abs(p.x - 100), Math.abs(p.y), Math.abs(p.y - 100)); return d <= w / 2 && p.x >= -w / 2 && p.x <= 100 + w / 2 && p.y >= -w / 2 && p.y <= 100 + w / 2; };
const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; } };
function shape(attrs = {}, cs = {}, { nodeName = 'path', parent = null, ringWidth = 6 } = {}) {
  const e = {
    nodeName, nodeType: 1, parentNode: parent, id: attrs.id || '', _cs: { opacity: '1', 'fill-opacity': '1', 'stroke-opacity': '1', 'stroke-width': '1', ...cs },
    getAttribute(n) { return attrs[n] ?? null; },
    getScreenCTM() { return identity; },
    isPointInFill: (p) => inSquare(p),
    isPointInStroke: (p) => onEdge(p, ringWidth),
    ownerDocument: { getElementById: () => null },
  };
  return e;
}
const getCS = (e) => ({ getPropertyValue: (p) => e._cs?.[p] ?? '' , opacity: e._cs?.opacity });
const hit = (el, x, y, extra = {}) => isPaintedHit(el, x, y, { getCS, content: null, ...extra });

test('unfilled path: interior is NOT a hit, stroke is', () => {
  const p = shape({}, { fill: 'none', stroke: 'rgb(204, 51, 34)', 'stroke-width': '6' });
  assert.equal(hit(p, 50, 50), false);
  assert.equal(hit(p, 1, 50), true);
});

test('filled path: interior is a hit', () => {
  const p = shape({}, { fill: 'rgb(255, 0, 0)', stroke: 'none' });
  assert.equal(hit(p, 50, 50), true);
  assert.equal(hit(p, 150, 50), false);
});

test('fill-opacity 0, transparent and rgba(…,0) fills are unpainted', () => {
  for (const cs of [{ fill: 'rgb(0, 0, 255)', 'fill-opacity': '0' }, { fill: 'transparent' }, { fill: 'rgba(0, 0, 0, 0)' }]) {
    const p = shape({}, { ...cs, stroke: 'rgb(255, 0, 255)', 'stroke-width': '4' });
    assert.equal(hit(p, 50, 50), false, JSON.stringify(cs));
    assert.equal(hit(p, 0, 50), true, 'stroke still hits');
  }
});

test('stroke-only rect: none/zero-width/zero-opacity strokes never hit', () => {
  assert.equal(hit(shape({}, { fill: 'none', stroke: 'rgb(17, 136, 17)', 'stroke-width': '8' }), 0, 50), true);
  assert.equal(hit(shape({}, { fill: 'none', stroke: 'none', 'stroke-width': '8' }), 0, 50), false);
  assert.equal(hit(shape({}, { fill: 'none', stroke: 'rgb(0, 0, 0)', 'stroke-width': '0' }), 0, 50), false);
  assert.equal(hit(shape({}, { fill: 'none', stroke: 'rgb(0, 0, 0)', 'stroke-opacity': '0' }), 0, 50), false);
});

test('element or ancestor group opacity 0 ⇒ unpainted', () => {
  const g = shape({}, { opacity: '0' }, { nodeName: 'g' });
  const p = shape({}, { fill: 'rgb(18, 52, 86)' }, { parent: g });
  assert.equal(effectiveOpacity(p, getCS), 0);
  assert.equal(hit(p, 50, 50), false);
  assert.equal(hit(shape({}, { fill: 'rgb(1, 2, 3)', opacity: '0' }), 50, 50), false);
});

test('images and text count as hits (browser bbox/glyph test)', () => {
  assert.equal(hit(shape({}, {}, { nodeName: 'image' }), 50, 50), true);
  assert.equal(hit(shape({}, { fill: 'none' }, { nodeName: 'text' }), 50, 50), true);
});

test('Outside-stroked body: helper ring counts as a body hit, outside the ring does not', () => {
  const body = shape({ 'data-visteras-stroke-align': 'outside' }, { fill: 'none', stroke: 'none' });
  const helper = shape({}, { fill: 'none', stroke: 'rgb(255, 119, 0)', 'stroke-width': '24' }, { ringWidth: 24 });
  assert.equal(hit(body, -6, 50, { helper }), true, 'on the outer ring');
  assert.equal(hit(body, 6, 50, { helper }), false, 'inner half is masked off (fill none)');
  assert.equal(hit(body, -30, 50, { helper }), false, 'beyond the ring');
});

test('Inside-stroked body: only the inner half of the helper ring counts', () => {
  const body = shape({ 'data-visteras-stroke-align': 'inside' }, { fill: 'none', stroke: 'none' });
  const helper = shape({}, { fill: 'none', stroke: 'rgb(0, 153, 170)', 'stroke-width': '24' }, { ringWidth: 24 });
  assert.equal(hit(body, 6, 50, { helper }), true);
  assert.equal(hit(body, -6, 50, { helper }), false, 'outer half is clipped');
  assert.equal(hit(body, 50, 50, { helper }), false, 'unfilled interior');
});

test('isPaintPainted — named colours count as painted, "none" does not', () => {
  assert.equal(isPaintPainted(getCS({ _cs: { fill: 'orange', 'fill-opacity': '1' } }), 'fill'), true);
  assert.equal(isPaintPainted(getCS({ _cs: { fill: 'none' } }), 'fill'), false);
  assert.equal(isPaintPainted(getCS({ _cs: { fill: 'url("#g")' } }), 'fill'), true);
});
