import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const vectorRoot = path.resolve(__dirname, '..');

const clipJsPath = path.resolve(vectorRoot, 'js/visteras-clipping-mask.js');
const indexHtmlPath = path.resolve(vectorRoot, 'index.html');

const C = await import(`file://${clipJsPath}`);

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
    classList: {
      contains(cls) {
        return (el.attrs.class || '').split(/\s+/).includes(cls);
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
      return null;
    },
    querySelectorAll(selector) {
      const res = [];
      const tagMatch = selector.match(/^([a-zA-Z0-9]+)/);
      const attrMatch = selector.match(/\[([a-zA-Z0-9_-]+)(?:([*^$]?=)"([^"]*)")?\]/);
      this._traverse((node) => {
        if (node === this) return;
        let match = true;
        if (tagMatch && node.localName !== tagMatch[1].toLowerCase()) match = false;
        if (attrMatch) {
          const val = node.getAttribute(attrMatch[1]);
          if (val === null) match = false;
          else if (attrMatch[2] === '*=' && !val.includes(attrMatch[3])) match = false;
          else if (attrMatch[2] === '^=' && !val.startsWith(attrMatch[3])) match = false;
          else if (attrMatch[2] === '=' && val !== attrMatch[3]) match = false;
        }
        if (match) res.push(node);
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
    compareDocumentPosition(other) {
      if (this === other) return 0;
      const root = this._getRoot();
      const list = [];
      root._traverse((n) => list.push(n));
      const iA = list.indexOf(this);
      const iB = list.indexOf(other);
      if (iA < iB) return 4; // Node.DOCUMENT_POSITION_FOLLOWING
      return 2; // Node.DOCUMENT_POSITION_PRECEDING
    },
    _getRoot() {
      let cur = this;
      while (cur.parentNode) cur = cur.parentNode;
      return cur;
    },
  };
  return el;
}

function createMockSvgCanvas() {
  const history = [];
  const events = [];
  let nextIdCounter = 100;
  let selected = [];

  const defs = createMockElement('defs', { id: 'defs1' });
  const layer = createMockElement('g', { id: 'layer1', class: 'layer' });
  const svg = createMockElement('svg', { id: 'svgroot' });
  svg.append(defs, layer);

  class MoveElementCommand {
    constructor(elem, oldNextSibling, oldParent) {
      this.elem = elem;
      this.oldNext = oldNextSibling;
      this.oldParent = oldParent;
      this.newNext = elem.nextSibling;
      this.newParent = elem.parentNode;
    }
    apply() {
      if (this.newParent) this.newParent.insertBefore(this.elem, this.newNext);
    }
    unapply() {
      if (this.oldParent) this.oldParent.insertBefore(this.elem, this.oldNext);
    }
  }

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
    getNextId: () => String(++nextIdCounter),
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
    history: {
      MoveElementCommand,
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

test('Clipping Mask: canMake and canRelease predicates', () => {
  const el1 = createMockElement('rect', { id: 'r1' });
  const el2 = createMockElement('circle', { id: 'c1' });
  const parent = createMockElement('g', { id: 'layer' });
  parent.append(el1, el2);

  // At least 2 elements required
  assert.equal(C.canMake([el1]), false, 'Single element cannot make clipping mask');
  assert.equal(C.canMake([el1, el2]), true, 'Two elements can make clipping mask');

  // Layer or defs elements cannot be used
  const layer = createMockElement('g', { class: 'layer' });
  assert.equal(C.canMake([el1, layer]), false, 'Layer cannot be used in clipping mask');

  // isClipGroup and canRelease
  assert.equal(C.isClipGroup(el1), false);
  const clipGrp = createMockElement('g', {
    class: 'vclip-group',
    'data-visteras-clip': 'vclip_101',
    'clip-path': 'url(#vclip_101)',
  });
  assert.equal(C.isClipGroup(clipGrp), true);
  assert.equal(C.canRelease([el1]), false);
  assert.equal(C.canRelease([clipGrp]), true);
  assert.equal(C.canRelease([el1, clipGrp]), true);
});

test('Clipping Mask: makeClippingMask creates <clipPath> in <defs>, <g class="vclip-group">, and is undoable', () => {
  const sc = createMockSvgCanvas();
  globalThis.document = sc.doc;

  const rect = createMockElement('rect', { id: 'content1', x: '10', y: '10', width: '200', height: '100', fill: '#ff0000' });
  const circle = createMockElement('circle', { id: 'mask1', cx: '50', cy: '50', r: '40', fill: '#00ff00' });
  sc.layer.append(rect, circle);

  // Circle is after rect in DOM (topmost). It should become the mask shape.
  const group = C.makeClippingMask(sc, [rect, circle]);

  assert.ok(group, 'Clip group must be returned');
  assert.equal(group.getAttribute('class'), 'vclip-group');
  assert.ok(group.getAttribute('data-visteras-clip').startsWith(C.CLIP_PREFIX));
  assert.equal(group.getAttribute('clip-path'), `url(#${group.getAttribute('data-visteras-clip')})`);

  // Content (rect) is inside the group
  assert.equal(group.children.length, 1);
  assert.equal(group.children[0], rect);

  // Mask (circle) is inside <clipPath> in <defs>
  const clipId = group.getAttribute('data-visteras-clip');
  const clipPath = sc.defs.querySelector(`#${clipId}`);
  assert.ok(clipPath, '<clipPath> must exist in defs with matching id');
  assert.equal(clipPath.getAttribute('clipPathUnits'), 'userSpaceOnUse');
  assert.equal(clipPath.children.length, 1);
  assert.equal(clipPath.children[0], circle);

  // History recorded exactly one batch command
  assert.equal(sc.log.length, 1);
  assert.equal(sc.log[0].text, 'Make Clipping Mask');

  // Verify Undo restores original state completely
  sc.undo();

  assert.equal(sc.defs.children.length, 0, 'clipPath removed from defs on undo');
  assert.equal(sc.layer.children.length, 2, 'both elements restored to layer on undo');
  assert.equal(sc.layer.children[0], rect);
  assert.equal(sc.layer.children[1], circle);

  // Verify Redo re-applies clipping mask
  sc.redo();
  assert.equal(sc.layer.children.length, 1, 'layer contains only clip group after redo');
  assert.equal(sc.layer.children[0], group);
  assert.equal(sc.defs.children.length, 1, 'clipPath re-inserted into defs after redo');
});

test('Clipping Mask: releaseClippingMask restores mask shape on top of content and cleans up <defs>', () => {
  const sc = createMockSvgCanvas();
  globalThis.document = sc.doc;

  const rect = createMockElement('rect', { id: 'content1', fill: '#0000ff' });
  const circle = createMockElement('circle', { id: 'mask1', fill: '#ffff00' });
  sc.layer.append(rect, circle);

  const group = C.makeClippingMask(sc, [rect, circle]);
  assert.ok(group);

  // Now release the clipping mask
  const released = C.releaseClippingMask(sc, [group]);
  assert.ok(released);
  assert.equal(released.length, 2);

  // In layer: rect is first, circle is second (mask shape restored on top)
  assert.equal(sc.layer.children.length, 2);
  assert.equal(sc.layer.children[0], rect);
  assert.equal(sc.layer.children[1], circle);

  // Group and clipPath are removed
  assert.equal(group.parentNode, null, 'group removed from DOM');
  assert.equal(sc.defs.children.length, 0, 'clipPath removed from defs');

  // Undo restores the clipping mask
  sc.undo();
  assert.equal(sc.layer.children.length, 1, 'undo restores clip group to layer');
  assert.equal(sc.defs.children.length, 1, 'undo restores clipPath to defs');
});

test('Clipping Mask: sweepOrphanClipPaths removes unreferenced clipPaths from defs', () => {
  const sc = createMockSvgCanvas();
  const orphan = createMockElement('clipPath', { id: 'vclip_orphan_999' });
  sc.defs.append(orphan);
  assert.equal(sc.defs.children.length, 1);

  C.sweepOrphanClipPaths(sc);
  assert.equal(sc.defs.children.length, 0, 'Unused vclip_ clipPath swept from defs');
});

test('HTML: index.html wires ⌘7 / ⌥⌘7 shortcuts, imports and mounts mountClippingMask', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  // 1. Keyboard shortcuts in keydown listener
  assert.match(html, /window\.__visterasClippingMask\?\.make\(\);/, '⌘7 executes make()');
  assert.match(html, /window\.__visterasClippingMask\?\.release\(\);/, '⌥⌘7 executes release()');

  // 2. Module import and mount
  assert.match(html, /import\s+\{\s*mountClippingMask\s*\}\s+from\s+'\.\/js\/visteras-clipping-mask\.js\?v=clip-\d+';/);
  assert.match(html, /mountClippingMask\(svgEditor\);/);

  // 3. Dynamic injection mounts Clipping Mask submenu with Make ⌘7 and Release ⌥⌘7
  const src = fs.readFileSync(clipJsPath, 'utf8');
  assert.match(src, /menu_clipping_mask/);
  assert.match(src, /id="action_make_clipping_mask"[^>]*>Make\s+<span class="menu_dropdown_shortcut">⌘7<\/span>/);
  assert.match(src, /id="action_release_clipping_mask"[^>]*>Release\s+<span class="menu_dropdown_shortcut">⌥⌘7<\/span>/);
});

test('Clipping Mask: placing a raster image over a vector clips image with vector shape (does not disappear)', () => {
  const sc = createMockSvgCanvas();
  globalThis.document = sc.doc;

  const vectorRect = createMockElement('rect', { id: 'v_rect', x: '50', y: '50', width: '200', height: '200', fill: '#00ccff' });
  const rasterImg = createMockElement('image', { id: 'r_img', x: '0', y: '0', width: '400', height: '300', href: 'data:image/png;base64,...' });

  // Raster image is placed OVER the vector (later in DOM)
  sc.layer.append(vectorRect, rasterImg);

  assert.equal(C.canMake([vectorRect, rasterImg]), true, 'vector + image is a valid clipping mask selection');

  const group = C.makeClippingMask(sc, [vectorRect, rasterImg]);
  assert.ok(group, 'Clipping mask must be created');

  // Verify vectorRect became the mask shape in <clipPath> inside defs
  const clipId = group.getAttribute('data-visteras-clip');
  const clipPath = sc.defs.querySelector(`#${clipId}`);
  assert.ok(clipPath, 'clipPath must be in defs');
  assert.equal(clipPath.children.length, 1);
  assert.equal(clipPath.children[0], vectorRect, 'vector shape MUST be inside clipPath (image cannot clip)');

  // Verify rasterImg is the clipped content inside the group
  assert.equal(group.children.length, 1);
  assert.equal(group.children[0], rasterImg, 'raster image MUST be inside clip group to remain visible');

  // Verify releasing restores elements
  const released = C.releaseClippingMask(sc, [group]);
  assert.ok(released);
  assert.equal(released.length, 2);
  assert.equal(sc.layer.children.length, 2);
});

test('Clipping Mask: selecting two raster images without any vector shape cannot make clipping mask', () => {
  const img1 = createMockElement('image', { id: 'img1' });
  const img2 = createMockElement('image', { id: 'img2' });
  const parent = createMockElement('g');
  parent.append(img1, img2);

  assert.equal(C.canMake([img1, img2]), false, 'Two images cannot make clipping mask without vector shape');
});

