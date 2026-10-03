import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const vectorRoot = path.resolve(__dirname, '..');

const expandJsPath = path.resolve(vectorRoot, 'js/visteras-expand.js');
const indexHtmlPath = path.resolve(vectorRoot, 'index.html');

const ExpandModule = await import(`file://${expandJsPath}`);

function createMockElement(tag, attrs = {}) {
  const el = {
    tagName: tag.toUpperCase(),
    localName: tag.toLowerCase(),
    nodeType: 1,
    attrs: { ...attrs },
    children: [],
    parentNode: null,
    nextSibling: null,
    textContent: attrs.textContent || '',
    style: {},
    classList: {
      contains(cls) {
        return (el.attrs.class || '').split(/\s+/).includes(cls);
      },
      toggle(cls, force) {
        const classes = new Set((el.attrs.class || '').split(/\s+/).filter(Boolean));
        const shouldAdd = force !== undefined ? force : !classes.has(cls);
        if (shouldAdd) classes.add(cls);
        else classes.delete(cls);
        el.attrs.class = [...classes].join(' ');
      },
    },
    getAttribute(k) {
      return this.attrs[k] !== undefined ? this.attrs[k] : null;
    },
    setAttribute(k, v) {
      this.attrs[k] = String(v);
      if (k === 'id') this.id = String(v);
      if (k === 'class') this.className = String(v);
    },
    removeAttribute(k) {
      delete this.attrs[k];
    },
    hasAttribute(k) {
      return k in this.attrs;
    },
    append(...children) {
      for (const c of children) {
        if (!c) continue;
        if (c.parentNode) c.parentNode.removeChild(c);
        c.parentNode = this;
        this.children.push(c);
      }
    },
    insertBefore(newChild, refChild) {
      if (!newChild) return;
      if (newChild.parentNode) newChild.parentNode.removeChild(newChild);
      newChild.parentNode = this;
      if (!refChild) {
        this.children.push(newChild);
      } else {
        const idx = this.children.indexOf(refChild);
        if (idx === -1) this.children.push(newChild);
        else this.children.splice(idx, 0, newChild);
      }
      return newChild;
    },
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    },
    remove() {
      if (this.parentNode) {
        this.parentNode.removeChild(this);
      }
    },
  };
  Object.defineProperty(el, 'isConnected', {
    get() {
      let cur = this;
      while (cur) {
        if (cur.tagName === 'SVG' || cur.isRoot) return true;
        cur = cur.parentNode;
      }
      return true;
    }
  });
  return el;
}

test('Expand: isPrimitiveShape identifies rect, circle, ellipse, line, polygon, polyline', () => {
  assert.equal(ExpandModule.isPrimitiveShape(createMockElement('rect')), true);
  assert.equal(ExpandModule.isPrimitiveShape(createMockElement('circle')), true);
  assert.equal(ExpandModule.isPrimitiveShape(createMockElement('ellipse')), true);
  assert.equal(ExpandModule.isPrimitiveShape(createMockElement('line')), true);
  assert.equal(ExpandModule.isPrimitiveShape(createMockElement('polygon')), true);
  assert.equal(ExpandModule.isPrimitiveShape(createMockElement('polyline')), true);

  assert.equal(ExpandModule.isPrimitiveShape(createMockElement('path')), false);
  assert.equal(ExpandModule.isPrimitiveShape(createMockElement('text')), false);
  assert.equal(ExpandModule.isPrimitiveShape(createMockElement('g')), false);
});

test('Expand: hasVisibleStroke accurately checks for non-zero, non-none stroke', () => {
  const elNone = createMockElement('path', { stroke: 'none', 'stroke-width': '2' });
  assert.equal(ExpandModule.hasVisibleStroke(elNone), false);

  const elZero = createMockElement('path', { stroke: '#000000', 'stroke-width': '0' });
  assert.equal(ExpandModule.hasVisibleStroke(elZero), false);

  const elValid = createMockElement('path', { stroke: '#ff0000', 'stroke-width': '2' });
  assert.equal(ExpandModule.hasVisibleStroke(elValid), true);

  const elNoStroke = createMockElement('path', { fill: '#ff0000' });
  assert.equal(ExpandModule.hasVisibleStroke(elNoStroke), false);
});

