import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const vectorRoot = path.resolve(__dirname, '..');

const outlinesJsPath = path.resolve(vectorRoot, 'js/visteras-text-outlines.js');
const indexHtmlPath = path.resolve(vectorRoot, 'index.html');

const T = await import(`file://${outlinesJsPath}`);

// ─── Lightweight DOM & History Mock Helpers ─────────────────────────────────

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
        if (c.parentNode) {
          c.parentNode.removeChild(c);
        }
        c.parentNode = this;
        this.children.push(c);
        this._updateSiblings();
      }
    },
    insertBefore(newChild, refChild) {
      if (!newChild) return;
      if (newChild.parentNode) {
        newChild.parentNode.removeChild(newChild);
      }
      newChild.parentNode = this;
      if (!refChild) {
        this.children.push(newChild);
      } else {
        const idx = this.children.indexOf(refChild);
        if (idx === -1) this.children.push(newChild);
        else this.children.splice(idx, 0, newChild);
      }
      this._updateSiblings();
      return newChild;
    },
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        child.parentNode = null;
        child.nextSibling = null;
        this._updateSiblings();
      }
      return child;
    },
    remove() {
      if (this.parentNode) {
        this.parentNode.removeChild(this);
      }
    },
    _updateSiblings() {
      for (let i = 0; i < this.children.length; i++) {
        this.children[i].nextSibling = this.children[i + 1] || null;
      }
    },
    querySelector(selector) {
      const idMatch = selector.match(/#([\w-]+)/);
      if (idMatch) {
        return this._findChild((c) => c.getAttribute('id') === idMatch[1]);
      }
      const tagMatch = selector.match(/^([a-zA-Z0-9]+)/);
      if (tagMatch) {
        return this._findChild((c) => c.localName === tagMatch[1].toLowerCase());
      }
      return null;
    },
    querySelectorAll(selector) {
      const res = [];
      const tagMatch = selector.match(/^([a-zA-Z0-9]+)/);
      this._traverse((node) => {
        if (node === this) return;
        if (tagMatch && node.localName === tagMatch[1].toLowerCase()) {
          res.push(node);
        }
      });
      return res;
    },
    _findChild(predicate) {
      for (const c of this.children) {
        if (predicate(c)) return c;
        const found = c._findChild?.(predicate);
        if (found) return found;
      }
      return null;
    },
    _traverse(cb) {
      cb(this);
      for (const c of this.children) {
        c._traverse?.(cb);
      }
    },
  };
  return el;
}

function createMockSvgCanvas() {
  const history = [];
  const events = [];
  let selected = [];

  const defs = createMockElement('defs', { id: 'defs1' });
  const layer = createMockElement('g', { id: 'layer1', class: 'layer' });
  const svg = createMockElement('svg', { id: 'svgroot' });
  svg.append(defs, layer);

  class InsertElementCommand {
    constructor(elem) {
      this.elem = elem;
      this.parent = elem.parentNode;
      this.next = elem.nextSibling;
    }
    apply() {
      if (this.parent) this.parent.insertBefore(this.elem, this.next);
    }
    unapply() {
      this.elem.remove();
    }
  }

  class RemoveElementCommand {
    constructor(elem, oldNextSibling, oldParent) {
      this.elem = elem;
      this.oldNext = oldNextSibling;
      this.oldParent = oldParent;
    }
    apply() {
      this.elem.remove();
    }
    unapply() {
      if (this.oldParent) this.oldParent.insertBefore(this.elem, this.oldNext);
    }
  }

  class BatchCommand {
    constructor(text) {
      this.text = text;
      this.stack = [];
    }
    addSubCommand(c) {
      this.stack.push(c);
    }
    apply() {
      this.stack.forEach((c) => c.apply());
    }
    unapply() {
      [...this.stack].reverse().forEach((c) => c.unapply());
    }
  }

  const doc = {
    createElementNS(ns, tag) {
      return createMockElement(tag);
    },
    querySelector: (s) => svg.querySelector(s),
    getElementById: (id) => svg._findChild((c) => c.getAttribute('id') === id),
  };

  const sc = {
    svg,
    defs,
    layer,
    doc,
    log: history,
    events,
    findDefs: () => defs,
    getSvgContent: () => svg,
    getSelectedElements: () => selected,
    clearSelection: () => {
      selected = [];
    },
    addToSelection: (els) => {
      selected.push(...els);
    },
    selectOnly: (els) => {
      selected = [...els];
    },
    addCommandToHistory: (c) => history.push(c),
    call: (ev, args) => events.push([ev, args]),
    convertToPath: (elem) => {
      const p = createMockElement('path', { id: elem.getAttribute('id'), d: 'M0 0 L10 10' });
      elem.parentNode?.insertBefore(p, elem);
      elem.remove();
      return p;
    },
    history: {
      InsertElementCommand,
      RemoveElementCommand,
      BatchCommand,
    },
    undo() {
      history.at(-1)?.unapply();
    },
    redo() {
      history.at(-1)?.apply();
    },
  };

  return sc;
}

