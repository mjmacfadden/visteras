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
  assert.equal(lineH.getAttribute('stroke'), '#fa229b'); // Classic Illustrator magenta/pink smart guide line
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

  // Moving object close to center X = 400 (e.g. moving x=374, width=50 -> center is 374 + 25 = 399, which is 1px away from 400)
  const moving = createMockElement('rect');
  moving.getBBox = () => ({ x: 374, y: 100, width: 50, height: 50 });

  manager.evaluateSmartSnap([moving]);
  assert.ok(smartLayer.children.length > 0, 'Must generate smart guide line when aligning within snap tolerance');

  const vGuide = smartLayer.children.find(l => l.getAttribute('x1') === '400' && l.getAttribute('x2') === '400');
  assert.ok(vGuide, 'Must generate vertical smart guide line aligned at X = 400');
});

test('Guides: Smart Guides renders pink guides in middle and center of artboard with center label and markers', () => {
  const mockCanvas = {
    getZoom() { return 1; },
    getResolution() { return { w: 800, h: 600 }; },
    getSvgContent() {
      return createMockElement('g');
    }
  };

  const manager = new GuidesModule.GuideManager({ svgCanvas: mockCanvas });
  const smartLayer = createMockElement('g', { id: 'visteras_smart_guides' });
  manager.smartGuidesLayer = smartLayer;

  // Moving object centered at artboard center (400, 300)
  // Object: x = 350, y = 250, width = 100, height = 100 -> center is (400, 300)
  const moving = createMockElement('rect');
  moving.getBBox = () => ({ x: 350, y: 250, width: 100, height: 100 });

  manager.evaluateSmartSnap([moving]);

  // Both vertical and horizontal center guides should be rendered in pink #fa229b
  const vCenterGuide = smartLayer.children.find(
    el => el.getAttribute('class') === 'visteras-smart-guide' &&
          el.getAttribute('x1') === '400' &&
          el.getAttribute('stroke') === '#fa229b'
  );
  assert.ok(vCenterGuide, 'Must show pink vertical guide at artboard center X = 400');

  const hMiddleGuide = smartLayer.children.find(
    el => el.getAttribute('class') === 'visteras-smart-guide' &&
          el.getAttribute('y1') === '300' &&
          el.getAttribute('stroke') === '#fa229b'
  );
  assert.ok(hMiddleGuide, 'Must show pink horizontal guide at artboard middle Y = 300');

  // Should have crosshairs and 'center' label
  const markers = smartLayer.children.filter(el => el.getAttribute('class') === 'visteras-smart-marker');
  assert.ok(markers.length > 0, 'Must have crosshair markers at center/middle');

  const centerLabels = smartLayer.children.filter(
    el => el.getAttribute('class') === 'visteras-smart-label' && el.textContent === 'center'
  );
  assert.ok(centerLabels.length > 0, 'Must have pink "center" label at artboard center');
});

test('Guides: Smart Guides renders pink guides along artboard edges', () => {
  const mockCanvas = {
    getZoom() { return 1; },
    getResolution() { return { w: 800, h: 600 }; },
    getSvgContent() {
      return createMockElement('g');
    }
  };

  const manager = new GuidesModule.GuideManager({ svgCanvas: mockCanvas });
  const smartLayer = createMockElement('g', { id: 'visteras_smart_guides' });
  manager.smartGuidesLayer = smartLayer;

  // Moving object aligned with left edge (x = 0) and top edge (y = 0)
  const moving = createMockElement('rect');
  moving.getBBox = () => ({ x: 0, y: 0, width: 80, height: 80 });

  manager.evaluateSmartSnap([moving]);

  const leftEdgeGuide = smartLayer.children.find(
    el => el.getAttribute('class') === 'visteras-smart-guide' &&
          el.getAttribute('x1') === '0' &&
          el.getAttribute('stroke') === '#fa229b'
  );
  assert.ok(leftEdgeGuide, 'Must show pink vertical guide along artboard left edge X = 0');

  const topEdgeGuide = smartLayer.children.find(
    el => el.getAttribute('class') === 'visteras-smart-guide' &&
          el.getAttribute('y1') === '0' &&
          el.getAttribute('stroke') === '#fa229b'
  );
  assert.ok(topEdgeGuide, 'Must show pink horizontal guide along artboard top edge Y = 0');
});