test('Expand: canExpand predicate returns true for text, stroked paths, and primitive shapes', () => {
  const textEl = createMockElement('text', { textContent: 'Hello' });
  assert.equal(ExpandModule.canExpand([textEl]), true);

  const rectEl = createMockElement('rect', { width: '100', height: '100' });
  assert.equal(ExpandModule.canExpand([rectEl]), true);

  const strokedPath = createMockElement('path', { d: 'M0 0 L10 10', stroke: '#000', 'stroke-width': '3' });
  assert.equal(ExpandModule.canExpand([strokedPath]), true);

  const unstrokedPath = createMockElement('path', { d: 'M0 0 L10 10 Z', fill: '#000' });
  assert.equal(ExpandModule.canExpand([unstrokedPath]), false);
});

test('Expand: expandSelection converts text and primitive shapes in a single BatchCommand', async () => {
  const svg = createMockElement('svg');
  svg.isRoot = true;

  const rect = createMockElement('rect', { id: 'rect_1', x: '10', y: '10', width: '50', height: '50', fill: '#ff0000' });
  const text = createMockElement('text', { id: 'text_1', x: '10', y: '50', 'font-family': 'Roboto', 'font-size': '24', textContent: 'ABC', fill: '#000000' });
  svg.append(rect, text);

  const history = {
    commands: [],
    BatchCommand: class {
      constructor(name) { this.name = name; this.sub_commands = []; }
      addSubCommand(cmd) { this.sub_commands.push(cmd); }
    },
    InsertElementCommand: class {
      constructor(el) { this.el = el; }
    },
    RemoveElementCommand: class {
      constructor(el, sibling, parent) { this.el = el; }
    },
  };

  let selection = [rect, text];
  const mockCanvas = {
    doc: {
      createElementNS(ns, tag) {
        return createMockElement(tag);
      },
    },
    history,
    getSelectedElements() { return selection; },
    clearSelection() { selection = []; },
    addToSelection(els) { selection = [...selection, ...els]; },
    addCommandToHistory(cmd) { history.commands.push(cmd); },
    call(event, args) {},
    convertToPath(el) {
      const pathEl = createMockElement('path', { id: el.id, d: 'M10 10 H60 V60 H10 Z', fill: el.getAttribute('fill') });
      el.parentNode.insertBefore(pathEl, el.nextSibling);
      el.remove();
      return pathEl;
    },
  };

  const mockEditor = { svgCanvas: mockCanvas };

  const results = await ExpandModule.expandSelection(mockEditor);
  assert.ok(results && results.length > 0, 'Must return expanded elements');

  // Verify text was converted to outline group
  const textGroup = results.find(el => el.getAttribute('class') === 'visteras-text-outlines');
  assert.ok(textGroup, 'Text element must be converted to visteras-text-outlines group');

  // Verify rect was converted to path
  const pathEl = results.find(el => el.tagName === 'PATH' && el.getAttribute('fill') === '#ff0000');
  assert.ok(pathEl, 'Rect primitive must be converted to path element');

  // Verify history batch was committed
  assert.equal(history.commands.length, 1);
  assert.equal(history.commands[0].name, 'Expand');
});

test('HTML: index.html contains action_expand in Object menu and mounts mountExpand', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf-8');
  assert.match(html, /id="action_expand"/, 'index.html must have action_expand menu item');
  assert.match(html, /import\s+\{\s*mountExpand\s*\}\s+from\s+'\.\/js\/visteras-expand\.js/, 'index.html must import mountExpand');
  assert.match(html, /mountExpand\(svgEditor\);/, 'index.html must call mountExpand');
});
