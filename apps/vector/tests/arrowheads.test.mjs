/**
 * gravit-gap-4 item 4: Stroke-panel arrowheads + export parity.
 * Canvas, SVG, PNG (SVG drawn through <img>) and PDF (svg2pdf) all render the
 * same native <marker> elements, so parity = the marker defs and marker-start/
 * marker-end references survive every export path unchanged. Pixel-level
 * parity is checked in the real-Chrome smoke (vector-gravit-gap-4-smoke.mjs).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Minimal DOM for createElementNS-based marker building.
class FakeNode {
  constructor(tag) { this.localName = tag; this.tagName = tag; this.attrs = {}; this.children = []; this.parentNode = null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  append(...n) { for (const c of n) { c.parentNode = this; this.children.push(c); } }
  insertBefore(n) { this.append(n); }
  get firstChild() { return this.children[0] || null; }
  get id() { return this.attrs.id || ''; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this); }
  querySelector(sel) {
    const all = [];
    const walk = (n) => { for (const c of n.children) { all.push(c); walk(c); } };
    walk(this);
    if (sel === ':scope > defs') return this.children.find((c) => c.localName === 'defs') || null;
    const m = sel.match(/^#(.+)$/);
    if (m) return all.find((c) => c.attrs.id === m[1].replace(/\\/g, '')) || null;
    return null;
  }
}
globalThis.document = { createElementNS: (_ns, tag) => new FakeNode(tag) };
globalThis.CSS = { escape: (s) => s };
globalThis.getComputedStyle = () => ({ stroke: 'none' });

const A = await import('../js/visteras-arrowheads.js');

const fakeCanvas = () => {
  const root = new FakeNode('svg');
  let n = 0;
  return { getSvgContent: () => root, getNextId: () => `svg_${++n}`, root };
};

test('Arrowheads: Illustrator-like style set incl. none/arrow/triangle/circle/bar/diamond/square', () => {
  for (const k of ['none', 'open', 'filled', 'filled_stealth', 'triangle', 'bar', 'circle', 'circle_open', 'diamond', 'square']) {
    assert.ok(k in A.ARROW_STYLES, k);
    assert.ok(A.ARROW_STYLE_LABELS[k], `${k} label`);
  }
});

test('Arrowheads: align extend vs tip-at-end, mirrored for start', () => {
  const tip = A.arrowTipX('filled');
  assert.equal(A.arrowRefX('filled', { align: 'end', which: 'end' }), tip);
  assert.ok(A.arrowRefX('filled', { align: 'extend', which: 'end' }) < tip, 'extend: tip lies past the path end');
  assert.equal(A.arrowRefX('filled', { align: 'end', which: 'start' }), 100 - tip);
});

test('Arrowheads: apply sets marker-start/end, takes the stroke color, separate scales, swap', () => {
  const sc = fakeCanvas();
  const path = new FakeNode('path');
  path.setAttribute('id', 'p1');
  path.setAttribute('stroke', '#ff3300');
  sc.root.append(path);
  A.applyArrowheads(sc, path, { start: 'circle', end: 'filled', startScale: 50, endScale: 200, align: 'end' });
  assert.equal(path.getAttribute('marker-start'), 'url(#visteras_arrow_start_p1)');
  assert.equal(path.getAttribute('marker-end'), 'url(#visteras_arrow_end_p1)');
  const defs = sc.root.querySelector(':scope > defs');
  const endM = defs.children.find((m) => m.attrs.id === 'visteras_arrow_end_p1');
  const startM = defs.children.find((m) => m.attrs.id === 'visteras_arrow_start_p1');
  assert.equal(endM.attrs.markerWidth, '8');
  assert.equal(startM.attrs.markerWidth, '2');
  const shape = endM.children[0].children[0];
  assert.equal(shape.attrs.fill, '#ff3300', 'arrowhead takes the stroke color');
  // stroke color change → rebuild
  path.setAttribute('stroke', '#0000ff');
  A.refreshArrowheadColors(sc, path);
  const endM2 = sc.root.querySelector(':scope > defs').children.find((m) => m.attrs.id === 'visteras_arrow_end_p1');
  assert.equal(endM2.children[0].children[0].attrs.fill, '#0000ff');
  // swap
  A.swapArrowheads(sc, path);
  const v = A.readArrowheads(path);
  assert.deepEqual([v.start, v.end, v.startScale, v.endScale], ['filled', 'circle', 200, 50]);
  // none clears refs
  A.applyArrowheads(sc, path, { start: 'none', end: 'none' });
  assert.equal(path.getAttribute('marker-start'), null);
  assert.equal(path.getAttribute('marker-end'), null);
  assert.equal(sc.root.querySelector(':scope > defs').children.length, 0);
});

test('Arrowheads export parity: marker defs + refs survive SVG / PNG / PDF pipelines', () => {
  const exp = fs.readFileSync(new URL('../js/visteras-export.js', import.meta.url), 'utf8');
  // Clone pipeline keeps <defs>/<marker> (NON_RENDER children are never pruned).
  assert.match(exp, /const NON_RENDER = new Set\(\[[^\]]*'defs'[^\]]*'marker'/);
  assert.match(exp, /if \(NON_RENDER\.has\(c\.tagName\.toLowerCase\(\)\) \|\| keep\.has\(c\)\) continue;/);
  assert.match(exp, /const clone = sc\.getSvgContent\(\)\.cloneNode\(true\);/);
  // PNG = the same SVG drawn through <img>; PDF = svg2pdf of the same SVG.
  assert.match(exp, /img\.src = url;/);
  const pdf = fs.readFileSync(new URL('../js/visteras-export-pdf.js', import.meta.url), 'utf8');
  assert.match(pdf, /svg2pdf/);
  const src = fs.readFileSync(new URL('../js/visteras-arrowheads.js', import.meta.url), 'utf8');
  assert.match(src, /markerUnits', 'strokeWidth'/);
  assert.match(src, /orient', 'auto'/);
});

test('Arrowheads: Stroke dock UI wired; ext-markers retired; deferred note gone', () => {
  const src = fs.readFileSync(new URL('../js/visteras-arrowheads.js', import.meta.url), 'utf8');
  for (const id of ['varr_start', 'varr_end', 'varr_swap', 'varr_start_scale', 'varr_end_scale', 'varr_align', 'vdock_stroke_panel']) assert.match(src, new RegExp(id));
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /mountArrowheads\(svgEditor\)/);
  assert.doesNotMatch(html, /'ext-markers'/);
  const app = fs.readFileSync(new URL('../js/visteras-appearance.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /arrowheads deferred/i);
  assert.ok(!fs.existsSync(new URL('./arrowheads-deferred.test.mjs', import.meta.url)));
});
