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

    const smartConnected = typeof this.smartGuidesLayer?.isConnected === 'boolean' ? this.smartGuidesLayer.isConnected : true;
    const smartContained = typeof svgContent.contains === 'function' && this.smartGuidesLayer ? svgContent.contains(this.smartGuidesLayer) : true;
    if (!this.smartGuidesLayer || !smartConnected || !smartContained) {
      let smartGroup = document.getElementById('visteras_smart_guides');
      if (!smartGroup || (typeof svgContent.contains === 'function' && !svgContent.contains(smartGroup))) {
        if (typeof document.createElementNS === 'function') {
          smartGroup = document.createElementNS(NS, 'g');
          smartGroup.setAttribute('id', 'visteras_smart_guides');
          smartGroup.setAttribute('class', 'visteras-smart-guides-layer');
          smartGroup.setAttribute('style', 'pointer-events: none;');
          svgContent.append(smartGroup);
        }
      }
      if (smartGroup) this.smartGuidesLayer = smartGroup;
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

    // Listen to selection dragging / transition events
    this.sc.bind?.('transition', (elements) => {
      if (!this.smartGuidesEnabled || !elements || !elements.length) {
        this.clearSmartGuides();
        return;
      }
      this.evaluateSmartSnap(elements);
    });

    this.sc.bind?.('changed', () => {
      this.clearSmartGuides();
    });

    if (typeof window !== 'undefined') {
      let isMouseDown = false;
      const workarea = document.getElementById('workarea') || window;
      workarea.addEventListener('mousedown', (e) => {
        if (e.button === 0) isMouseDown = true;
      }, true);

      window.addEventListener('mouseup', () => {
        isMouseDown = false;
        this.clearSmartGuides();
      }, true);

      window.addEventListener('mousemove', (e) => {
        if (!isMouseDown || !this.smartGuidesEnabled) return;
        const mode = this.sc?.getMode?.();
        if (mode === 'select' && (e.buttons === 1 || e.which === 1)) {
          const sel = this.sc.getSelectedElements?.() || [];
          if (sel.length > 0) {
            this.evaluateSmartSnap(sel);
          }
        }
      });
    }
  }

  clearSmartGuides() {
    if (this.smartGuidesLayer) {
      this.smartGuidesLayer.innerHTML = '';
    }
  }

  drawSmartGuideLine(type, pos, minExtent = -10000, maxExtent = 10000) {
    this._ensureLayers();
    if (!this.smartGuidesLayer) return;

    const line = document.createElementNS(NS, 'line');
    line.setAttribute('stroke', '#ff007f'); // Classic Illustrator magenta smart guide
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

  evaluateSmartSnap(movingElements) {
    if (!this.smartGuidesEnabled) return;
    this.clearSmartGuides();

    const movingSet = new Set(movingElements);
    const movingBBox = this._getCombinedBBox(movingElements);
    if (!movingBBox) return;

    const zoom = this.sc?.getZoom?.() || 1;
    const snapThreshold = 6 / zoom; // 6 screen pixels tolerance

    const movingX = [
      { val: movingBBox.x, name: 'left' },
      { val: movingBBox.x + movingBBox.width / 2, name: 'center' },
      { val: movingBBox.x + movingBBox.width, name: 'right' }
    ];

    const movingY = [
      { val: movingBBox.y, name: 'top' },
      { val: movingBBox.y + movingBBox.height / 2, name: 'center' },
      { val: movingBBox.y + movingBBox.height, name: 'bottom' }
    ];

    // Collect snap candidates
    const candidatesX = [];
    const candidatesY = [];

    // 1. Artboard boundaries & center
    const res = this.sc?.getResolution?.() || { w: 800, h: 600 };
    const abW = Number(res.w ?? res.width ?? 800);
    const abH = Number(res.h ?? res.height ?? 600);

    candidatesX.push({ val: 0, label: 'Artboard Left', min: 0, max: abH });
    candidatesX.push({ val: abW / 2, label: 'Artboard Center', min: 0, max: abH });
    candidatesX.push({ val: abW, label: 'Artboard Right', min: 0, max: abH });

    candidatesY.push({ val: 0, label: 'Artboard Top', min: 0, max: abW });
    candidatesY.push({ val: abH / 2, label: 'Artboard Center', min: 0, max: abW });
    candidatesY.push({ val: abH, label: 'Artboard Bottom', min: 0, max: abW });

    // 2. Active Ruler Guides
    if (this.showGuides) {
      for (const g of this.rulerGuides) {
        if (g.type === 'v') candidatesX.push({ val: g.pos, label: 'Ruler Guide', min: -5000, max: 5000 });
        if (g.type === 'h') candidatesY.push({ val: g.pos, label: 'Ruler Guide', min: -5000, max: 5000 });
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
          const minX = Math.min(movingBBox.x, b.x) - 50;
          const maxX = Math.max(movingBBox.x + movingBBox.width, b.x + b.width) + 50;
          const minY = Math.min(movingBBox.y, b.y) - 50;
          const maxY = Math.max(movingBBox.y + movingBBox.height, b.y + b.height) + 50;

          candidatesX.push({ val: b.x, min: minY, max: maxY });
          candidatesX.push({ val: b.x + b.width / 2, min: minY, max: maxY });
          candidatesX.push({ val: b.x + b.width, min: minY, max: maxY });

          candidatesY.push({ val: b.y, min: minX, max: maxX });
          candidatesY.push({ val: b.y + b.height / 2, min: minX, max: maxX });
          candidatesY.push({ val: b.y + b.height, min: minX, max: maxX });
        }
      }
    }

    // Evaluate best X alignment
    let matchedX = null;
    let minDiffX = snapThreshold;
    for (const m of movingX) {
      for (const c of candidatesX) {
        const diff = Math.abs(m.val - c.val);
        if (diff < minDiffX) {
          minDiffX = diff;
          matchedX = { movingVal: m.val, targetVal: c.val, min: c.min, max: c.max };
        }
      }
    }

    // Evaluate best Y alignment
    let matchedY = null;
    let minDiffY = snapThreshold;
    for (const m of movingY) {
      for (const c of candidatesY) {
        const diff = Math.abs(m.val - c.val);
        if (diff < minDiffY) {
          minDiffY = diff;
          matchedY = { movingVal: m.val, targetVal: c.val, min: c.min, max: c.max };
        }
      }
    }

    // Render guide lines
    if (matchedX) {
      this.drawSmartGuideLine('v', matchedX.targetVal, matchedX.min, matchedX.max);
    }
    if (matchedY) {
      this.drawSmartGuideLine('h', matchedY.targetVal, matchedY.min, matchedY.max);
    }
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