// ─── Unit Tests ─────────────────────────────────────────────────────────────

test('Create Outlines: isTextElement and canCreateOutlines predicates', () => {
  const textEl = createMockElement('text', { id: 't1', textContent: 'Hello' });
  const rectEl = createMockElement('rect', { id: 'r1' });
  const group = createMockElement('g', { id: 'g1' });
  group.append(textEl);

  assert.equal(T.isTextElement(textEl), true);
  assert.equal(T.isTextElement(rectEl), false);
  assert.equal(T.canCreateOutlines([rectEl]), false);
  assert.equal(T.canCreateOutlines([textEl]), true);
  assert.equal(T.canCreateOutlines([rectEl, textEl]), true);
  assert.equal(T.canCreateOutlines([group]), true);
});

test('Create Outlines: bundled Roboto font parses and extractGlyphPaths generates SVG glyphs', async () => {
  const font = await T.loadFont('Roboto');
  assert.ok(font, 'Bundled Roboto font must be loaded');
  assert.equal(font.names.fontFamily.en, 'Roboto');

  const glyphsStart = T.extractGlyphPaths(font, 'AV', 100, 200, 48, { anchor: 'start' });
  assert.equal(glyphsStart.length, 2);
  assert.equal(glyphsStart[0].char, 'A');
  assert.equal(glyphsStart[1].char, 'V');
  assert.equal(glyphsStart[0].x, 100);
  assert.ok(glyphsStart[0].d.startsWith('M'), 'Path d must start with M');

  // Verify text-anchor: middle shifts startX to the left
  const glyphsMiddle = T.extractGlyphPaths(font, 'AV', 100, 200, 48, { anchor: 'middle' });
  assert.ok(glyphsMiddle[0].x < 100, 'Middle anchor must shift glyphs left of startX');

  // Verify text-anchor: end shifts startX further to the left
  const glyphsEnd = T.extractGlyphPaths(font, 'AV', 100, 200, 48, { anchor: 'end' });
  assert.ok(glyphsEnd[0].x < glyphsMiddle[0].x, 'End anchor must shift glyphs left of middle anchor');
});

test('Create Outlines: convertTextToOutlines preserves styling and generates outline group with fill-rule="evenodd"', async () => {
  const textEl = createMockElement('text', {
    id: 'text_headline',
    x: '50',
    y: '100',
    'font-size': '36',
    'font-family': 'Roboto',
    fill: '#ff5500',
    stroke: '#333333',
    'stroke-width': '1.5',
    transform: 'rotate(15 50 100)',
    opacity: '0.9',
    textContent: 'Vector',
  });

  const doc = {
    createElementNS: (ns, tag) => createMockElement(tag),
  };

  const group = await T.convertTextToOutlines(textEl, doc);
  assert.ok(group, 'Group element must be generated');
  assert.equal(group.getAttribute('class'), 'visteras-text-outlines');
  assert.equal(group.getAttribute('id'), 'text_headline');
  assert.equal(group.getAttribute('fill'), '#ff5500');
  assert.equal(group.getAttribute('stroke'), '#333333');
  assert.equal(group.getAttribute('stroke-width'), '1.5');
  assert.equal(group.getAttribute('transform'), 'rotate(15 50 100)');
  assert.equal(group.getAttribute('opacity'), '0.9');
  assert.equal(group.getAttribute('fill-rule'), 'evenodd', 'Must have evenodd fill-rule for glyph holes');

  // Check glyph paths
  assert.equal(group.children.length, 6, 'Must generate path for each of the 6 letters (Vector)');
  assert.equal(group.children[0].getAttribute('data-char'), 'V');
  assert.ok(group.children[0].getAttribute('d').length > 10);
});

