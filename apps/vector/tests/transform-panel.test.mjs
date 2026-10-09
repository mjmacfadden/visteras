import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../js/visteras-transform-panel.js', import.meta.url), 'utf8');
const textEditingSource = fs.readFileSync(new URL('../js/visteras-text-editing.js', import.meta.url), 'utf8');
const { referencePosition, dimensionScale, isAreaText, mountTransformPanel } = await import('../js/visteras-transform-panel.js');

test('Nine reference points track document bounds', () => {
  const b = { x: 10, y: 20, width: 100, height: 60 };
  assert.deepEqual(referencePosition(b, { x: 0, y: 0 }), { x: 10, y: 20 });
  assert.deepEqual(referencePosition(b, { x: 0.5, y: 0.5 }), { x: 60, y: 50 });
  assert.deepEqual(referencePosition(b, { x: 1, y: 1 }), { x: 110, y: 80 });
});

test('Dimension edits preserve proportions only when locked', () => {
  const b = { width: 100, height: 50 };
  assert.deepEqual(dimensionScale(b, 'w', 200, false), { sx: 2, sy: 1 });
  assert.deepEqual(dimensionScale(b, 'w', 200, true), { sx: 2, sy: 2 });
  assert.deepEqual(dimensionScale(b, 'h', 25, true), { sx: 0.5, sy: 0.5 });
});

test('Paragraph Text Box section is completely removed from text editing', () => {
  assert.doesNotMatch(textEditingSource, /Paragraph Text Box/, 'Paragraph Text Box section removed');
  assert.doesNotMatch(textEditingSource, /Text box width/, 'Text box width label removed');
  assert.doesNotMatch(textEditingSource, /Text box height/, 'Text box height label removed');
  assert.doesNotMatch(textEditingSource, /syncPanel/, 'syncPanel function and calls removed');
});