test('Guides: Smart Guides renders sibling inline alignment markers, labels, and displacement badge', () => {
  const mockCanvas = {
    getZoom() { return 1; },
    getResolution() { return { w: 800, h: 600 }; },
    getSvgContent() {
      const content = createMockElement('g');
      // Sibling rect at (100, 100), size (150, 120) -> right edge is 250, bottom is 220
      const sibling = createMockElement('rect');
      sibling.getBBox = () => ({ x: 100, y: 100, width: 150, height: 120 });
      content.append(sibling);
      return content;
    }
  };

  const manager = new GuidesModule.GuideManager({ svgCanvas: mockCanvas });
  const smartLayer = createMockElement('g', { id: 'visteras_smart_guides' });
  manager.smartGuidesLayer = smartLayer;

  // Moving rect placed inline with sibling: left edge at 250 (touching sibling right edge) and bottom at 220
  // Moving rect: x = 250, y = 140, width = 120, height = 80 -> bottom is 140 + 80 = 220
  const moving = createMockElement('rect');
  moving.getBBox = () => ({ x: 250, y: 140, width: 120, height: 80 });

  const delta = { dx: -126.05, dy: 0 };
  manager.evaluateSmartSnap([moving], delta);

  // Check pink guide line along X = 250
  const vGuide = smartLayer.children.find(
    el => el.getAttribute('class') === 'visteras-smart-guide' &&
          el.getAttribute('x1') === '250' &&
          el.getAttribute('stroke') === '#fa229b'
  );
  assert.ok(vGuide, 'Must render pink guide line along aligned sibling edge X = 250');

  // Check pink guide line along Y = 220
  const hGuide = smartLayer.children.find(
    el => el.getAttribute('class') === 'visteras-smart-guide' &&
          el.getAttribute('y1') === '220' &&
          el.getAttribute('stroke') === '#fa229b'
  );
  assert.ok(hGuide, 'Must render pink guide line along aligned sibling bottom Y = 220');

  // Check crosshair markers
  const markers = smartLayer.children.filter(el => el.getAttribute('class') === 'visteras-smart-marker');
  assert.ok(markers.length >= 2, 'Must render crosshair markers at aligned points and vertices');

  // Check labels ('endpoint' and/or 'midpoint')
  const labels = smartLayer.children.filter(el => el.getAttribute('class') === 'visteras-smart-label');
  assert.ok(labels.length > 0, 'Must render smart alignment labels');
  const labelTexts = labels.map(l => l.textContent);
  assert.ok(labelTexts.includes('endpoint') || labelTexts.includes('midpoint'), 'Labels should include endpoint or midpoint');

  // Check delta badge with dX: -126.05 px and dY: 0 px
  const badge = smartLayer.children.find(el => el.getAttribute('class') === 'visteras-smart-badge');
  assert.ok(badge, 'Must render visteras-smart-badge for displacement');
  const badgeTexts = badge.children.filter(c => c.localName === 'text').map(t => t.textContent);
  assert.ok(badgeTexts.some(t => t.includes('dX: -126.05 px')), 'Badge must display dX displacement readout');
  assert.ok(badgeTexts.some(t => t.includes('dY: 0 px')), 'Badge must display dY displacement readout');
});

