import test from 'node:test';
import assert from 'node:assert/strict';
import { unionRects, selectionVisualBounds, pixelBounds, normalizedSvgMarkup } from '../js/visteras-clipboard-payload.js';
import { getVisualBounds } from '../js/visteras-effects.js';
import { fakeEl } from './helpers/fake-svg.mjs';

// Three shapes on an artboard that starts at x=2000; the last one has a drop shadow.
function artboardSelection() {
  const a = fakeEl('rect', { id: 'a', x: '2000', y: '100', width: '100', height: '100', fill: '#f00' });
  const b = fakeEl('rect', { id: 'b', x: '2150', y: '100', width: '100', height: '100', fill: '#0f0' });
  const c = fakeEl('rect', { id: 'c', x: '2300', y: '150', width: '50', height: '50', fill: '#00f', 'data-visteras-fx': JSON.stringify({ dropShadow: { x: 10, y: 10, blur: 0 } }) });
  for (const el of [a, b, c]) {
    el.getBBox = () => ({ x: +el.attrs.x, y: +el.attrs.y, width: +el.attrs.width, height: +el.attrs.height });
  }
  const sc = { getStrokedBBox: ([el]) => el.getBBox() };
  return { els: [a, b, c], sc };
}

const parse = (svg) => {
  const root = svg.match(/<svg\b[^>]*>/)[0];
  const attr = (n) => root.match(new RegExp(`\\s${n}="([^"]*)"`))?.[1];
  const tr = svg.match(/<g data-visteras-copy-group="1" transform="translate\(([-\d.]+) ([-\d.]+)\)">/);
  return { root, viewBox: attr('viewBox'), width: +attr('width'), height: +attr('height'), source: attr('data-visteras-source'), origin: attr('data-visteras-origin'), tx: tr && +tr[1], ty: tr && +tr[2] };
};

test('normalize: unionRects / pixelBounds skip empties and snap outward to whole pixels', () => {
  assert.deepEqual(unionRects([null, { x: 0, y: 0, width: 0, height: 0 }, { x: 5, y: 5, width: 10, height: 10 }, { x: -5, y: 8, width: 2, height: 20 }]), { x: -5, y: 5, width: 20, height: 23 });
  assert.equal(unionRects([]), null);
  assert.deepEqual(pixelBounds({ x: 2000.4, y: 9.5, width: 10.2, height: 5 }), { x: 2000, y: 9, width: 11, height: 6 });
  assert.deepEqual(pixelBounds(null), { x: 0, y: 0, width: 100, height: 100 });
});

test('normalize: multi-object selection from an offset artboard → viewBox 0 0 w h, content inside, shadow included', () => {
  const { els, sc } = artboardSelection();
  const bounds = selectionVisualBounds(els, (el) => getVisualBounds(el, sc));
  // 2000..2360 (shadow of c reaches 2350+10) × 100..210 (shadow reaches 200+10).
  assert.deepEqual(bounds, { x: 2000, y: 100, width: 360, height: 110 });
  const svg = normalizedSvgMarkup({ parts: els.map((e) => `<rect id="${e.id}"/>`), bounds });
  const p = parse(svg);
  assert.equal(p.viewBox, '0 0 360 110');
  assert.equal(p.width, 360);
  assert.equal(p.height, 110);
  assert.equal(p.source, 'vector', 'Studio routes this marker to the smart-object paste');
  assert.equal(p.origin, '2000 100');
  assert.deepEqual([p.tx, p.ty], [-2000, -100], 'one group translated so the bounds start at 0,0');
  assert.equal((svg.match(/<g data-visteras-copy-group/g) || []).length, 1, 'single embedded group');
  for (const el of els) {
    const v = getVisualBounds(el, sc);
    const x = v.x + p.tx, y = v.y + p.ty;
    assert.ok(x >= 0 && y >= 0 && x + v.width <= p.width && y + v.height <= p.height, `${el.id} (with effects) inside the viewBox`);
  }
  const noShadow = selectionVisualBounds(els, (el) => sc.getStrokedBBox([el]));
  assert.ok(bounds.width > noShadow.width && bounds.height > noShadow.height, 'shadow extends the bounds');
});

test('normalize: serializeSelectedToSvg uses effect-aware bounds (window.__visterasEffects.getVisualBounds)', async () => {
  const { els, sc } = artboardSelection();
  const prevWindow = globalThis.window, prevSer = globalThis.XMLSerializer;
  globalThis.window = { __visterasEffects: { getVisualBounds: (el) => getVisualBounds(el, sc) }, getComputedStyle: () => null };
  globalThis.XMLSerializer = class { serializeToString(n) { return `<${n.tagName} ${Object.entries(n.attrs).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ')}/>`; } };
  for (const el of els) {
    el.style = {};
    el.cloneNode = () => { const c = fakeEl(el.tagName, el.attrs); c.classList = { remove() {} }; c.querySelectorAll = () => []; return c; };
  }
  try {
    const { serializeSelectedToSvg } = await import('../js/visteras-clipboard-bridge.js');
    const svg = serializeSelectedToSvg(sc, els);
    const p = parse(svg);
    assert.equal(p.viewBox, '0 0 360 110');
    assert.deepEqual([p.tx, p.ty], [-2000, -100]);
    for (const id of ['a', 'b', 'c']) assert.ok(svg.includes(`id="${id}"`), `${id} copied`);
    assert.ok(svg.indexOf('id="a"') > svg.indexOf('data-visteras-copy-group'), 'shapes live inside the group');
  } finally {
    globalThis.window = prevWindow; globalThis.XMLSerializer = prevSer;
  }
});
