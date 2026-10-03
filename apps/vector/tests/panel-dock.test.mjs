import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const vectorRoot = path.resolve(__dirname, '..');

const indexHtmlPath = path.resolve(vectorRoot, 'index.html');
const themeCssPath = path.resolve(vectorRoot, 'css/visteras-theme.css');
const docShellCssPath = path.resolve(vectorRoot, 'css/visteras-document-shell.css');
const dockCssPath = path.resolve(vectorRoot, 'css/visteras-panel-dock.css');

const typeOnPathJsPath = path.resolve(vectorRoot, 'js/visteras-type-on-path.js');
const eraserJsPath = path.resolve(vectorRoot, 'js/visteras-eraser.js');
const scissorsJsPath = path.resolve(vectorRoot, 'js/visteras-scissors.js');
const shapeBuilderJsPath = path.resolve(vectorRoot, 'js/visteras-shape-builder.js');

// ─── 1. HTML Markup & Integration Tests ──────────────────────────────────────

test('HTML: index.html includes visteras-panel-dock.css stylesheet', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  assert.match(html, /<link[^>]+href="\.\/css\/visteras-panel-dock\.css\?v=dock-3"[^>]*>/);
});

test('HTML: index.html imports and mounts visteras-panel-dock', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  assert.match(html, /import\s+\{\s*mountVisterasPanelDock\s*\}\s+from\s+'\.\/js\/visteras-panel-dock\.js\?v=dock-3';/);
  assert.match(html, /mountVisterasColorSystem\(\{\s*svgEditor\s*\}\);[\s\S]*?mountVisterasPanelDock\(\{\s*svgEditor\s*\}\);/);
});

test('HTML: Window menu contains all dock panels, properties, and pathfinder with shortcuts', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const windowMenuMatch = html.match(/<div class="menu_entry" id="menu_window">([\s\S]*?)<\/div>\s*<!-- Help Menu -->/);
  assert.ok(windowMenuMatch, 'Window menu block exists');
  const content = windowMenuMatch[1];

  assert.match(content, /id="action_window_color"[^>]*>Color\s+<span class="menu_dropdown_shortcut">F6<\/span>/);
  assert.match(content, /id="action_window_swatches"[^>]*>Swatches<\/div>/);
  assert.match(content, /id="action_window_stroke"[^>]*>Stroke\s+<span class="menu_dropdown_shortcut">⌘F10<\/span>/);
  assert.match(content, /id="action_window_gradient"[^>]*>Gradient\s+<span class="menu_dropdown_shortcut">⌘F9<\/span>/);
  assert.match(content, /id="action_window_layers"[^>]*>Layers\s+<span class="menu_dropdown_shortcut">F7<\/span>/);
  assert.match(content, /id="action_window_properties"[^>]*>Properties<\/div>/);
  assert.match(content, /id="action_window_pathfinder"[^>]*>Pathfinder<\/div>/);
});

test('HTML: Window menu items wire to __visterasDock API', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  assert.match(html, /action_window_color[\s\S]*?toggle[\s\S]*?'color'/);
  assert.match(html, /action_window_swatches[\s\S]*?toggle[\s\S]*?'swatches'/);
  assert.match(html, /action_window_stroke[\s\S]*?toggle[\s\S]*?'stroke'/);
  assert.match(html, /action_window_gradient[\s\S]*?toggle[\s\S]*?'gradient'/);
  assert.match(html, /action_window_layers[\s\S]*?toggle[\s\S]*?'layers'/);
  assert.match(html, /action_window_properties[\s\S]*?toggleProperties/);
  assert.match(html, /action_window_pathfinder[\s\S]*?togglePathfinderPanel/);
});

// ─── 2. CSS Grid Layout Tests ────────────────────────────────────────────────

