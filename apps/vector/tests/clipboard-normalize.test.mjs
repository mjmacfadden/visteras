import test from 'node:test';
import assert from 'node:assert/strict';
import { unionRects, selectionVisualBounds, pixelBounds, normalizedSvgMarkup, newClipStamp, stampClipSvg, sortByDocumentOrder } from '../js/visteras-clipboard-payload.js';
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

test('normalize: Vector origin markers survive clipboard sanitizing (class + copy group + web custom format)', async () => {
  const svg = normalizedSvgMarkup({ parts: ['<rect/>'], bounds: { x: 2000, y: 0, width: 10, height: 10 } });
  const root = svg.match(/<svg\b[^>]*>/)[0];
  assert.match(root, /\sclass="visteras-vector-clip"/);
  assert.match(root, /data-visteras-source="vector"/);
  assert.match(svg, /<g data-visteras-copy-group="1"/);
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../js/visteras-clipboard-bridge.js', import.meta.url), 'utf8');
  assert.match(src, /const CLIP_MIME = 'web application\/x-visteras-clip\+json'/);
  assert.match(src, /items\[CLIP_MIME\] = Promise\.resolve/, 'rich ClipboardItem carries the Vector side channel');
  assert.match(src, /source: 'vector', nonce: stamp\.nonce/, 'copy-event JSON says Vector + carries the stamp');
  assert.match(src, /format: 'visteras-clip', source: 'vector', nonce, ts, svg: svgText/, 'custom format carries the stamp');
});

test('stamp: every Vector copy carries a nonce + timestamp on the SVG root (Studio pastes only the newest copy)', () => {
  const a = newClipStamp('vector', 1000, () => 0.25), b = newClipStamp('vector', 1001, () => 0.75);
  assert.notEqual(a.nonce, b.nonce);
  assert.match(a.nonce, /^vector-/);
  const svg = normalizedSvgMarkup({ parts: ['<rect/>'], bounds: { x: 2000, y: 0, width: 10, height: 10 } });
  const stamped = stampClipSvg(svg, a);
  const root = stamped.match(/<svg\b[^>]*>/)[0];
  assert.match(root, new RegExp(`data-visteras-clip="${a.nonce}" data-visteras-copied="1000"`));
  assert.match(root, /data-visteras-source="vector"/);
  const restamped = stampClipSvg(stamped, b);
  assert.equal((restamped.match(/data-visteras-clip=/g) || []).length, 1, 'stamp replaced, not duplicated');
  assert.equal(restamped.replace(/ data-visteras-(clip|copied)="[^"]*"/g, ''), svg, 'content untouched');
  assert.equal(stampClipSvg('not svg', a), 'not svg');
});

// Fake document: `order` is the DOM (paint) order back → front; `parent` makes contains() work.
function docOrdered(ids, { parent = {} } = {}) {
  const els = ids.map((id, i) => {
    const el = fakeEl('rect', { id, x: String(2000 + i * 40), y: '100', width: '100', height: '80', fill: ['#f00', '#0f0', '#00f', '#ff0'][i % 4] });
    el.docIndex = i;
    el.getBBox = () => ({ x: +el.attrs.x, y: +el.attrs.y, width: +el.attrs.width, height: +el.attrs.height });
    return el;
  });
  const byId = Object.fromEntries(els.map((e) => [e.id, e]));
  for (const el of els) {
    el.compareDocumentPosition = (other) => (other === el ? 0 : other.docIndex > el.docIndex ? 4 : 2);
    el.contains = (other) => { for (let p = parent[other.id]; p; p = parent[p]) if (p === el.id) return true; return other === el; };
  }
  return byId;
}

test('stacking: sortByDocumentOrder returns document (back → front) order whatever the click order', () => {
  const d = docOrdered(['back', 'middle', 'front']);
  const ids = (list) => list.map((e) => e.id);
  assert.deepEqual(ids(sortByDocumentOrder([d.front, d.back, d.middle])), ['back', 'middle', 'front'], 'click order front, back, middle');
  assert.deepEqual(ids(sortByDocumentOrder([d.front, d.middle, d.back])), ['back', 'middle', 'front'], 'reverse order (SVG-Edit selection order)');
  assert.deepEqual(ids(sortByDocumentOrder([d.back, d.middle, d.front])), ['back', 'middle', 'front'], 'already in order');
  assert.deepEqual(ids(sortByDocumentOrder([d.middle, null, d.middle, undefined])), ['middle'], 'nulls and duplicates dropped');
  // Elements without compareDocumentPosition keep their given order.
  const a = fakeEl('rect', { id: 'a' }), b = fakeEl('rect', { id: 'b' });
  assert.deepEqual(ids(sortByDocumentOrder([b, a])), ['b', 'a']);
});

test('stacking: a selected group keeps its own children (nested order intact); selected descendants are not copied twice', () => {
  const d = docOrdered(['g1', 'g1_child_back', 'g1_child_front', 'top'], { parent: { g1_child_back: 'g1', g1_child_front: 'g1' } });
  const ids = sortByDocumentOrder([d.top, d.g1_child_front, d.g1]).map((e) => e.id);
  assert.deepEqual(ids, ['g1', 'top'], 'the child travels inside its group, group stays behind the later sibling');
});

test('stacking: serializeSelectedToSvg writes overlapping shapes in document order when selected in reverse / click order', async () => {
  const d = docOrdered(['Z1', 'Z2', 'Z3']);
  const sc = { getStrokedBBox: ([el]) => el.getBBox() };
  const prevWindow = globalThis.window, prevSer = globalThis.XMLSerializer;
  globalThis.window = { __visterasEffects: { getVisualBounds: (el) => getVisualBounds(el, sc) }, getComputedStyle: () => null };
  globalThis.XMLSerializer = class { serializeToString(n) { return `<${n.tagName} ${Object.entries(n.attrs).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ')}/>`; } };
  for (const el of Object.values(d)) {
    el.style = {};
    el.cloneNode = () => { const c = fakeEl(el.tagName, el.attrs); c.classList = { remove() {} }; c.querySelectorAll = () => []; return c; };
  }
  try {
    const { serializeSelectedToSvg } = await import('../js/visteras-clipboard-bridge.js');
    const order = (svg) => [...svg.matchAll(/id="(Z\d)"/g)].map((m) => m[1]);
    for (const clicked of [[d.Z3, d.Z1, d.Z2], [d.Z3, d.Z2, d.Z1], [d.Z2, d.Z3, d.Z1]]) {
      const svg = serializeSelectedToSvg(sc, clicked);
      assert.deepEqual(order(svg), ['Z1', 'Z2', 'Z3'], `selected ${clicked.map((e) => e.id).join(',')} → painted back to front`);
    }
    // Via the canvas selection too (no customSelected).
    const svg = serializeSelectedToSvg({ ...sc, getSelectedElements: () => [d.Z3, d.Z2, d.Z1] });
    assert.deepEqual(order(svg), ['Z1', 'Z2', 'Z3']);
  } finally {
    globalThis.window = prevWindow; globalThis.XMLSerializer = prevSer;
  }
});
