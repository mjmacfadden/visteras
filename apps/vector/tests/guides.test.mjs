import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const vectorRoot = path.resolve(__dirname, '..');

const guidesJsPath = path.resolve(vectorRoot, 'js/visteras-guides.js');
const indexHtmlPath = path.resolve(vectorRoot, 'index.html');

const GuidesModule = await import(`file://${guidesJsPath}`);

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
    get innerHTML() {
      return '';
    },
    set innerHTML(val) {
      this.children = [];
    }
  };
  return el;
}

test('Guides: GuideManager creates, manages, and clears ruler guides', () => {
  const manager = new GuidesModule.GuideManager(null);

  // Add horizontal guide at y = 150
  const g1 = manager.addGuide('h', 150);
  assert.ok(g1 && g1.id);
  assert.equal(g1.type, 'h');
  assert.equal(g1.pos, 150);
  assert.equal(manager.rulerGuides.length, 1);

  // Add vertical guide at x = 320.5
  const g2 = manager.addGuide('v', 320.5);
  assert.equal(g2.type, 'v');
  assert.equal(g2.pos, 320.5);
  assert.equal(manager.rulerGuides.length, 2);

  // Toggle show/hide
  manager.toggleShowGuides();
  assert.equal(manager.showGuides, false);
  manager.toggleShowGuides(true);
  assert.equal(manager.showGuides, true);

  // Toggle lock/unlock
  manager.toggleLockGuides();
  assert.equal(manager.lockGuides, true);
  manager.toggleLockGuides(false);
  assert.equal(manager.lockGuides, false);

  // Remove guide
  const removed = manager.removeGuide(g1.id);
  assert.equal(removed, true);
  assert.equal(manager.rulerGuides.length, 1);

  // Clear guides
  manager.clearGuides();
  assert.equal(manager.rulerGuides.length, 0);
});

test('Guides: Smart Guides toggle and alignment line generation', () => {
  const manager = new GuidesModule.GuideManager(null);

  // Initial state is enabled
  assert.equal(manager.smartGuidesEnabled, true);

  // Toggle off
  manager.toggleSmartGuides();
  assert.equal(manager.smartGuidesEnabled, false);

  // Toggle on
  manager.toggleSmartGuides(true);
  assert.equal(manager.smartGuidesEnabled, true);

  // Mock smart guides layer
  const smartLayer = createMockElement('g', { id: 'visteras_smart_guides' });
  manager.smartGuidesLayer = smartLayer;

  // Mock document
  globalThis.document = {
    createElementNS(ns, tag) {
      return createMockElement(tag);
    },
    getElementById(id) {
      return null;
    },
  };

  manager.drawSmartGuideLine('h', 200, 0, 800);
  assert.equal(smartLayer.children.length, 1);
  const lineH = smartLayer.children[0];
  assert.equal(lineH.getAttribute('class'), 'visteras-smart-guide');
  assert.equal(lineH.getAttribute('stroke'), '#ff007f'); // Magenta smart guide line
  assert.equal(lineH.getAttribute('y1'), '200');
  assert.equal(lineH.getAttribute('y2'), '200');

  manager.drawSmartGuideLine('v', 400, 0, 600);
  assert.equal(smartLayer.children.length, 2);
  const lineV = smartLayer.children[1];
  assert.equal(lineV.getAttribute('x1'), '400');
  assert.equal(lineV.getAttribute('x2'), '400');

  // Clear
  manager.clearSmartGuides();
  assert.equal(smartLayer.children.length, 0);
});

test('Guides: Smart Guides evaluates snap against artboard and neighbor bounds', () => {
  const mockCanvas = {
    getZoom() { return 1; },
    getResolution() { return { w: 800, h: 600 }; },
    getSvgContent() {
      const content = createMockElement('g');
      // Existing sibling rectangle centered at (400, 300) with size (100, 100)
      const sibling = createMockElement('rect');
      sibling.getBBox = () => ({ x: 350, y: 250, width: 100, height: 100 });
      content.append(sibling);
      return content;
    }
  };

  const manager = new GuidesModule.GuideManager({ svgCanvas: mockCanvas });
  const smartLayer = createMockElement('g', { id: 'visteras_smart_guides' });
  manager.smartGuidesLayer = smartLayer;

  // Moving object close to center X = 400 (e.g. moving x=399, width=50 -> center is 399 + 25 = 424; let's put center at 399)
  // Moving rect: x = 374, width = 50 -> center is 374 + 25 = 399, which is 1px away from 400!
  const moving = createMockElement('rect');
  moving.getBBox = () => ({ x: 374, y: 100, width: 50, height: 50 });

  manager.evaluateSmartSnap([moving]);
  assert.ok(smartLayer.children.length > 0, 'Must generate smart guide line when aligning within snap tolerance');

  const vGuide = smartLayer.children.find(l => l.getAttribute('x1') === '400');
  assert.ok(vGuide, 'Must generate vertical smart guide line aligned at X = 400');
});

test('HTML: index.html contains Smart Guides and Ruler Guide menu items and mounts mountGuides', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf-8');
  assert.match(html, /id="action_smart_guides"/, 'Must have action_smart_guides in View menu');
  assert.match(html, /id="action_toggle_guides"/, 'Must have action_toggle_guides in View menu');
  assert.match(html, /id="action_lock_guides"/, 'Must have action_lock_guides in View menu');
  assert.match(html, /id="action_clear_guides"/, 'Must have action_clear_guides in View menu');
  assert.match(html, /import\s+\{\s*mountGuides\s*\}\s+from\s+'\.\/js\/visteras-guides\.js/, 'Must import mountGuides');
  assert.match(html, /mountGuides\(svgEditor\);/, 'Must call mountGuides');
});
