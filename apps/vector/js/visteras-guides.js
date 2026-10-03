/**
 * Visteras Vector — Smart Guides & Ruler Guides (Illustrator & Studio Parity)
 *
 * 1. Ruler Guides:
 *    - Click & drag from top ruler (#ruler_x) to create horizontal guides.
 *    - Click & drag from left ruler (#ruler_y) to create vertical guides.
 *    - Existing guides can be hovered and dragged to reposition.
 *    - Dragging a guide back onto the ruler or off-canvas deletes it.
 *    - Toggle Guides (⌘; / Ctrl+;), Lock Guides (⌥⌘; / Alt+Ctrl+;), Clear Guides.
 *    - Crisp 1px non-scaling-stroke vector rendering in cyan (#00c8ff).
 *
 * 2. Smart Guides (⌘U / Ctrl+U):
 *    - Dynamic alignment guides when dragging/transforming elements in select mode.
 *    - Snaps to center and edges of other elements, artboard, and ruler guides.
 *    - Renders high-visibility magenta (#ff007f) alignment lines spanning aligned objects.
 *    - Automatically clears when drag finishes.
 */

const NS = 'http://www.w3.org/2000/svg';
const STORAGE_KEY_SMART_GUIDES = 'visteras_smart_guides_enabled';
const STORAGE_KEY_SHOW_GUIDES = 'visteras_show_ruler_guides';
const STORAGE_KEY_LOCK_GUIDES = 'visteras_lock_ruler_guides';

export class GuideManager {
  constructor(editor) {
    this.editor = editor;
    this.sc = editor?.svgCanvas;
    this.rulerGuides = []; // Array of { id, type: 'h'|'v', pos: number }
    this.showGuides = true;
    this.lockGuides = false;
    this.smartGuidesEnabled = true;

    this.rulerGuidesLayer = null;
    this.smartGuidesLayer = null;
    this.activeDragGuide = null;

    this._loadSettings();
  }

  _loadSettings() {
    try {
      const storedSmart = localStorage.getItem(STORAGE_KEY_SMART_GUIDES);
      if (storedSmart !== null) this.smartGuidesEnabled = storedSmart === '1';

      const storedShow = localStorage.getItem(STORAGE_KEY_SHOW_GUIDES);
      if (storedShow !== null) this.showGuides = storedShow !== '0';

      const storedLock = localStorage.getItem(STORAGE_KEY_LOCK_GUIDES);
      if (storedLock !== null) this.lockGuides = storedLock === '1';
    } catch (_) {}
  }