test('Guides: Smart Guides snaps moving elements directly to alignment targets', () => {
  const mockCanvas = {
    getZoom() { return 1; },
    getResolution() { return { w: 800, h: 600 }; },
    getSvgContent() {
      const content = createMockElement('g');
      // Sibling rect at (100, 100), width 150 -> right edge is 250
      const sibling = createMockElement('rect');
      sibling.getBBox = () => ({ x: 100, y: 100, width: 150, height: 120 });
      content.append(sibling);
      return content;
    }
  };

  const manager = new GuidesModule.GuideManager({ svgCanvas: mockCanvas });
  const smartLayer = createMockElement('g', { id: 'visteras_smart_guides' });
  manager.smartGuidesLayer = smartLayer;

  // 1. Moving element near artboard center X = 400
  // Element is at x = 373, width = 50 -> center is 398 (2px away from 400)
  const moving = createMockElement('rect');
  moving._bbox = { x: 373, y: 100, width: 50, height: 50 };
  moving.getBBox = () => moving._bbox;

  const res1 = manager.evaluateSmartSnap([moving], null, { applyDirectSnap: true });
  assert.ok(res1, 'Must return snap result');
  assert.equal(res1.snapDx, 2, 'Must calculate snapDx of 2px towards artboard center');
  assert.equal(moving._bbox.x, 375, 'Must physically snap element X by +2px (new center 400)');
  assert.equal(moving.getAttribute('transform'), 'translate(2, 0)', 'Must apply translate transform to element');

  // 2. Moving element near sibling right edge X = 250
  // Element is at x = 248.5, width = 50 -> left edge is 1.5px away from 250
  const movingSibling = createMockElement('rect');
  movingSibling._bbox = { x: 248.5, y: 120, width: 50, height: 50 };
  movingSibling.getBBox = () => movingSibling._bbox;

  const res2 = manager.evaluateSmartSnap([movingSibling], null, { applyDirectSnap: true });
  assert.ok(res2);
  assert.equal(Math.round(res2.snapDx * 10) / 10, 1.5, 'Must calculate snapDx of 1.5px towards sibling edge');
  assert.equal(movingSibling._bbox.x, 250, 'Must physically snap element left edge to sibling right edge X = 250');

  // 3. Handle drag with applyDirectSnap: false returns snapDx without directly mutating element
  const movingHandle = createMockElement('rect');
  movingHandle._bbox = { x: 373, y: 100, width: 50, height: 50 };
  movingHandle.getBBox = () => movingHandle._bbox;

  const res3 = manager.evaluateSmartSnap([movingHandle], null, { applyDirectSnap: false });
  assert.equal(res3.snapDx, 2, 'Must calculate snapDx for handle consumer');
  assert.equal(movingHandle._bbox.x, 373, 'Must NOT mutate element directly when applyDirectSnap is false');
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

test('Guides: Smart Guides only display when objects are in a snappable position', () => {
  const mockCanvas = {
    getZoom() { return 1; },
    getResolution() { return { w: 800, h: 600 }; },
    getSvgContent() {
      return createMockElement('g');
    }
  };

  const manager = new GuidesModule.GuideManager({ svgCanvas: mockCanvas });
  const smartLayer = createMockElement('g', { id: 'visteras_smart_guides' });
  manager.smartGuidesLayer = smartLayer;

  // Object moving in free space, far from artboard edges (0, 800) and center (400, 300)
  // Box: x = 120, y = 145, width = 50, height = 50 (center: 145, 170) -> min distance is > 20px from any candidate
  const moving = createMockElement('rect');
  moving._bbox = { x: 120, y: 145, width: 50, height: 50 };
  moving.getBBox = () => moving._bbox;

  const res = manager.evaluateSmartSnap([moving], { dx: 15, dy: 20 });
  assert.equal(res.activeMatchesX.length, 0, 'No active matches in X');
  assert.equal(res.activeMatchesY.length, 0, 'No active matches in Y');
  assert.equal(res.snapDx, 0, 'No snap displacement in X');
  assert.equal(res.snapDy, 0, 'No snap displacement in Y');
  assert.equal(smartLayer.children.length, 0, 'Must NOT render any guides, markers, or badges when not in a snappable position');
});

test('Guides: Smart Guides layer renders above selectorParentGroup in DOM stacking order', () => {
  const root = createMockElement('svg', { id: 'svgroot' });
  const content = createMockElement('svg', { id: 'svgcontent' });
  const selectorParent = createMockElement('g', { id: 'selectorParentGroup' });
  root.append(content, selectorParent);

  // Mock document
  globalThis.document = {
    createElementNS(ns, tag) {
      return createMockElement(tag);
    },
    getElementById(id) {
      if (id === 'svgroot') return root;
      if (id === 'svgcontent') return content;
      if (id === 'selectorParentGroup') return selectorParent;
      return null;
    }
  };

  const mockCanvas = {
    getSvgRoot() { return root; },
    getSvgContent() { return content; },
    getZoom() { return 1; },
    getResolution() { return { w: 800, h: 600 }; }
  };

  const manager = new GuidesModule.GuideManager({ svgCanvas: mockCanvas });
  manager._ensureLayers();

  // Smart guides layer must be in root and placed AFTER selectorParentGroup
  assert.ok(manager.smartGuidesLayer, 'Must create smart guides layer');
  const selectorIdx = root.children.indexOf(selectorParent);
  const smartIdx = root.children.indexOf(manager.smartGuidesLayer);
  assert.ok(smartIdx > selectorIdx, 'Smart guides layer must be after selectorParentGroup so crosshairs render above handles');
});

test('Guides: evaluateHandleSnap snaps resize handles to alignment targets and renders crosshair markers', () => {
  const mockCanvas = {
    getZoom() { return 1; },
    getResolution() { return { w: 800, h: 600 }; },
    getSvgContent() {
      const content = createMockElement('g');
      const sibling = createMockElement('rect');
      sibling.getBBox = () => ({ x: 100, y: 100, width: 200, height: 150 });
      content.append(sibling);
      return content;
    }
  };

  const manager = new GuidesModule.GuideManager({ svgCanvas: mockCanvas });
  const smartLayer = createMockElement('g', { id: 'visteras_smart_guides' });
  manager.smartGuidesLayer = smartLayer;

  // Handle drag on 'e' (right edge) where live pointer p.x = 298.5 is close to sibling right edge 300
  const snapRes = manager.evaluateHandleSnap({
    dir: 'e',
    p: { x: 298.5, y: 120 },
    b: { x: 50, y: 50, width: 250, height: 100 },
    basis: null,
    elements: [],
    altKey: false
  });

  assert.ok(snapRes, 'Must return snap result for handle drag');
  assert.equal(snapRes.snappedX, 300, 'Must snap right edge to sibling right edge X = 300');
  assert.ok(smartLayer.children.length > 0, 'Must render vertical guide and crosshair');

  const vGuide = smartLayer.children.find(el => el.getAttribute('class') === 'visteras-smart-guide');
  assert.ok(vGuide, 'Must render pink guide line for handle snap');
  assert.equal(vGuide.getAttribute('x1'), '300');

  const marker = smartLayer.children.find(el => el.getAttribute('class') === 'visteras-smart-marker');
  assert.ok(marker, 'Must render pink crosshair marker on the handle');
});

