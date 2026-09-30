/**
 * Tests for visteras-paint-resolver.js — the single effective-paint resolver
 * behind every colour well (Properties chips, toolbar swatches, Color panel).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { parseCssPaint, resolveElementPaint, resolveSelectionPaint, sortTopmostFirst } = await import('../js/visteras-paint-resolver.js');

let order = 0;
function el(attrs = {}, { computed = null, style = null } = {}) {
  const writes = [];
  const e = {
    nodeName: 'path', isConnected: true, _order: order++, _attrs: { ...attrs }, _computed: computed, writes,
    getAttribute(n) { return n in this._attrs ? this._attrs[n] : null; },
    setAttribute(n, v) { writes.push([n, v]); this._attrs[n] = String(v); },
    removeAttribute(n) { writes.push([n, null]); delete this._attrs[n]; },
    style: { getPropertyValue: (p) => (style && style[p]) || '' },
    compareDocumentPosition(o) { return o._order > this._order ? 4 : 2; },
  };
  return e;
}
const getCS = (e) => ({ getPropertyValue: (p) => (e._computed ? e._computed[p] ?? '' : '') });
const noCS = () => { throw new Error('no computed'); };

test('parseCssPaint — hex, short hex, rgb, rgba alpha 0, none/transparent, url, named, unknown', () => {
  assert.deepEqual(parseCssPaint('#CC3322'), { none: false, hex: '#cc3322', gradient: false });
  assert.equal(parseCssPaint('#c32').hex, '#cc3322');
  assert.equal(parseCssPaint('rgb(204, 51, 34)').hex, '#cc3322');
  assert.equal(parseCssPaint('rgba(204, 51, 34, 0.5)').hex, '#cc3322');
  assert.equal(parseCssPaint('rgba(0, 0, 0, 0)').none, true);
  assert.equal(parseCssPaint('none').none, true);
  assert.equal(parseCssPaint('transparent').none, true);
  assert.equal(parseCssPaint('url("#grad")').gradient, true);
  assert.equal(parseCssPaint('red').hex, '#ff0000');
  assert.equal(parseCssPaint(null), null);
  assert.equal(parseCssPaint(''), null);
  assert.equal(parseCssPaint('currentColor'), null);
});

test('Pen path with stroke attribute (Mike\'s repro) resolves to its red, not the black default', () => {
  const p = el({ stroke: '#cc3322', fill: 'none' }, { computed: { stroke: 'rgb(204, 51, 34)', fill: 'none' } });
  const r = resolveElementPaint(p, 'stroke', { getComputedStyle: getCS });
  assert.equal(r.hex, '#cc3322');
  assert.equal(r.source, 'computed');
  assert.equal(resolveElementPaint(p, 'fill', { getComputedStyle: getCS }).none, true);
});

test('Pen path with style="stroke:…" resolves without computed style (inline style fallback)', () => {
  const p = el({ style: 'stroke:#a52a2a;stroke-width:6' });
  const r = resolveElementPaint(p, 'stroke', { getComputedStyle: noCS });
  assert.equal(r.hex, '#a52a2a');
  assert.equal(r.source, 'style');
});

test('attribute fallback when neither computed nor inline style has paint', () => {
  const p = el({ stroke: '#228833' });
  const r = resolveElementPaint(p, 'stroke', { getComputedStyle: () => ({ getPropertyValue: () => '' }) });
  assert.equal(r.hex, '#228833');
  assert.equal(r.source, 'attribute');
});

test('computed wins over attribute (class / inherited group stroke)', () => {
  const p = el({}, { computed: { stroke: 'rgb(17, 119, 51)' } });
  assert.equal(resolveElementPaint(p, 'stroke', { getComputedStyle: getCS }).hex, '#117733');
});

test('Inside and Outside bodies use stored data-visteras-stroke-paint (body stroke is none)', () => {
  for (const align of ['inside', 'outside']) {
    const b = el({ stroke: 'none', 'data-visteras-stroke-align': align, 'data-visteras-stroke-paint': '#ff7700' }, { computed: { stroke: 'none' } });
    const r = resolveElementPaint(b, 'stroke', { getComputedStyle: getCS });
    assert.equal(r.hex, '#ff7700', align);
    assert.equal(r.source, 'align-paint');
  }
  // Center keeps using the rendered stroke.
  const c = el({ stroke: '#123456', 'data-visteras-stroke-align': 'center', 'data-visteras-stroke-paint': '#ff7700' }, { computed: { stroke: 'rgb(18, 52, 86)' } });
  assert.equal(resolveElementPaint(c, 'stroke', { getComputedStyle: getCS }).hex, '#123456');
});

test('resolveBody maps a helper to its body', () => {
  const body = el({ 'data-visteras-stroke-align': 'outside', 'data-visteras-stroke-paint': '#0099aa', stroke: 'none' });
  const helper = el({ stroke: '#000000', 'stroke-width': '16' }, { computed: { stroke: 'rgb(0, 0, 0)' } });
  const r = resolveElementPaint(helper, 'stroke', { getComputedStyle: getCS, resolveBody: (e) => (e === helper ? body : e) });
  assert.equal(r.hex, '#0099aa');
});

test('resolveSelectionPaint — mixed flag, topmost first, uniform not mixed, none handled', () => {
  const a = el({ stroke: '#ff0000' });
  const b = el({ stroke: '#0000ff' });
  const c = el({ stroke: '#ff0000' });
  const opts = { getComputedStyle: noCS };
  const mixed = resolveSelectionPaint([a, b], 'stroke', opts);
  assert.equal(mixed.mixed, true);
  assert.equal(mixed.hex, '#0000ff', 'topmost (later in document) wins');
  assert.equal(resolveSelectionPaint([b, a], 'stroke', opts).hex, '#0000ff', 'order-independent');
  const same = resolveSelectionPaint([a, c], 'stroke', opts);
  assert.equal(same.mixed, false);
  assert.equal(same.hex, '#ff0000');
  const n = el({ stroke: 'none' });
  assert.equal(resolveSelectionPaint([n], 'stroke', opts).none, true);
  assert.equal(resolveSelectionPaint([], 'stroke', opts), null);
  assert.deepEqual(sortTopmostFirst([a, b, c]).map((e) => e._order), [c._order, b._order, a._order]);
});

test('resolver is read-only: never writes to the document', () => {
  const els = [
    el({ stroke: '#cc3322' }, { computed: { stroke: 'rgb(204, 51, 34)' } }),
    el({ style: 'stroke:#a52a2a' }),
    el({ 'data-visteras-stroke-align': 'inside', 'data-visteras-stroke-paint': '#0099aa', stroke: 'none' }),
    el({}),
  ];
  for (const which of ['fill', 'stroke']) {
    resolveSelectionPaint(els, which, { getComputedStyle: getCS });
    for (const e of els) resolveElementPaint(e, which, { getComputedStyle: noCS });
  }
  assert.deepEqual(els.flatMap((e) => e.writes), []);
});