test('CSS: Theme and Document Shell define 36px dock column and grid areas', () => {
  const themeCss = fs.readFileSync(themeCssPath, 'utf8');
  const docShellCss = fs.readFileSync(docShellCssPath, 'utf8');

  // Theme grid columns: 36px tools_left, 16px rulers, 1fr canvas, 36px dock, 240px sidepanels
  assert.match(themeCss, /grid-template-columns:\s*36px\s+16px\s+1fr\s+36px\s+240px\s*!important;/);
  assert.match(themeCss, /"left\s+corner\s+rulerX\s+dock\s+side"[\s\S]*?"left\s+rulerY\s+workarea\s+dock\s+side"/);

  // Document Shell grid columns and rulers-hidden variant
  assert.match(docShellCss, /grid-template-columns:\s*36px\s+16px\s+1fr\s+36px\s+240px\s*!important;/);
  assert.match(docShellCss, /\.svg_editor\.visteras-rulers-hidden\s*\{[\s\S]*?grid-template-columns:\s*36px\s+0\s+1fr\s+36px\s+240px\s*!important;/);
});

test('CSS: Panel dock stylesheet defines dock strip, flyout, and visibility classes', () => {
  const dockCss = fs.readFileSync(dockCssPath, 'utf8');

  assert.match(dockCss, /#vdock\s*\{[\s\S]*?width:\s*36px(?:\s*!important)?;/);
  assert.match(dockCss, /#vdock_flyout\s*\{[\s\S]*?position:\s*absolute;/);
  assert.match(dockCss, /\.visteras-panels-hidden[\s\S]*?#vdock[\s\S]*?\{[\s\S]*?display:\s*none\s*!important;/);
});

// ─── 3. Tool Click Exclusion Selectors Tests ─────────────────────────────────

test('Tool Exclusions: Type on Path, Eraser, Scissors, and Shape Builder ignore #vdock and #vdock_flyout', () => {
  const topSrc = fs.readFileSync(typeOnPathJsPath, 'utf8');
  const eraserSrc = fs.readFileSync(eraserJsPath, 'utf8');
  const scissorsSrc = fs.readFileSync(scissorsJsPath, 'utf8');
  const shapeBuilderSrc = fs.readFileSync(shapeBuilderJsPath, 'utf8');

  assert.match(topSrc, /#vdock,\s*#vdock_flyout/, 'Type on Path includes dock exclusions');
  assert.match(eraserSrc, /#vdock,\s*#vdock_flyout/, 'Eraser includes dock exclusions');
  assert.match(scissorsSrc, /#vdock,\s*#vdock_flyout/, 'Scissors includes dock exclusions');
  assert.match(shapeBuilderSrc, /#vdock,\s*#vdock_flyout/, 'Shape Builder includes dock exclusions');
});

// ─── 4. Functional Panel Dock Tests (Mock DOM) ──────────────────────────────

class MockDOMTokenList {
  constructor(el) {
    this._el = el;
    this._set = new Set();
  }
  add(...tokens) {
    tokens.forEach(t => this._set.add(t));
    this._sync();
  }
  remove(...tokens) {
    tokens.forEach(t => this._set.delete(t));
    this._sync();
  }
  toggle(token, force) {
    const result = force !== undefined ? force : !this._set.has(token);
    if (result) this._set.add(token); else this._set.delete(token);
    this._sync();
    return result;
  }
  contains(token) {
    return this._set.has(token);
  }
  _sync() {
    this._el.className = Array.from(this._set).join(' ');
  }
}

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.nodeName = this.tagName;
    this.id = '';
    this._className = '';
    this.classList = new MockDOMTokenList(this);
    this.attributes = new Map();
    this.dataset = {};
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.listeners = new Map();
    this.offsetWidth = 240;
    this.offsetHeight = 400;
  }

  get className() {
    return this._className;
  }

  set className(val) {
    this._className = String(val || '');
    this.classList._set = new Set(this._className.trim().split(/\s+/).filter(Boolean));
  }

  get nextSibling() {
    if (!this.parentNode) return null;
    const idx = this.parentNode.children.indexOf(this);
    return idx >= 0 && idx < this.parentNode.children.length - 1 ? this.parentNode.children[idx + 1] : null;
  }

  setAttribute(name, val) {
    const sVal = String(val);
    this.attributes.set(name, sVal);
    if (name === 'id') this.id = sVal;
    if (name === 'class') this.className = sVal;
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[key] = sVal;
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'id') this.id = '';
    if (name === 'class') this.className = '';
  }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  insertBefore(newChild, refChild) {
    if (newChild.parentNode) newChild.parentNode.removeChild(newChild);
    newChild.parentNode = this;
    const idx = this.children.indexOf(refChild);
    if (idx === -1) {
      this.children.push(newChild);
    } else {
      this.children.splice(idx, 0, newChild);
    }
    return newChild;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  addEventListener(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
  }

  removeEventListener(event, fn) {
    if (this.listeners.has(event)) {
      const arr = this.listeners.get(event).filter(f => f !== fn);
      this.listeners.set(event, arr);
    }
  }

  dispatchEvent(evt) {
    const target = this;
    const event = { ...evt, target, currentTarget: this, stopPropagation: () => {}, preventDefault: () => {} };
    const list = this.listeners.get(evt.type) || [];
    for (const fn of list) {
      fn(event);
    }
  }

  contains(el) {
    if (!el) return false;
    if (el === this) return true;
    let curr = el.parentNode;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentNode;
    }
    return false;
  }

  closest(selector) {
    let curr = this;
    while (curr) {
      if (curr.matchesSelector && curr.matchesSelector(selector)) return curr;
      curr = curr.parentNode;
    }
    return null;
  }

  matchesSelector(sel) {
    if (!sel) return false;
    const parts = sel.split(',').map(s => s.trim());
    return parts.some(p => {
      const idM = p.match(/#([a-zA-Z0-9_-]+)/);
      if (idM && this.id !== idM[1]) return false;
      const classM = p.match(/\.([a-zA-Z0-9_-]+)/g);
      if (classM) {
        for (const c of classM) {
          if (!this.classList.contains(c.slice(1))) return false;
        }
      }
      const attrM = p.match(/\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/g);
      if (attrM) {
        for (const a of attrM) {
          const [, attr, val] = a.match(/\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/);
          if (val !== undefined) {
            if (this.getAttribute(attr) !== val) return false;
          } else {
            if (!this.attributes.has(attr)) return false;
          }
        }
      }
      return true;
    });
  }

  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }

  querySelectorAll(sel) {
    const results = [];
    function traverse(node) {
      for (const ch of node.children) {
        if (ch.matchesSelector && ch.matchesSelector(sel)) {
          results.push(ch);
        }
        traverse(ch);
      }
    }
    traverse(this);
    return results;
  }

  getBoundingClientRect() {
    return { top: 45, bottom: 445, left: 800, right: 1040, width: 240, height: 400 };
  }

  focus() {}

  get textContent() {
    return this._textContent ?? this.children.map(c => c.textContent).join('');
  }

  set textContent(val) {
    this._textContent = String(val);
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML || '';
  }

  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];
    const parsed = parseHtmlToNodes(html);
    for (const c of parsed) {
      this.appendChild(c);
    }
  }
}

function parseHtmlToNodes(html) {
  html = String(html || '').replace(/<!--[\s\S]*?-->/g, '');
  const root = new MockElement('root');
  const stack = [root];
  const tagRegex = /<(\/)?([a-zA-Z0-9-]+)((?:\s+[a-zA-Z0-9_:-]+(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/)?>|([^<]+)/g;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const [, isClose, tagName, attrStr, isSelfClosing, text] = match;
    if (text) {
      if (text.trim()) {
        const textNode = new MockElement('#text');
        textNode.textContent = text.trim();
        stack[stack.length - 1].appendChild(textNode);
      }
      continue;
    }
    if (isClose) {
      if (stack.length > 1 && stack[stack.length - 1].tagName.toLowerCase() === tagName.toLowerCase()) {
        stack.pop();
      }
      continue;
    }
    const elem = new MockElement(tagName);
    if (attrStr) {
      const attrRegex = /([a-zA-Z0-9_:-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let am;
      while ((am = attrRegex.exec(attrStr)) !== null) {
        const val = am[2] !== undefined ? am[2] : (am[3] !== undefined ? am[3] : (am[4] !== undefined ? am[4] : ''));
        elem.setAttribute(am[1], val);
      }
    }
    stack[stack.length - 1].appendChild(elem);
    const isVoid = ['input', 'br', 'hr', 'img', 'meta', 'link', 'line', 'rect', 'path', 'circle'].includes(tagName.toLowerCase());
    if (!isSelfClosing && !isVoid) {
      stack.push(elem);
    }
  }
  const children = [...root.children];
  children.forEach(c => { c.parentNode = null; });
  return children;
}

function setupMockEnvironment() {
  const doc = new MockElement('#document');
  const body = new MockElement('body');
  doc.appendChild(body);
  doc.body = body;

  doc.getElementById = (id) => {
    function find(node) {
      if (node.id === id) return node;
      for (const ch of node.children || []) {
        const res = find(ch);
        if (res) return res;
      }
      return null;
    }
    return find(doc);
  };

  // Create required container structure
  const container = new MockElement('div');
  container.id = 'container';
  body.appendChild(container);

  const svgEditorEl = new MockElement('div');
  svgEditorEl.className = 'svg_editor';
  container.appendChild(svgEditorEl);

  const sidepanels = new MockElement('div');
  sidepanels.id = 'sidepanels';
  svgEditorEl.appendChild(sidepanels);

  const sidepanelContent = new MockElement('div');
  sidepanelContent.id = 'sidepanel_content';
  sidepanels.appendChild(sidepanelContent);

  const layerPanel = new MockElement('div');
  layerPanel.id = 'layerpanel';
  sidepanelContent.appendChild(layerPanel);

  const vcsColorsBlock = new MockElement('div');
  vcsColorsBlock.id = 'vcs_colors_block';
  sidepanelContent.appendChild(vcsColorsBlock);

  const vcsColorPanel = new MockElement('div');
  vcsColorPanel.id = 'vcs_color_panel';
  vcsColorsBlock.appendChild(vcsColorPanel);

  const vcsSwatchesPanel = new MockElement('div');
  vcsSwatchesPanel.id = 'vcs_swatches_panel';
  vcsColorsBlock.appendChild(vcsSwatchesPanel);

  // Appearance stroke weight and align
  const appWeight = new MockElement('input');
  appWeight.id = 'vcs_app_stroke_weight';
  appWeight.value = '3';
  body.appendChild(appWeight);

  const appAlign = new MockElement('div');
  appAlign.id = 'vcs_app_stroke_align';
  body.appendChild(appAlign);

  // SVG-Edit stroke controls
  ['stroke_linecap', 'stroke_linejoin', 'stroke_style'].forEach(id => {
    const el = new MockElement('div');
    el.id = id;
    body.appendChild(el);
  });

  // Window menu items
  ['color', 'swatches', 'stroke', 'gradient', 'effects', 'transparency', 'layers', 'properties', 'pathfinder'].forEach(id => {
    const item = new MockElement('div');
    item.id = `action_window_${id}`;
    item.className = 'menu_dropdown_item';
    body.appendChild(item);
  });

  const pathfinderPanel = new MockElement('div');
  pathfinderPanel.id = 'visteras_pathfinder_panel';
  pathfinderPanel.style.display = 'none';
  body.appendChild(pathfinderPanel);

  // Storage mock
  const storage = new Map();
  const localStorageMock = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  };

  const docListeners = new Map();
  doc.addEventListener = (ev, fn) => {
    if (!docListeners.has(ev)) docListeners.set(ev, []);
    docListeners.get(ev).push(fn);
  };
  doc.dispatchEvent = (evt) => {
    const list = docListeners.get(evt.type) || [];
    list.forEach(fn => fn(evt));
  };
  doc.createElement = (tag) => {
    const el = new MockElement(tag);
    return el;
  };
  doc.querySelector = (sel) => body.querySelector(sel);
  doc.querySelectorAll = (sel) => body.querySelectorAll(sel);

  const winListeners = new Map();
  const win = {
    innerWidth: 1200,
    innerHeight: 800,
    addEventListener: (ev, fn) => {
      if (!winListeners.has(ev)) winListeners.set(ev, []);
      winListeners.get(ev).push(fn);
    },
    dispatchEvent: (evt) => {
      const list = winListeners.get(evt.type) || [];
      list.forEach(fn => fn(evt));
    },
  };

  // Assign globals
  globalThis.document = doc;
  globalThis.window = win;
  globalThis.localStorage = localStorageMock;
  globalThis.window.__visterasDock = null;

  return { doc, body, svgEditorEl, sidepanels, storage };
}

test('Panel Dock: mounts #vdock strip and #vdock_flyout with 4 groups', async () => {
  const env = setupMockEnvironment();
  const { mountVisterasPanelDock } = await import('../js/visteras-panel-dock.js');

  const dockApi = mountVisterasPanelDock({ svgEditor: {} });
  assert.ok(dockApi, 'dockApi returned');
  assert.equal(typeof dockApi.open, 'function');
  assert.equal(typeof dockApi.close, 'function');
  assert.equal(typeof dockApi.toggle, 'function');

  const vdock = env.doc.getElementById('vdock');
  assert.ok(vdock, '#vdock created');
  assert.equal(vdock.getAttribute('role'), 'toolbar');

  // Verify 5 groups: color, swatches, stroke, gradient, layers
  const icons = vdock.querySelectorAll('.vdock-icon');
  const panels = icons.map(i => i.dataset.panel);
  assert.deepEqual(panels, ['color', 'swatches', 'stroke', 'gradient', 'effects', 'transparency', 'layers']);

  // Verify flyout exists
  const flyout = env.doc.getElementById('vdock_flyout');
  assert.ok(flyout, '#vdock_flyout created');
  assert.equal(flyout.style.display, 'none');

  // Verify DOM relocation
  const layerPanel = env.doc.getElementById('layerpanel');
  assert.ok(flyout.contains(layerPanel), '#layerpanel moved into flyout');

  const colorPanel = env.doc.getElementById('vcs_color_panel');
  assert.ok(flyout.contains(colorPanel), '#vcs_color_panel moved into flyout');

  const swatchesPanel = env.doc.getElementById('vcs_swatches_panel');
  assert.ok(flyout.contains(swatchesPanel), '#vcs_swatches_panel moved into flyout');
});

test('Panel Dock: open, close, and toggle API switches panels and updates header', async () => {
  setupMockEnvironment();
  const { mountVisterasPanelDock } = await import('../js/visteras-panel-dock.js');
  const dockApi = mountVisterasPanelDock({ svgEditor: {} });

  // Open Color
  dockApi.open('color');
  assert.equal(dockApi.isOpen('color'), true);
  assert.equal(dockApi.isOpen(), true);
  const flyout = document.getElementById('vdock_flyout');
  assert.equal(flyout.style.display, 'flex');

  // Open Stroke: displays Stroke title
  dockApi.open('stroke');
  assert.equal(dockApi.isOpen('stroke'), true);
  const titleSlot = document.getElementById('vdock_header_title_slot');
  assert.equal(titleSlot.querySelector('.vdock-flyout-title')?.textContent, 'Stroke');

  // Open Gradient: displays Gradient title
  dockApi.open('gradient');
  assert.equal(dockApi.isOpen('gradient'), true);
  assert.equal(titleSlot.querySelector('.vdock-flyout-title')?.textContent, 'Gradient');

  // Open Layers
  dockApi.open('layers');
  assert.equal(dockApi.isOpen('layers'), true);
  assert.equal(dockApi.isOpen('color'), false);

  // Close flyout
  dockApi.close();
  assert.equal(dockApi.isOpen(), false);
  assert.equal(flyout.style.display, 'none');

  // Toggle Color: closed -> open -> closed
  dockApi.toggle('color');
  assert.equal(dockApi.isOpen('color'), true);
  dockApi.toggle('color');
  assert.equal(dockApi.isOpen('color'), false);
});

test('Panel Dock: Window menu checkmarks synchronize with open dock state', async () => {
  setupMockEnvironment();
  const { mountVisterasPanelDock } = await import('../js/visteras-panel-dock.js');
  const dockApi = mountVisterasPanelDock({ svgEditor: {} });

  const colorItem = document.getElementById('action_window_color');
  const swatchesItem = document.getElementById('action_window_swatches');
  const propItem = document.getElementById('action_window_properties');

  // Initially closed
  dockApi.close();
  assert.equal(colorItem.querySelector('.menu_check')?.textContent, '');
  assert.equal(propItem.querySelector('.menu_check')?.textContent, '✓');

  // Open Swatches
  dockApi.open('swatches');
  assert.equal(swatchesItem.querySelector('.menu_check')?.textContent, '✓');
  assert.equal(colorItem.querySelector('.menu_check')?.textContent, '');

  // Toggle Properties off
  dockApi.toggleProperties();
  assert.equal(propItem.querySelector('.menu_check')?.textContent, '');

  // Toggle Properties back on
  dockApi.toggleProperties();
  assert.equal(propItem.querySelector('.menu_check')?.textContent, '✓');
});

test('Panel Dock: Width resizing is clamped and saved in localStorage', async () => {
  setupMockEnvironment();
  const { mountVisterasPanelDock } = await import('../js/visteras-panel-dock.js');
  const dockApi = mountVisterasPanelDock({ svgEditor: {} });

  const state = dockApi.getState();
  assert.ok(state.width >= 220 && state.width <= 480);

  // Trigger state save
  dockApi.open('color');

  // Saved state in localStorage
  const saved = JSON.parse(localStorage.getItem('visteras-vector-dock'));
  assert.ok(saved);
  assert.equal(saved.v, 1);
  assert.equal(saved.mode, 'iconic');
  assert.equal(saved.open, 'color');
});

test('Panel Dock: Toolbar has no chevron, displays only pressed panel, highlights orange, and toggles on second click', async () => {
  const env = setupMockEnvironment();
  const { mountVisterasPanelDock } = await import('../js/visteras-panel-dock.js');
  const dockApi = mountVisterasPanelDock({ svgEditor: {} });

  const dock = env.doc.getElementById('vdock');
  // 1. No chevron in dock toolbar
  assert.equal(dock.querySelector('#vdock_chevron'), null, 'Dock toolbar does not have chevron');

  // 2. Initial state: all closed
  dockApi.close();
  const colorBtn = dock.querySelector('.vdock-icon[data-panel="color"]');
  const swatchesBtn = dock.querySelector('.vdock-icon[data-panel="swatches"]');
  const colorPane = env.doc.getElementById('vcs_color_panel');
  const swatchesPane = env.doc.getElementById('vcs_swatches_panel');
  const layerPane = env.doc.getElementById('layerpanel');

  assert.equal(colorBtn.getAttribute('pressed'), null);
  assert.equal(colorBtn.classList.contains('active'), false);

  // 3. Open Color panel
  dockApi.open('color');
  assert.equal(dockApi.isOpen('color'), true);
  assert.equal(colorBtn.getAttribute('pressed'), 'true', 'Pressed icon has pressed="true" attribute');
  assert.equal(colorBtn.classList.contains('active'), true, 'Pressed icon has active class');
  assert.equal(swatchesBtn.getAttribute('pressed'), null);
  assert.equal(swatchesBtn.classList.contains('active'), false);

  // Verify only Color pane is active; other panels are not active
  assert.equal(colorPane.classList.contains('active'), true, 'Color panel is active');
  assert.equal(swatchesPane.classList.contains('active'), false, 'Swatches panel is not active');
  assert.equal(layerPane.classList.contains('active'), false, 'Layer panel is not active');

  // Verify CSS defines toolbar orange highlight and single-panel display rules
  const css = fs.readFileSync(dockCssPath, 'utf8');
  assert.match(css, /\.vdock-icon\.active[\s\S]*?border-left:\s*2px solid var\(--studio-orange/);
  assert.match(css, /\.vdock-panel-pane\s*\{[\s\S]*?display:\s*none\s*!important;/);
  assert.match(css, /\.vdock-panel-pane\.active\s*\{[\s\S]*?display:\s*block\s*!important;/);

  // 4. Clicking the same panel icon a second time closes it
  colorBtn.dispatchEvent({ type: 'click' });
  assert.equal(dockApi.isOpen(), false, 'Clicking panel tool a second time closes it');
  assert.equal(colorBtn.getAttribute('pressed'), null);
  assert.equal(colorBtn.classList.contains('active'), false);
  assert.equal(colorPane.classList.contains('active'), false);

  // 5. Gradient tool icon has its own button with Studio gradient ramp icon
  const gradBtn = dock.querySelector('.vdock-icon[data-panel="gradient"]');
  assert.ok(gradBtn, 'Gradient button exists in dock');
  assert.match(gradBtn.getAttribute('title'), /Gradient/);

  const dockJs = fs.readFileSync(path.resolve(vectorRoot, 'js/visteras-panel-dock.js'), 'utf8');
  assert.match(dockJs, /data-panel="gradient"/);
  assert.match(dockJs, /linearGradient id="vdock_gradient_ramp_icon"/);
  assert.match(dockJs, /stop-color="currentColor"/);
  assert.match(dockJs, /rect[^>]*fill="url\(#vdock_gradient_ramp_icon\)"/);

  // Toggling Gradient opens gradient panel and highlights its own icon
  gradBtn.dispatchEvent({ type: 'click' });
  assert.equal(dockApi.isOpen('gradient'), true);
  assert.equal(gradBtn.getAttribute('pressed'), 'true');
  assert.equal(gradBtn.classList.contains('active'), true);
  const gradPane = env.doc.getElementById('vdock_gradient_panel');
  assert.equal(gradPane.classList.contains('active'), true);
  // The old "coming in a future update" stub is gone; the real panel mounts into this pane.
  assert.doesNotMatch(dockJs, /coming in a future update|vdock-gradient-stub-text|vdock-gradient-ramp-preview/);
});