  _saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY_SMART_GUIDES, this.smartGuidesEnabled ? '1' : '0');
      localStorage.setItem(STORAGE_KEY_SHOW_GUIDES, this.showGuides ? '1' : '0');
      localStorage.setItem(STORAGE_KEY_LOCK_GUIDES, this.lockGuides ? '1' : '0');
    } catch (_) {}
  }

  init() {
    this._ensureLayers();
    this._bindRulerDrag();
    this._bindSmartGuides();
    this._bindMenuActions();
    this._bindShortcuts();
    this.renderRulerGuides();

    if (typeof window !== 'undefined') {
      window.addEventListener?.('visteras:canvas-reset', () => this.onCanvasReset());
      window.addEventListener?.('visteras:document-switched', (e) => {
        this.onCanvasReset();
        if (e.detail?.doc?.rulerGuides) {
          this.setGuides(e.detail.doc.rulerGuides);
        }
      });
    }
  }

  onCanvasReset() {
    this.rulerGuidesLayer = null;
    this.smartGuidesLayer = null;
    this._ensureLayers();
    this.renderRulerGuides();
  }

  getGuides() {
    return this.rulerGuides.slice();
  }

  setGuides(guides) {
    this.rulerGuides = Array.isArray(guides) ? guides.slice() : [];
    this.renderRulerGuides();
  }

  _ensureLayers() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    const svgContent = this.sc?.getSvgContent?.() || document.getElementById('svgcontent');
    if (!svgContent) return;

    const rulerConnected = typeof this.rulerGuidesLayer?.isConnected === 'boolean' ? this.rulerGuidesLayer.isConnected : true;
    const rulerContained = typeof svgContent.contains === 'function' && this.rulerGuidesLayer ? svgContent.contains(this.rulerGuidesLayer) : true;
    if (!this.rulerGuidesLayer || !rulerConnected || !rulerContained) {
      let guidesGroup = document.getElementById('visteras_ruler_guides');
      if (!guidesGroup || (typeof svgContent.contains === 'function' && !svgContent.contains(guidesGroup))) {
        if (typeof document.createElementNS === 'function') {
          guidesGroup = document.createElementNS(NS, 'g');
          guidesGroup.setAttribute('id', 'visteras_ruler_guides');
          guidesGroup.setAttribute('class', 'visteras-guides-layer');
          guidesGroup.setAttribute('style', 'pointer-events: all;');
          svgContent.append(guidesGroup);
        }
      }
      if (guidesGroup) this.rulerGuidesLayer = guidesGroup;
    }

    // Smart guides layer belongs in svgRoot (above selectorParentGroup and transform handles)
    const svgRoot = this.sc?.getSvgRoot?.() || (typeof document !== 'undefined' && typeof document.getElementById === 'function' ? document.getElementById('svgroot') : null);
    const smartParent = svgRoot || svgContent;
    const smartConnected = typeof this.smartGuidesLayer?.isConnected === 'boolean' ? this.smartGuidesLayer.isConnected : true;
    const smartContained = typeof smartParent.contains === 'function' && this.smartGuidesLayer ? smartParent.contains(this.smartGuidesLayer) : true;
    if (!this.smartGuidesLayer || !smartConnected || !smartContained) {
      let smartGroup = document.getElementById('visteras_smart_guides');
      if (!smartGroup || (typeof smartParent.contains === 'function' && !smartParent.contains(smartGroup))) {
        if (typeof document.createElementNS === 'function') {
          smartGroup = document.createElementNS(NS, 'g');
          smartGroup.setAttribute('id', 'visteras_smart_guides');
          smartGroup.setAttribute('class', 'visteras-smart-guides-layer');
          smartGroup.setAttribute('style', 'pointer-events: none;');
          smartParent.append(smartGroup);
        }
      }
      if (smartGroup) this.smartGuidesLayer = smartGroup;
    }

    // Always ensure smart guides layer is positioned above selectorParentGroup and transform handles
    const selectorParent = (typeof document !== 'undefined' && typeof document.getElementById === 'function') ? document.getElementById('selectorParentGroup') : null;
    if (this.smartGuidesLayer && smartParent) {
      if (selectorParent && selectorParent.parentNode === smartParent) {
        if (selectorParent.nextSibling !== this.smartGuidesLayer && typeof selectorParent.after === 'function') {
          selectorParent.after(this.smartGuidesLayer);
        }
      } else if (smartParent.lastElementChild !== this.smartGuidesLayer && typeof smartParent.append === 'function') {
        smartParent.append(this.smartGuidesLayer);
      }
    }

    // Synchronize coordinate transform if smartParent is svgRoot
    if (this.smartGuidesLayer && smartParent === svgRoot && svgContent.getScreenCTM && svgRoot.getScreenCTM) {
      try {
        const rootCTM = svgRoot.getScreenCTM();
        const contentCTM = svgContent.getScreenCTM();
        if (rootCTM && contentCTM && typeof DOMMatrix !== 'undefined') {
          const rootM = new DOMMatrix([rootCTM.a, rootCTM.b, rootCTM.c, rootCTM.d, rootCTM.e, rootCTM.f]);
          const contentM = new DOMMatrix([contentCTM.a, contentCTM.b, contentCTM.c, contentCTM.d, contentCTM.e, contentCTM.f]);
          const m = rootM.inverse().multiply(contentM);
          this.smartGuidesLayer.setAttribute('transform', `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
        }
      } catch (_) {}
    }
  }

  clientToSvg(clientX, clientY) {
    const svgContent = this.sc?.getSvgContent?.() || document.getElementById('svgcontent');
    if (!svgContent) return { x: clientX, y: clientY };
    const ctm = svgContent.getScreenCTM();
    if (!ctm) return { x: clientX, y: clientY };
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  }

  /* -------------------------------------------------------------------------
   * Ruler Guides Management
   * ------------------------------------------------------------------------- */

  addGuide(type, pos) {
    const id = `guide_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const roundedPos = Math.round(pos * 100) / 100;
    const guide = { id, type, pos: roundedPos };
    this.rulerGuides.push(guide);
    this.showGuides = true;
    this.renderRulerGuides();
    this.updateUI();
    return guide;
  }

  removeGuide(id) {
    const idx = this.rulerGuides.findIndex(g => g.id === id);
    if (idx !== -1) {
      this.rulerGuides.splice(idx, 1);
      this.renderRulerGuides();
      this.updateUI();
      return true;
    }
    return false;
  }

  clearGuides() {
    this.rulerGuides = [];
    this.renderRulerGuides();
    this.updateUI();
  }

  toggleShowGuides(force = null, notify = false) {
    this.showGuides = force !== null ? force : !this.showGuides;
    this._saveSettings();
    this.renderRulerGuides();
    this.updateUI();
    if (notify && typeof window !== 'undefined' && window.showStudioToast) {
      window.showStudioToast(this.showGuides ? 'Guides: Visible' : 'Guides: Hidden', 'info', 1500);
    }
  }

  toggleLockGuides(force = null, notify = false) {
    this.lockGuides = force !== null ? force : !this.lockGuides;
    this._saveSettings();
    this.renderRulerGuides();
    this.updateUI();
    if (notify && typeof window !== 'undefined' && window.showStudioToast) {
      window.showStudioToast(this.lockGuides ? 'Guides: Locked' : 'Guides: Unlocked', 'info', 1500);
    }
  }

  toggleSmartGuides(force = null, notify = false) {
    this.smartGuidesEnabled = force !== null ? force : !this.smartGuidesEnabled;
    this._saveSettings();
    this.clearSmartGuides();
    this.updateUI();
    if (notify && typeof window !== 'undefined' && window.showStudioToast) {
      window.showStudioToast(this.smartGuidesEnabled ? 'Smart Guides: On' : 'Smart Guides: Off', 'info', 1500);
    }
  }

  renderRulerGuides() {
    this._ensureLayers();
    if (!this.rulerGuidesLayer) return;

    this.rulerGuidesLayer.innerHTML = '';
    if (!this.showGuides) {
      this.rulerGuidesLayer.style.display = 'none';
      return;
    }
    this.rulerGuidesLayer.style.display = '';

    for (const g of this.rulerGuides) {
      const gWrap = document.createElementNS(NS, 'g');
      gWrap.setAttribute('class', 'visteras-guide-wrap');
      gWrap.setAttribute('data-guide-id', g.id);

      // 1. Transparent wider hit line (makes grabbing easy)
      const hitLine = document.createElementNS(NS, 'line');
      hitLine.setAttribute('stroke', 'transparent');
      hitLine.setAttribute('stroke-width', '10');
      hitLine.setAttribute('vector-effect', 'non-scaling-stroke');
      hitLine.style.cursor = this.lockGuides ? 'default' : (g.type === 'h' ? 'row-resize' : 'col-resize');

      // 2. Visible crisp cyan guide line
      const visLine = document.createElementNS(NS, 'line');
      visLine.setAttribute('stroke', '#00c8ff');
      visLine.setAttribute('stroke-width', '1');
      visLine.setAttribute('vector-effect', 'non-scaling-stroke');
      visLine.setAttribute('class', `visteras-ruler-guide visteras-ruler-guide-${g.type}`);

      if (g.type === 'h') {
        hitLine.setAttribute('x1', '-100000');
        hitLine.setAttribute('y1', String(g.pos));
        hitLine.setAttribute('x2', '100000');
        hitLine.setAttribute('y2', String(g.pos));

        visLine.setAttribute('x1', '-100000');
        visLine.setAttribute('y1', String(g.pos));
        visLine.setAttribute('x2', '100000');
        visLine.setAttribute('y2', String(g.pos));
      } else {
        hitLine.setAttribute('x1', String(g.pos));
        hitLine.setAttribute('y1', '-100000');
        hitLine.setAttribute('x2', String(g.pos));
        hitLine.setAttribute('y2', '100000');

        visLine.setAttribute('x1', String(g.pos));
        visLine.setAttribute('y1', '-100000');
        visLine.setAttribute('x2', String(g.pos));
        visLine.setAttribute('y2', '100000');
      }

      gWrap.append(hitLine, visLine);

      // Drag existing guide
      if (!this.lockGuides) {
        gWrap.addEventListener('mousedown', (e) => {
          if (e.button === 0) {
            e.preventDefault();
            e.stopPropagation();
            this._startExistingGuideDrag(g, e);
          }
        });
      }

      this.rulerGuidesLayer.append(gWrap);
    }
  }

  /* -------------------------------------------------------------------------
   * Ruler Drag & Drop Interaction
   * ------------------------------------------------------------------------- */

  _bindRulerDrag() {
    if (typeof document === 'undefined') return;

    const rulerX = document.getElementById('ruler_x');
    const rulerY = document.getElementById('ruler_y');

    if (rulerX) {
      rulerX.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
          e.preventDefault();
          this._startNewGuideDrag('h', e);
        }
      }, true);
    }

    if (rulerY) {
      rulerY.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
          e.preventDefault();
          this._startNewGuideDrag('v', e);
        }
      }, true);
    }
  }

  _startNewGuideDrag(type, startEvent) {
    const isHorizontal = type === 'h';
    document.body.style.cursor = isHorizontal ? 'row-resize' : 'col-resize';

    // Temporary live drag guide line
    this._ensureLayers();
    const liveLine = document.createElementNS(NS, 'line');
    liveLine.setAttribute('stroke', '#00c8ff');
    liveLine.setAttribute('stroke-width', '1');
    liveLine.setAttribute('stroke-dasharray', '4,3');
    liveLine.setAttribute('vector-effect', 'non-scaling-stroke');
    liveLine.setAttribute('id', 'visteras_active_drag_guide');
    this.rulerGuidesLayer?.append(liveLine);

    const onMouseMove = (e) => {
      const pt = this.clientToSvg(e.clientX, e.clientY);
      const val = isHorizontal ? pt.y : pt.x;
      const rounded = e.shiftKey ? Math.round(val / 10) * 10 : Math.round(val);

      if (isHorizontal) {
        liveLine.setAttribute('x1', '-100000');
        liveLine.setAttribute('y1', String(rounded));
        liveLine.setAttribute('x2', '100000');
        liveLine.setAttribute('y2', String(rounded));
      } else {
        liveLine.setAttribute('x1', String(rounded));
        liveLine.setAttribute('y1', '-100000');
        liveLine.setAttribute('x2', String(rounded));
        liveLine.setAttribute('y2', '100000');
      }
    };

    const onMouseUp = (e) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      liveLine.remove();

      // Check if dropped back on ruler (cancel)
      const rulerX = document.getElementById('ruler_x');
      const rulerY = document.getElementById('ruler_y');
      const rxRect = rulerX?.getBoundingClientRect();
      const ryRect = rulerY?.getBoundingClientRect();

      const droppedOnRuler =
        (isHorizontal && rxRect && e.clientY <= rxRect.bottom) ||
        (!isHorizontal && ryRect && e.clientX <= ryRect.right);

      if (!droppedOnRuler) {
        const pt = this.clientToSvg(e.clientX, e.clientY);
        const val = isHorizontal ? pt.y : pt.x;
        const rounded = e.shiftKey ? Math.round(val / 10) * 10 : Math.round(val);
        this.addGuide(type, rounded);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  _startExistingGuideDrag(guide, startEvent) {
    const isHorizontal = guide.type === 'h';
    document.body.style.cursor = isHorizontal ? 'row-resize' : 'col-resize';

    // Remove the original guide element during drag
    this.removeGuide(guide.id);

    const liveLine = document.createElementNS(NS, 'line');
    liveLine.setAttribute('stroke', '#00c8ff');
    liveLine.setAttribute('stroke-width', '1');
    liveLine.setAttribute('vector-effect', 'non-scaling-stroke');
    this.rulerGuidesLayer?.append(liveLine);

    const onMouseMove = (e) => {
      const pt = this.clientToSvg(e.clientX, e.clientY);
      const val = isHorizontal ? pt.y : pt.x;
      const rounded = e.shiftKey ? Math.round(val / 10) * 10 : Math.round(val);

      if (isHorizontal) {
        liveLine.setAttribute('x1', '-100000');
        liveLine.setAttribute('y1', String(rounded));
        liveLine.setAttribute('x2', '100000');
        liveLine.setAttribute('y2', String(rounded));
      } else {
        liveLine.setAttribute('x1', String(rounded));
        liveLine.setAttribute('y1', '-100000');
        liveLine.setAttribute('x2', String(rounded));
        liveLine.setAttribute('y2', '100000');
      }
    };

    const onMouseUp = (e) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      liveLine.remove();

      // If dragged back to ruler, it's deleted!
      const rulerX = document.getElementById('ruler_x');
      const rulerY = document.getElementById('ruler_y');
      const rxRect = rulerX?.getBoundingClientRect();
      const ryRect = rulerY?.getBoundingClientRect();

      const droppedOnRuler =
        (isHorizontal && rxRect && e.clientY <= rxRect.bottom) ||
        (!isHorizontal && ryRect && e.clientX <= ryRect.right);

      if (!droppedOnRuler) {
        const pt = this.clientToSvg(e.clientX, e.clientY);
        const val = isHorizontal ? pt.y : pt.x;
        const rounded = e.shiftKey ? Math.round(val / 10) * 10 : Math.round(val);
        this.addGuide(guide.type, rounded);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  /* -------------------------------------------------------------------------
   * Smart Guides Engine
   * ------------------------------------------------------------------------- */

  _bindSmartGuides() {
    if (!this.sc) return;

    // Wrap sc.call to intercept 'transition' and 'changed' events from SVGEdit
    if (this.sc.call && !this._origScCall) {
      this._origScCall = this.sc.call;
      const self = this;
      this.sc.call = function (event, ...args) {
        const result = self._origScCall.apply(this, [event, ...args]);
        try {
          if (event === 'transition') {
            const elements = args[0];
            if (self.smartGuidesEnabled && elements && elements.length) {
              const delta = (self._startPos && self._lastMousePos)
                ? { dx: self._lastMousePos.x - self._startPos.x, dy: self._lastMousePos.y - self._startPos.y }
                : null;
              self.evaluateSmartSnap(elements, delta, { applyDirectSnap: true });
            }
          } else if (event === 'changed') {
            self.clearSmartGuides();
          }
        } catch (_) {}
        return result;
      };
    }

    if (typeof window !== 'undefined') {
      let isMouseDown = false;
      const workarea = document.getElementById('workarea') || window;
      workarea.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
          isMouseDown = true;
          this._startPos = this.clientToSvg(e.clientX, e.clientY);
          this._lastMousePos = { ...this._startPos };
          const sel = this.sc?.getSelectedElements?.() || [];
          if (sel.length > 0) {
            this._startDragBBox = this._getCombinedBBox(sel);
          } else {
            this._startDragBBox = null;
          }
        }
      }, true);

      window.addEventListener('mouseup', () => {
        isMouseDown = false;
        this._startPos = null;
        this._lastMousePos = null;
        this._startDragBBox = null;
        this._lastSnappedTargetX = null;
        this._lastSnappedTargetY = null;
        this.clearSmartGuides();
      }, true);

      window.addEventListener('mousemove', (e) => {
        if (!isMouseDown) return;
        this._lastMousePos = this.clientToSvg(e.clientX, e.clientY);
      }, true);
    }
  }

  clearSmartGuides() {
    if (this.smartGuidesLayer) {
      this.smartGuidesLayer.innerHTML = '';
    }
  }

  _createCrosshair(x, y) {
    if (typeof document === 'undefined' || typeof document.createElementNS !== 'function') return null;
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'visteras-smart-marker');

    const l1 = document.createElementNS(NS, 'line');
    l1.setAttribute('x1', String(x - 3));
    l1.setAttribute('y1', String(y - 3));
    l1.setAttribute('x2', String(x + 3));
    l1.setAttribute('y2', String(y + 3));
    l1.setAttribute('stroke', '#fa229b');
    l1.setAttribute('stroke-width', '1');
    l1.setAttribute('vector-effect', 'non-scaling-stroke');

    const l2 = document.createElementNS(NS, 'line');
    l2.setAttribute('x1', String(x - 3));
    l2.setAttribute('y1', String(y + 3));
    l2.setAttribute('x2', String(x + 3));
    l2.setAttribute('y2', String(y - 3));
    l2.setAttribute('stroke', '#fa229b');
    l2.setAttribute('stroke-width', '1');
    l2.setAttribute('vector-effect', 'non-scaling-stroke');

    g.append(l1, l2);
    return g;
  }

  _createLabel(x, y, text) {
    if (typeof document === 'undefined' || typeof document.createElementNS !== 'function') return null;
    const txt = document.createElementNS(NS, 'text');
    txt.setAttribute('class', 'visteras-smart-label');
    txt.setAttribute('x', String(x + 5));
    txt.setAttribute('y', String(y - 4));
    txt.setAttribute('fill', '#fa229b');
    txt.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif');
    txt.setAttribute('font-size', '10px');
    txt.setAttribute('font-weight', '500');
    txt.setAttribute('vector-effect', 'non-scaling-stroke');
    txt.textContent = text;
    return txt;
  }

  _createDeltaBadge(x, y, dx, dy) {
    if (typeof document === 'undefined' || typeof document.createElementNS !== 'function') return null;
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'visteras-smart-badge');

    const formatDelta = (val) => `${Math.abs(val) < 0.005 ? '0' : Number(val.toFixed(2))} px`;
    const line1Text = `dX: ${formatDelta(dx)}`;
    const line2Text = `dY: ${formatDelta(dy)}`;

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(Math.round(x)));
    rect.setAttribute('y', String(Math.round(y)));
    rect.setAttribute('width', '88');
    rect.setAttribute('height', '36');
    rect.setAttribute('rx', '4');
    rect.setAttribute('ry', '4');
    rect.setAttribute('fill', '#cccccc');
    rect.setAttribute('fill-opacity', '0.94');
    rect.setAttribute('stroke', 'rgba(0, 0, 0, 0.15)');
    rect.setAttribute('stroke-width', '1');

    const t1 = document.createElementNS(NS, 'text');
    t1.setAttribute('x', String(Math.round(x) + 8));
    t1.setAttribute('y', String(Math.round(y) + 15));
    t1.setAttribute('fill', '#1a1a1a');
    t1.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif');
    t1.setAttribute('font-size', '10px');
    t1.setAttribute('font-weight', '500');
    t1.textContent = line1Text;

    const t2 = document.createElementNS(NS, 'text');
    t2.setAttribute('x', String(Math.round(x) + 8));
    t2.setAttribute('y', String(Math.round(y) + 29));
    t2.setAttribute('fill', '#1a1a1a');
    t2.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif');
    t2.setAttribute('font-size', '10px');
    t2.setAttribute('font-weight', '500');
    t2.textContent = line2Text;

    g.append(rect, t1, t2);
    return g;
  }

  drawSmartGuideLine(type, pos, minExtent = -10000, maxExtent = 10000) {
    this._ensureLayers();
    if (!this.smartGuidesLayer) return;

    const line = document.createElementNS(NS, 'line');
    line.setAttribute('stroke', '#fa229b'); // Classic Illustrator magenta/pink smart guide
    line.setAttribute('stroke-width', '1');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    line.setAttribute('class', 'visteras-smart-guide');

    if (type === 'h') {
      line.setAttribute('x1', String(minExtent));
      line.setAttribute('y1', String(pos));
      line.setAttribute('x2', String(maxExtent));
      line.setAttribute('y2', String(pos));
    } else {
      line.setAttribute('x1', String(pos));
      line.setAttribute('y1', String(minExtent));
      line.setAttribute('x2', String(pos));
      line.setAttribute('y2', String(maxExtent));
    }

    this.smartGuidesLayer.append(line);
  }

  _getElementSceneBBox(el) {
    if (!el || el.nodeType !== 1) return null;
    try {
      if (typeof DOMMatrix !== 'undefined' && el.getScreenCTM && this.sc?.getSvgContent) {
        const svgContent = this.sc.getSvgContent();
        if (svgContent?.getScreenCTM) {
          const sRoot = svgContent.getScreenCTM();
          const sEl = el.getScreenCTM();
          if (sRoot && sEl) {
            const rootM = new DOMMatrix([sRoot.a, sRoot.b, sRoot.c, sRoot.d, sRoot.e, sRoot.f]);
            const elM = new DOMMatrix([sEl.a, sEl.b, sEl.c, sEl.d, sEl.e, sEl.f]);
            const m = rootM.inverse().multiply(elM);
            const b = el.getBBox();
            if (b && (b.width > 0 || b.height > 0)) {
              const pts = [
                new DOMPoint(b.x, b.y).matrixTransform(m),
                new DOMPoint(b.x + b.width, b.y).matrixTransform(m),
                new DOMPoint(b.x, b.y + b.height).matrixTransform(m),
                new DOMPoint(b.x + b.width, b.y + b.height).matrixTransform(m),
              ];
              const minX = Math.min(...pts.map(p => p.x));
              const maxX = Math.max(...pts.map(p => p.x));
              const minY = Math.min(...pts.map(p => p.y));
              const maxY = Math.max(...pts.map(p => p.y));
              return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
            }
          }
        }
      }
    } catch (_) {}
    try {
      const b = el.getBBox?.();
      if (b) return { x: b.x, y: b.y, width: b.width, height: b.height };
    } catch (_) {}
    return null;
  }

  _applySnapOffset(movingElements, snapDx, snapDy) {
    if ((!snapDx && !snapDy) || !movingElements || !movingElements.length) return;

    // Filter to top-level roots only to avoid double-translating children of selected groups
    const movingRoots = movingElements.filter(el => !movingElements.some(parent => parent !== el && parent.contains?.(el)));

    for (const el of movingRoots) {
      if (!el || el.nodeType !== 1) continue;

      let applied = false;
      // 1. Check if el has transform.baseVal with an existing translate transform (SVGEdit drag convention)
      try {
        const tList = el.transform?.baseVal;
        if (tList && typeof tList.numberOfItems === 'number' && tList.numberOfItems > 0) {
          const first = tList.getItem(0);
          if (first && (first.type === 2 || (typeof SVGTransform !== 'undefined' && first.type === SVGTransform.SVG_TRANSFORM_TRANSLATE))) {
            const curX = (first.matrix && typeof first.matrix.e === 'number') ? first.matrix.e : 0;
            const curY = (first.matrix && typeof first.matrix.f === 'number') ? first.matrix.f : 0;
            const newX = curX + snapDx;
            const newY = curY + snapDy;
            const svgRoot = this.sc?.getSvgRoot?.() || (typeof document !== 'undefined' && typeof document.getElementById === 'function' ? document.getElementById('svgroot') : null);
            const tf = svgRoot?.createSVGTransform?.() || el.ownerSVGElement?.createSVGTransform?.();
            if (tf && typeof tList.replaceItem === 'function') {
              tf.setTranslate(newX, newY);
              tList.replaceItem(tf, 0);
            } else {
              first.setTranslate(newX, newY);
            }
            applied = true;
          }
        }
      } catch (_) {}

      // 2. Direct attribute manipulation if not applied via transform.baseVal
      if (!applied) {
        try {
          const currentTransform = el.getAttribute?.('transform') || '';
          const match = currentTransform.match(/translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/);
          if (match) {
            const curX = parseFloat(match[1]) || 0;
            const curY = parseFloat(match[2]) || 0;
            const newX = curX + snapDx;
            const newY = curY + snapDy;
            const updated = currentTransform.replace(match[0], `translate(${newX}, ${newY})`);
            el.setAttribute('transform', updated);
            applied = true;
          } else if (currentTransform.startsWith('matrix(')) {
            const parts = currentTransform.slice(7, -1).trim().split(/[\s,]+/);
            if (parts.length === 6) {
              parts[4] = String((parseFloat(parts[4]) || 0) + snapDx);
              parts[5] = String((parseFloat(parts[5]) || 0) + snapDy);
              el.setAttribute('transform', `matrix(${parts.join(' ')})`);
              applied = true;
            }
          } else if (currentTransform) {
            el.setAttribute('transform', `translate(${snapDx}, ${snapDy}) ${currentTransform}`);
            applied = true;
          } else {
            el.setAttribute('transform', `translate(${snapDx}, ${snapDy})`);
            applied = true;
          }
        } catch (_) {}
      }

      // 3. Support mock bounds / elements in unit tests
      if (el._bbox) {
        el._bbox.x += snapDx;
        el._bbox.y += snapDy;
      }
      if (el._mockBBox) {
        el._mockBBox.x += snapDx;
        el._mockBBox.y += snapDy;
      }

      try {
        this.sc?.selectorManager?.requestSelector?.(el)?.resize?.();
      } catch (_) {}
    }
  }

  evaluateSmartSnap(movingElements, delta = null, options = {}) {
    if (!this.smartGuidesEnabled || !movingElements || !movingElements.length) {
      this.clearSmartGuides();
      return null;
    }
    this._ensureLayers();
    this.clearSmartGuides();

    const movingSet = new Set(movingElements);
    const movingBBox = this._getCombinedBBox(movingElements);
    if (!movingBBox) return null;

    if (!delta) {
      if (!this._startDragBBox) {
        this._startDragBBox = { ...movingBBox };
      }
      delta = {
        dx: movingBBox.x - this._startDragBBox.x,
        dy: movingBBox.y - this._startDragBBox.y
      };
    }

    const zoom = this.sc?.getZoom?.() || 1;
    const baseSnapThreshold = 8 / zoom; // 8 screen pixels base tolerance
    const snapThresholdX = (this._lastSnappedTargetX !== null && this._lastSnappedTargetX !== undefined)
      ? baseSnapThreshold * 1.5
      : baseSnapThreshold;
    const snapThresholdY = (this._lastSnappedTargetY !== null && this._lastSnappedTargetY !== undefined)
      ? baseSnapThreshold * 1.5
      : baseSnapThreshold;

    const movingX = [
      { val: movingBBox.x, name: 'left', type: 'endpoint' },
      { val: movingBBox.x + movingBBox.width / 2, name: 'center', type: 'midpoint' },
      { val: movingBBox.x + movingBBox.width, name: 'right', type: 'endpoint' }
    ];

    const movingY = [
      { val: movingBBox.y, name: 'top', type: 'endpoint' },
      { val: movingBBox.y + movingBBox.height / 2, name: 'center', type: 'midpoint' },
      { val: movingBBox.y + movingBBox.height, name: 'bottom', type: 'endpoint' }
    ];

    // Collect snap candidates
    const candidatesX = [];
    const candidatesY = [];

    // 1. Artboard boundaries & center / middle
    const res = this.sc?.getResolution?.() || { w: 800, h: 600 };
    const abW = Number(res.w ?? res.width ?? 800);
    const abH = Number(res.h ?? res.height ?? 600);

    // Artboard Left
    candidatesX.push({
      val: 0,
      label: 'artboard',
      type: 'artboard',
      min: Math.min(0, movingBBox.y) - 20,
      max: Math.max(abH, movingBBox.y + movingBBox.height) + 20,
      markers: [
        { x: 0, y: 0, label: 'artboard' },
        { x: 0, y: abH, label: 'artboard' }
      ]
    });
    // Artboard Center
    candidatesX.push({
      val: abW / 2,
      label: 'center',
      type: 'center',
      min: Math.min(0, movingBBox.y) - 20,
      max: Math.max(abH, movingBBox.y + movingBBox.height) + 20,
      markers: [
        { x: abW / 2, y: abH / 2, label: 'center' }
      ]
    });
    // Artboard Right
    candidatesX.push({
      val: abW,
      label: 'artboard',
      type: 'artboard',
      min: Math.min(0, movingBBox.y) - 20,
      max: Math.max(abH, movingBBox.y + movingBBox.height) + 20,
      markers: [
        { x: abW, y: 0, label: 'artboard' },
        { x: abW, y: abH, label: 'artboard' }
      ]
    });

    // Artboard Top
    candidatesY.push({
      val: 0,
      label: 'artboard',
      type: 'artboard',
      min: Math.min(0, movingBBox.x) - 20,
      max: Math.max(abW, movingBBox.x + movingBBox.width) + 20,
      markers: [
        { x: 0, y: 0, label: 'artboard' },
        { x: abW, y: 0, label: 'artboard' }
      ]
    });
    // Artboard Middle (Center)
    candidatesY.push({
      val: abH / 2,
      label: 'center',
      type: 'center',
      min: Math.min(0, movingBBox.x) - 20,
      max: Math.max(abW, movingBBox.x + movingBBox.width) + 20,
      markers: [
        { x: abW / 2, y: abH / 2, label: 'center' }
      ]
    });
    // Artboard Bottom
    candidatesY.push({
      val: abH,
      label: 'artboard',
      type: 'artboard',
      min: Math.min(0, movingBBox.x) - 20,
      max: Math.max(abW, movingBBox.x + movingBBox.width) + 20,
      markers: [
        { x: 0, y: abH, label: 'artboard' },
        { x: abW, y: abH, label: 'artboard' }
      ]
    });

    // 2. Active Ruler Guides
    if (this.showGuides) {
      for (const g of this.rulerGuides) {
        if (g.type === 'v') {
          candidatesX.push({
            val: g.pos,
            label: 'guide',
            type: 'guide',
            min: Math.min(0, movingBBox.y) - 50,
            max: Math.max(abH, movingBBox.y + movingBBox.height) + 50,
            markers: []
          });
        }
        if (g.type === 'h') {
          candidatesY.push({
            val: g.pos,
            label: 'guide',
            type: 'guide',
            min: Math.min(0, movingBBox.x) - 50,
            max: Math.max(abW, movingBBox.x + movingBBox.width) + 50,
            markers: []
          });
        }
      }
    }

    // 3. Other elements on canvas (across all layers and groups)
    const svgContent = this.sc?.getSvgContent?.() || (typeof document !== 'undefined' && typeof document.getElementById === 'function' ? document.getElementById('svgcontent') : null);
    if (svgContent) {
      const targets = svgContent.querySelectorAll ? svgContent.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon, text, image, g:not(.layer):not(.vclip-group)') : (svgContent.children || []);
      for (const sib of targets) {
        if (
          movingSet.has(sib) ||
          movingElements.some(m => m.contains?.(sib) || sib.contains?.(m)) ||
          sib.id === 'visteras_ruler_guides' ||
          sib.id === 'visteras_smart_guides' ||
          sib.id === 'canvasBackground' ||
          sib.nodeType !== 1 ||
          sib.closest?.('#visteras_ruler_guides, #visteras_smart_guides, #canvasBackground, defs')
        ) {
          continue;
        }

        const b = this._getElementSceneBBox(sib);
        if (b && (b.width > 0 || b.height > 0)) {
          const minSpanX = Math.min(movingBBox.x, b.x) - 30;
          const maxSpanX = Math.max(movingBBox.x + movingBBox.width, b.x + b.width) + 30;
          const minSpanY = Math.min(movingBBox.y, b.y) - 30;
          const maxSpanY = Math.max(movingBBox.y + movingBBox.height, b.y + b.height) + 30;

          // Sibling X candidates
          candidatesX.push({
            val: b.x,
            label: 'endpoint',
            type: 'sibling',
            min: minSpanY,
            max: maxSpanY,
            markers: [
              { x: b.x, y: b.y, label: 'endpoint' },
              { x: b.x, y: b.y + b.height / 2, label: 'midpoint' },
              { x: b.x, y: b.y + b.height, label: 'endpoint' }
            ]
          });
          candidatesX.push({
            val: b.x + b.width / 2,
            label: 'midpoint',
            type: 'sibling',
            min: minSpanY,
            max: maxSpanY,
            markers: [
              { x: b.x + b.width / 2, y: b.y, label: 'midpoint' },
              { x: b.x + b.width / 2, y: b.y + b.height / 2, label: 'center' },
              { x: b.x + b.width / 2, y: b.y + b.height, label: 'midpoint' }
            ]
          });
          candidatesX.push({
            val: b.x + b.width,
            label: 'endpoint',
            type: 'sibling',
            min: minSpanY,
            max: maxSpanY,
            markers: [
              { x: b.x + b.width, y: b.y, label: 'endpoint' },
              { x: b.x + b.width, y: b.y + b.height / 2, label: 'midpoint' },
              { x: b.x + b.width, y: b.y + b.height, label: 'endpoint' }
            ]
          });

          // Sibling Y candidates
          candidatesY.push({
            val: b.y,
            label: 'endpoint',
            type: 'sibling',
            min: minSpanX,
            max: maxSpanX,
            markers: [
              { x: b.x, y: b.y, label: 'endpoint' },
              { x: b.x + b.width / 2, y: b.y, label: 'midpoint' },
              { x: b.x + b.width, y: b.y, label: 'endpoint' }
            ]
          });
          candidatesY.push({
            val: b.y + b.height / 2,
            label: 'midpoint',
            type: 'sibling',
            min: minSpanX,
            max: maxSpanX,
            markers: [
              { x: b.x, y: b.y + b.height / 2, label: 'midpoint' },
              { x: b.x + b.width / 2, y: b.y + b.height / 2, label: 'center' },
              { x: b.x + b.width / 2, y: b.y + b.height / 2, label: 'midpoint' }
            ]
          });
          candidatesY.push({
            val: b.y + b.height,
            label: 'endpoint',
            type: 'sibling',
            min: minSpanX,
            max: maxSpanX,
            markers: [
              { x: b.x, y: b.y + b.height, label: 'endpoint' },
              { x: b.x + b.width / 2, y: b.y + b.height, label: 'midpoint' },
              { x: b.x + b.width, y: b.y + b.height, label: 'endpoint' }
            ]
          });
        }
      }
    }

    // Evaluate closest match in X
    let bestMatchX = null;
    let minDiffX = snapThresholdX;
    for (const m of movingX) {
      for (const c of candidatesX) {
        const diff = Math.abs(m.val - c.val);
        if (diff < minDiffX) {
          minDiffX = diff;
          bestMatchX = {
            movingPoint: m,
            targetVal: c.val,
            candidate: c,
            min: c.min,
            max: c.max,
            diff
          };
        }
      }
    }

    // Evaluate closest match in Y
    let bestMatchY = null;
    let minDiffY = snapThresholdY;
    for (const m of movingY) {
      for (const c of candidatesY) {
        const diff = Math.abs(m.val - c.val);
        if (diff < minDiffY) {
          minDiffY = diff;
          bestMatchY = {
            movingPoint: m,
            targetVal: c.val,
            candidate: c,
            min: c.min,
            max: c.max,
            diff
          };
        }
      }
    }

    this._lastSnappedTargetX = bestMatchX ? bestMatchX.targetVal : null;
    this._lastSnappedTargetY = bestMatchY ? bestMatchY.targetVal : null;

    // Display ONLY when objects are actively in a snappable position
    if (!bestMatchX && !bestMatchY) {
      this.clearSmartGuides();
      return {
        activeMatchesX: [],
        activeMatchesY: [],
        snapDx: 0,
        snapDy: 0,
        delta
      };
    }

    const snapDx = bestMatchX ? (bestMatchX.targetVal - bestMatchX.movingPoint.val) : 0;
    const snapDy = bestMatchY ? (bestMatchY.targetVal - bestMatchY.movingPoint.val) : 0;

    // Apply snap displacement directly to moving elements unless caller specifies otherwise
    if (options.applyDirectSnap !== false && (snapDx !== 0 || snapDy !== 0)) {
      this._applySnapOffset(movingElements, snapDx, snapDy);
      movingBBox.x += snapDx;
      movingBBox.y += snapDy;
      if (delta) {
        delta.dx += snapDx;
        delta.dy += snapDy;
      }
    }

    const activeMatchesX = [];
    const seenX = new Set();
    if (bestMatchX) {
      seenX.add(Math.round(bestMatchX.targetVal * 10) / 10);
      activeMatchesX.push(bestMatchX);
    }
    // Also include other candidates aligned at this snapped coordinate
    for (const m of movingX) {
      const snappedVal = m.val + snapDx;
      for (const c of candidatesX) {
        const diff = Math.abs(snappedVal - c.val);
        if (diff < 0.5) {
          const key = Math.round(c.val * 10) / 10;
          if (!seenX.has(key)) {
            seenX.add(key);
            activeMatchesX.push({
              movingPoint: m,
              targetVal: c.val,
              candidate: c,
              min: c.min,
              max: c.max
            });
          }
        }
      }
    }

    const activeMatchesY = [];
    const seenY = new Set();
    if (bestMatchY) {
      seenY.add(Math.round(bestMatchY.targetVal * 10) / 10);
      activeMatchesY.push(bestMatchY);
    }
    for (const m of movingY) {
      const snappedVal = m.val + snapDy;
      for (const c of candidatesY) {
        const diff = Math.abs(snappedVal - c.val);
        if (diff < 0.5) {
          const key = Math.round(c.val * 10) / 10;
          if (!seenY.has(key)) {
            seenY.add(key);
            activeMatchesY.push({
              movingPoint: m,
              targetVal: c.val,
              candidate: c,
              min: c.min,
              max: c.max
            });
          }
        }
      }
    }

    // Marker tracking to avoid duplicate crosshairs
    const seenMarkers = new Set();
    const addMarker = (mx, my, label) => {
      const k = `${Math.round(mx * 10) / 10},${Math.round(my * 10) / 10}`;
      if (seenMarkers.has(k)) return;
      seenMarkers.add(k);
      const cross = this._createCrosshair(mx, my);
      if (cross) this.smartGuidesLayer.append(cross);
      if (label) {
        const lbl = this._createLabel(mx, my, label);
        if (lbl) this.smartGuidesLayer.append(lbl);
      }
    };

    // Render X matches (vertical guides)
    for (const match of activeMatchesX) {
      this.drawSmartGuideLine('v', match.targetVal, match.min, match.max);

      if (match.candidate.type === 'center') {
        addMarker(match.targetVal, abH / 2, 'center');
        addMarker(match.targetVal, movingBBox.y + movingBBox.height / 2, 'center');
      } else if (match.candidate.type === 'artboard') {
        addMarker(match.targetVal, 0, 'artboard');
        addMarker(match.targetVal, abH, 'artboard');
        addMarker(match.targetVal, movingBBox.y, 'endpoint');
        addMarker(match.targetVal, movingBBox.y + movingBBox.height, 'endpoint');
      } else {
        // Sibling
        for (const pt of (match.candidate.markers || [])) {
          addMarker(pt.x, pt.y, pt.label);
        }
        if (match.movingPoint.type === 'endpoint') {
          addMarker(match.targetVal, movingBBox.y, 'endpoint');
          addMarker(match.targetVal, movingBBox.y + movingBBox.height, 'endpoint');
        } else {
          addMarker(match.targetVal, movingBBox.y + movingBBox.height / 2, 'midpoint');
        }
      }
    }

    // Render Y matches (horizontal guides)
    for (const match of activeMatchesY) {
      this.drawSmartGuideLine('h', match.targetVal, match.min, match.max);

      if (match.candidate.type === 'center') {
        addMarker(abW / 2, match.targetVal, 'center');
        addMarker(movingBBox.x + movingBBox.width / 2, match.targetVal, 'center');
      } else if (match.candidate.type === 'artboard') {
        addMarker(0, match.targetVal, 'artboard');
        addMarker(abW, match.targetVal, 'artboard');
        addMarker(movingBBox.x, match.targetVal, 'endpoint');
        addMarker(movingBBox.x + movingBBox.width, match.targetVal, 'endpoint');
      } else {
        // Sibling
        for (const pt of (match.candidate.markers || [])) {
          addMarker(pt.x, pt.y, pt.label);
        }
        if (match.movingPoint.type === 'endpoint') {
          addMarker(movingBBox.x, match.targetVal, 'endpoint');
          addMarker(movingBBox.x + movingBBox.width, match.targetVal, 'endpoint');
        } else {
          addMarker(movingBBox.x + movingBBox.width / 2, match.targetVal, 'midpoint');
        }
        // Mark line extension endpoint
        addMarker(match.max, match.targetVal, match.movingPoint.type === 'midpoint' ? 'midpoint' : 'endpoint');
      }
    }

    // Intersections between X and Y guides
    for (const mx of activeMatchesX) {
      for (const my of activeMatchesY) {
        const isBothCenter = mx.candidate.type === 'center' && my.candidate.type === 'center';
        addMarker(mx.targetVal, my.targetVal, isBothCenter ? 'center' : 'intersect');
      }
    }

    // Render displacement delta badge (dX, dY)
    if (delta && this.smartGuidesLayer) {
      const badgeW = 92;
      const badgeH = 36;
      const badgeX = (movingBBox.x + movingBBox.width + 16 + badgeW > abW)
        ? Math.max(10, movingBBox.x - badgeW - 16)
        : (movingBBox.x + movingBBox.width + 16);
      const badgeY = Math.max(10, Math.min(abH - badgeH - 10, movingBBox.y + movingBBox.height * 0.5 - 10));
      const badge = this._createDeltaBadge(badgeX, badgeY, delta.dx, delta.dy);
      if (badge) this.smartGuidesLayer.append(badge);
    }

    return {
      activeMatchesX,
      activeMatchesY,
      snapDx,
      snapDy,
      delta
    };
  }

  evaluateHandleSnap({ dir, p, b, basis, elements = [], altKey = false }) {
    if (!this.smartGuidesEnabled) {
      this.clearSmartGuides();
      return null;
    }
    this._ensureLayers();
    this.clearSmartGuides();

    const zoom = this.sc?.getZoom?.() || 1;
    const baseSnapThreshold = 8 / zoom;
    const snapThresholdX = (this._lastSnappedTargetX !== null && this._lastSnappedTargetX !== undefined)
      ? baseSnapThreshold * 1.5
      : baseSnapThreshold;
    const snapThresholdY = (this._lastSnappedTargetY !== null && this._lastSnappedTargetY !== undefined)
      ? baseSnapThreshold * 1.5
      : baseSnapThreshold;

    const res = this.sc?.getResolution?.() || { w: 800, h: 600 };
    const abW = Number(res.w ?? res.width ?? 800);
    const abH = Number(res.h ?? res.height ?? 600);

    const candidatesX = [
      { val: 0, label: 'artboard', type: 'artboard' },
      { val: abW / 2, label: 'center', type: 'center' },
      { val: abW, label: 'artboard', type: 'artboard' }
    ];
    const candidatesY = [
      { val: 0, label: 'artboard', type: 'artboard' },
      { val: abH / 2, label: 'center', type: 'center' },
      { val: abH, label: 'artboard', type: 'artboard' }
    ];

    if (this.showGuides) {
      for (const g of this.rulerGuides) {
        if (g.type === 'v') candidatesX.push({ val: g.pos, label: 'guide', type: 'guide' });
        if (g.type === 'h') candidatesY.push({ val: g.pos, label: 'guide', type: 'guide' });
      }
    }

    const movingSet = new Set(elements);
    const svgContent = this.sc?.getSvgContent?.() || (typeof document !== 'undefined' && typeof document.getElementById === 'function' ? document.getElementById('svgcontent') : null);
    if (svgContent) {
      const targets = svgContent.querySelectorAll ? svgContent.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon, text, image, g:not(.layer):not(.vclip-group)') : (svgContent.children || []);
      for (const sib of targets) {
        if (
          movingSet.has(sib) ||
          elements.some(m => m.contains?.(sib) || sib.contains?.(m)) ||
          sib.id === 'visteras_ruler_guides' ||
          sib.id === 'visteras_smart_guides' ||
          sib.id === 'canvasBackground' ||
          sib.nodeType !== 1 ||
          sib.closest?.('#visteras_ruler_guides, #visteras_smart_guides, #canvasBackground, defs')
        ) {
          continue;
        }
        const sb = this._getElementSceneBBox(sib);
        if (sb && (sb.width > 0 || sb.height > 0)) {
          candidatesX.push({ val: sb.x, label: 'endpoint', type: 'sibling' });
          candidatesX.push({ val: sb.x + sb.width / 2, label: 'midpoint', type: 'sibling' });
          candidatesX.push({ val: sb.x + sb.width, label: 'endpoint', type: 'sibling' });

          candidatesY.push({ val: sb.y, label: 'endpoint', type: 'sibling' });
          candidatesY.push({ val: sb.y + sb.height / 2, label: 'midpoint', type: 'sibling' });
          candidatesY.push({ val: sb.y + sb.height, label: 'endpoint', type: 'sibling' });
        }
      }
    }

    let snappedX = p.x;
    let snappedY = p.y;
    let matchX = null;
    let matchY = null;

    if (/[ew]/.test(dir)) {
      let minDiffX = snapThresholdX;
      for (const c of candidatesX) {
        const diff = Math.abs(p.x - c.val);
        if (diff < minDiffX) {
          minDiffX = diff;
          matchX = c;
        }
      }
      if (matchX) {
        snappedX = matchX.val;
      }
    }

    if (/[ns]/.test(dir)) {
      let minDiffY = snapThresholdY;
      for (const c of candidatesY) {
        const diff = Math.abs(p.y - c.val);
        if (diff < minDiffY) {
          minDiffY = diff;
          matchY = c;
        }
      }
      if (matchY) {
        snappedY = matchY.val;
      }
    }

    this._lastSnappedTargetX = matchX ? matchX.val : null;
    this._lastSnappedTargetY = matchY ? matchY.val : null;

    if (!matchX && !matchY) {
      this.clearSmartGuides();
      return null;
    }

    if (matchX) {
      this.drawSmartGuideLine('v', matchX.val);
      const cross = this._createCrosshair(matchX.val, snappedY);
      if (cross) this.smartGuidesLayer?.append(cross);
      const lbl = this._createLabel(matchX.val, snappedY, matchX.label);
      if (lbl) this.smartGuidesLayer?.append(lbl);
    }

    if (matchY) {
      this.drawSmartGuideLine('h', matchY.val);
      const cross = this._createCrosshair(snappedX, matchY.val);
      if (cross) this.smartGuidesLayer?.append(cross);
      const lbl = this._createLabel(snappedX, matchY.val, matchY.label);
      if (lbl) this.smartGuidesLayer?.append(lbl);
    }

    return {
      snappedX,
      snappedY,
      matchX,
      matchY
    };
  }

  _getCombinedBBox(elements) {
    if (!elements || !elements.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of elements) {
      const b = this._getElementSceneBBox(el);
      if (b && (b.width > 0 || b.height > 0)) {
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width);
        maxY = Math.max(maxY, b.y + b.height);
      }
    }
    if (minX === Infinity) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  /* -------------------------------------------------------------------------
   * UI & Menu Bindings
   * ------------------------------------------------------------------------- */

  _bindMenuActions() {
    if (typeof document === 'undefined') return;

    // View > Smart Guides
    const smartBtn = document.getElementById('action_smart_guides');
    if (smartBtn) {
      smartBtn.addEventListener('click', () => {
        this.toggleSmartGuides(null, true);
      });
    }

    // View > Guides > Show Guides
    const toggleGuidesBtn = document.getElementById('action_toggle_guides');
    if (toggleGuidesBtn) {
      toggleGuidesBtn.addEventListener('click', () => {
        this.toggleShowGuides(null, true);
      });
    }

    // View > Guides > Lock Guides
    const lockGuidesBtn = document.getElementById('action_lock_guides');
    if (lockGuidesBtn) {
      lockGuidesBtn.addEventListener('click', () => {
        this.toggleLockGuides(null, true);
      });
    }

    // View > Guides > Clear Guides
    const clearGuidesBtn = document.getElementById('action_clear_guides');
    if (clearGuidesBtn) {
      clearGuidesBtn.addEventListener('click', () => {
        this.clearGuides();
      });
    }

    this.updateUI();
  }

  _bindShortcuts() {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (!isCmdOrCtrl) return;

      const target = e.target;
      const isInput = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.nodeName) || target?.isContentEditable;
      if (isInput) return;

      // ⌘U: Smart Guides
      if ((e.key === 'u' || e.key === 'U' || e.code === 'KeyU') && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        this.toggleSmartGuides(null, true);
        return;
      }

      // ⌘; (Cmd+Semicolon): Toggle Guides
      if ((e.key === ';' || e.code === 'Semicolon') && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        this.toggleShowGuides(null, true);
        return;
      }

      // ⌥⌘; (Alt+Cmd+Semicolon): Lock Guides
      if ((e.key === ';' || e.code === 'Semicolon') && e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        this.toggleLockGuides(null, true);
        return;
      }
    }, true);
  }

  updateUI() {
    if (typeof document === 'undefined') return;

    const smartBtn = document.getElementById('action_smart_guides');
    if (smartBtn) {
      smartBtn.setAttribute('aria-checked', this.smartGuidesEnabled ? 'true' : 'false');
    }

    const toggleBtn = document.getElementById('action_toggle_guides');
    if (toggleBtn) {
      toggleBtn.textContent = this.showGuides ? 'Hide Guides' : 'Show Guides';
      const shortcut = document.createElement('span');
      shortcut.className = 'menu_dropdown_shortcut';
      shortcut.textContent = '⌘;';
      toggleBtn.append(shortcut);
    }

    const lockBtn = document.getElementById('action_lock_guides');
    if (lockBtn) {
      lockBtn.textContent = this.lockGuides ? 'Unlock Guides' : 'Lock Guides';
      const shortcut = document.createElement('span');
      shortcut.className = 'menu_dropdown_shortcut';
      shortcut.textContent = '⌥⌘;';
      lockBtn.append(shortcut);
    }
  }
}

export function mountGuides(editor) {
  const manager = new GuideManager(editor);
  manager.init();
  if (typeof window !== 'undefined') {
    window.__visterasGuideManager = manager;
  }
  return manager;
}

export default mountGuides;