test('Create Outlines: supports multi-line / area text with <tspan> elements', async () => {
  const textEl = createMockElement('text', {
    id: 'text_area',
    'font-size': '24',
    'font-family': 'Roboto',
    fill: '#000000',
  });

  const tspan1 = createMockElement('tspan', { x: '20', y: '40', textContent: 'Line One' });
  const tspan2 = createMockElement('tspan', { x: '20', y: '70', textContent: 'Line Two' });
  textEl.append(tspan1, tspan2);

  const doc = {
    createElementNS: (ns, tag) => createMockElement(tag),
  };

  const group = await T.convertTextToOutlines(textEl, doc);
  assert.ok(group);
  // Total characters without spaces: "LineOne" (7) + "LineTwo" (7) = 14 glyph paths
  assert.equal(group.children.length, 14);
});

test('Create Outlines: createOutlines performs 1-step undo/redo and updates canvas selection', async () => {
  const sc = createMockSvgCanvas();
  globalThis.document = sc.doc;

  const textEl = createMockElement('text', {
    id: 'text1',
    x: '10',
    y: '50',
    'font-size': '32',
    fill: '#ff0000',
    textContent: 'Gravit',
  });
  sc.layer.append(textEl);
  sc.selectOnly([textEl]);

  const outlines = await T.createOutlines(sc, [textEl]);
  assert.ok(outlines, 'Must return converted outline elements');
  assert.equal(outlines.length, 1);
  const group = outlines[0];

  // Document state after createOutlines
  assert.equal(textEl.parentNode, null, 'Original text must be removed from layer');
  assert.equal(sc.layer.children.length, 1);
  assert.equal(sc.layer.children[0], group, 'Outlines group inserted into layer');
  assert.equal(sc.getSelectedElements()[0], group, 'Selection updated to outline group');

  // History entry
  assert.equal(sc.log.length, 1);
  assert.equal(sc.log[0].text, 'Create Outlines');

  // Undo restores original live text
  sc.undo();
  assert.equal(group.parentNode, null, 'Group removed from layer on undo');
  assert.equal(sc.layer.children.length, 1);
  assert.equal(sc.layer.children[0], textEl, 'Live text element restored to layer on undo');

  // Redo restores outlines
  sc.redo();
  assert.equal(textEl.parentNode, null);
  assert.equal(sc.layer.children.length, 1);
  assert.equal(sc.layer.children[0], group, 'Outlines re-applied on redo');
});

test('Create Outlines: convertSelectionToPath handles both shapes and text seamlessly', async () => {
  const sc = createMockSvgCanvas();
  globalThis.document = sc.doc;

  const rectEl = createMockElement('rect', { id: 'r1', x: '0', y: '0', width: '50', height: '50' });
  const textEl = createMockElement('text', { id: 't1', x: '10', y: '20', 'font-size': '20', textContent: 'AB' });
  sc.layer.append(rectEl, textEl);

  const converted = await T.convertSelectionToPath(sc, [rectEl, textEl]);
  assert.ok(converted);
  assert.equal(converted.length, 2);
  assert.equal(converted[0].localName, 'path');
  assert.equal(converted[1].getAttribute('class'), 'visteras-text-outlines');
});

test('HTML: index.html wires ⇧⌘O shortcut, menu item, and mounts mountTextOutlines', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  // 1. Keyboard shortcut in keydown listener
  assert.match(html, /window\.__visterasTextOutlines\?\.createOutlines\(\);/, '⇧⌘O executes createOutlines()');

  // 2. Module import and mount
  assert.match(html, /import\s+\{\s*mountTextOutlines\s*\}\s+from\s+'\.\/js\/visteras-text-outlines\.js\?v=outlines-1';/);
  assert.match(html, /mountTextOutlines\(svgEditor\);/);

  // 3. OpenType library in head
  assert.match(html, /<script src="\.\/lib\/opentype\.min\.js\?v=ot-1"><\/script>/);

  // 4. Menu item in menu_text
  assert.match(html, /id="action_create_outlines"[^>]*>Create Outlines\s+<span class="menu_dropdown_shortcut">⇧⌘O<\/span>/);

  // 5. tool_topath allows text in canToPath
  assert.match(html, /const canToPath = !\[(?:'image',|'path',|'g',|'use',|\s)*\]\.includes\(tagName\);|canToPath/);
});