test('Transform W/H on area text resizes frame attributes without adding transform attribute, with single undo step', async () => {
  class MockNode {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.localName = tag.toLowerCase();
      this.attrs = {};
      this.children = [];
      this.style = {};
      this.listeners = {};
      this.parentNode = null;
      this.textContent = '';
      this._html = '';
    }
    get childNodes() { return this.children; }
    get outerHTML() { return '<' + this.localName + '>' + (this._html || this.textContent) + '</' + this.localName + '>'; }
    get innerHTML() { return this._html || this.children.map(c => c.outerHTML).join(''); }
    set innerHTML(v) { this._html = v; }
    replaceChildren(...nodes) { this.children = nodes.flatMap(n => n.children.length ? n.children : [n]); }
    getAttribute(k) { return this.attrs[k] !== undefined ? this.attrs[k] : null; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    removeAttribute(k) { delete this.attrs[k]; }
    hasAttribute(k) { return k in this.attrs; }
    append(...nodes) { nodes.forEach(n => { n.parentNode = this; this.children.push(n); }); }
    prepend(...nodes) { nodes.forEach(n => { n.parentNode = this; this.children.unshift(n); }); }
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
    dispatchEvent(ev) { (this.listeners[ev.type || ev] || []).forEach(fn => fn(ev)); }
    querySelectorAll(sel) {
      const res = [];
      const walk = (n) => {
        for (const ch of n.children) {
          if (sel === 'input' && ch.tagName === 'INPUT') res.push(ch);
          if (sel === 'button' && ch.tagName === 'BUTTON') res.push(ch);
          walk(ch);
        }
      };
      walk(this);
      return res;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    getContext() {
      return { font: '', measureText: (s) => ({ width: s.length * 10 }) };
    }
    getBBox() {
      return {
        x: Number(this.attrs.x) || 0,
        y: Number(this.attrs.y) || 0,
        width: Number(this.attrs['data-text-width'] || this.attrs.width) || (this.textContent ? this.textContent.length * 10 : 100),
        height: Number(this.attrs['data-text-height'] || this.attrs.height) || (this.textContent ? 20 : 20)
      };
    }
    get transform() {
      return { baseVal: { numberOfItems: 0, getItem: () => null } };
    }
    getScreenCTM() {
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    }
  }

  globalThis.DOMMatrix = class DOMMatrix {
    constructor(init) {
      if (Array.isArray(init)) [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      else { this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0; }
    }
    translate(x, y) { return this.multiply(new DOMMatrix([1, 0, 0, 1, x, y])); }
    scale(sx, sy) { return this.multiply(new DOMMatrix([sx, 0, 0, sy, 0, 0])); }
    multiply(n) {
      const m = this;
      return new DOMMatrix([
        m.a * n.a + m.c * n.b,
        m.b * n.a + m.d * n.b,
        m.a * n.c + m.c * n.d,
        m.b * n.c + m.d * n.d,
        m.a * n.e + m.c * n.f + m.e,
        m.b * n.e + m.d * n.f + m.f,
      ]);
    }
    inverse() {
      const { a, b, c, d, e, f } = this;
      const k = a * d - b * c;
      return new DOMMatrix([d / k, -b / k, -c / k, a / k, (c * f - d * e) / k, (b * e - a * f) / k]);
    }
    toString() { return 'matrix(' + [this.a, this.b, this.c, this.d, this.e, this.f].join(' ') + ')'; }
  };
  globalThis.DOMPoint = class DOMPoint {
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
    matrixTransform(m) { return { x: m.a * this.x + m.c * this.y + m.e, y: m.b * this.x + m.d * this.y + m.f }; }
  };

  const secBody = new MockNode('div');
  secBody.id = 'sec_transform_body';
  const propPanel = new MockNode('div');
  propPanel.id = 'properties_panel';

  const doc = {
    head: new MockNode('head'),
    getElementById: (id) => (id === 'sec_transform_body' ? secBody : id === 'properties_panel' ? propPanel : null),
    createElement: (tag) => new MockNode(tag),
    createElementNS: (ns, tag) => new MockNode(tag),
    createDocumentFragment: () => new MockNode('fragment'),
  };

  globalThis.document = doc;
  globalThis.window = {
    addEventListener: () => {},
    MutationObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
  };
  globalThis.MutationObserver = globalThis.window.MutationObserver;
  globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame;
  globalThis.getComputedStyle = () => ({ fontSize: '24px', fontStyle: 'normal', fontWeight: 'normal', fontFamily: 'Roboto', letterSpacing: '0px' });

  const history = [];
  class ChangeElementCommand {
    constructor(elem, oldValues, text) {
      this.elem = elem;
      this.oldValues = { ...oldValues };
      this.newValues = {};
      this.text = text;
      for (const k of Object.keys(oldValues)) this.newValues[k] = elem.getAttribute(k);
    }
    apply() { for (const [k, v] of Object.entries(this.newValues)) v == null ? this.elem.removeAttribute(k) : this.elem.setAttribute(k, v); }
    unapply() { for (const [k, v] of Object.entries(this.oldValues)) v == null ? this.elem.removeAttribute(k) : this.elem.setAttribute(k, v); }
  }
  class BatchCommand {
    constructor(text) { this.text = text; this.stack = []; }
    addSubCommand(c) { this.stack.push(c); }
    apply() { this.stack.forEach(c => c.apply()); }
    unapply() { [...this.stack].reverse().forEach(c => c.unapply()); }
  }

  // 1. Verify area text resize
  const areaText = new MockNode('text');
  areaText.setAttribute('x', '50');
  areaText.setAttribute('y', '60');
  areaText.setAttribute('data-text-width', '200');
  areaText.setAttribute('data-text-height', '100');
  areaText.setAttribute('data-text-content', 'Sample paragraph content for resize test');

  let selectedElements = [areaText];
  const sc = {
    getSelectedElements: () => selectedElements,
    getSvgContent: () => ({ getScreenCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), contains: () => true }),
    getSvgRoot: () => ({ contains: () => true }),
    addCommandToHistory: (c) => history.push(c),
    call: () => {},
    history: { ChangeElementCommand, BatchCommand }
  };

  const panelApi = mountTransformPanel({ svgCanvas: sc });

  assert.equal(isAreaText(areaText), true, 'Area text detected by isAreaText helper');
  assert.equal(areaText.getAttribute('transform'), null, 'Initial transform attribute is null');

  // Change Width to 150
  panelApi.change('w', 150);
  assert.equal(areaText.getAttribute('data-text-width'), '150', 'data-text-width updated to 150');
  assert.equal(areaText.getAttribute('transform'), null, 'transform attribute was NOT added');
  assert.equal(history.length, 1, 'Single undo command added');
  assert.equal(history[0].text, 'Resize text box');

  // Undo restores data-text-width in one step
  history[0].unapply();
  assert.equal(areaText.getAttribute('data-text-width'), '200', 'Undo restores data-text-width to 200');
  assert.equal(areaText.getAttribute('transform'), null, 'transform attribute still null after undo');

  // Redo reapplies data-text-width
  history[0].apply();
  assert.equal(areaText.getAttribute('data-text-width'), '150', 'Redo reapplies data-text-width to 150');

  // Change Height to 80
  panelApi.change('h', 80);
  assert.equal(areaText.getAttribute('data-text-height'), '80', 'data-text-height updated to 80');
  assert.equal(areaText.getAttribute('transform'), null, 'transform attribute still null');
  assert.equal(history.length, 2, 'Second undo command added');

  // Undo restores data-text-height
  history[1].unapply();
  assert.equal(areaText.getAttribute('data-text-height'), '100', 'Undo restores data-text-height to 100');

  // 2. Verify point text retains standard transform matrix behavior
  const pointText = new MockNode('text');
  pointText.textContent = 'Point text';
  pointText.setAttribute('x', '10');
  pointText.setAttribute('y', '20');

  selectedElements = [pointText];
  assert.equal(isAreaText(pointText), false, 'Point text is not area text');
  assert.equal(pointText.getAttribute('transform'), null, 'Point text initial transform is null');

  panelApi.change('w', 200);
  assert.notEqual(pointText.getAttribute('transform'), null, 'Point text receives transform matrix');
  assert.equal(pointText.getAttribute('data-text-width'), null, 'Point text does not receive data-text-width');
});
