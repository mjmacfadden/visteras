/**
 * Visteras Inspire — Workspace & Canvas Engine
 * Supports both Infinite Canvas and Fixed Artboard / Print Canvas with smooth pan, zoom, snapping, and transformation.
 */

import { CANVAS_PRESETS } from './document.js';
import { measureTextBounds, LOREM_IPSUM, getLoremIpsumForBox } from './board-composer.js';
import { isDarkColor } from './color-extractor.js';
import { SpatialPresentation } from './presentation.js';
import { gridStylesForMode } from './grid-config.js';
import { transformChanged } from './inspire-utils.js';

export class WorkspaceCanvas {
  constructor({
    container,
    doc,
    boardComposer,
    swipeFileManager,
    onSelectionChange,
    onStatusChange,
    onDocChange,
    onToast
  }) {
    this.container = container;
    this.doc = doc;
    this.board = boardComposer;
    if (this.board && this.doc) {
      this.board.attachDoc?.(this.doc);
    }
    this.swipeFile = swipeFileManager;
    this.onSelectionChange = onSelectionChange;
    this.onStatusChange = onStatusChange;
    this.onDocChange = onDocChange;
    this.onToast = onToast;

    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;

    this.activeTool = 'select'; // 'select' | 'hand' | 'image' | 'text' | 'quote' | 'sticky' | 'swatch' | 'connector' | 'shape'
    this.isTransforming = false;
    this.transformType = null; // 'move' | 'resize' | 'rotate'
    this.transformHandle = null;
    this.transformStart = null;

    this.isMarquee = false;
    this.marqueeStart = null;
    this.isTextCreating = false;
    this.textCreateStart = null;
    this.snapGuides = [];
    this.hasInitialFitted = false;

    this.initDOM();
    this.bindEvents();
    this.fitToScreen();
    this.render();

    this.presentation = new SpatialPresentation(this);

    // Subscribe to board updates
    this.boardUnsubscribe = this.board.subscribe((evt) => {
      this.renderElements();
      this.updateSelectionHandles();
      if (this.presentation) {
        if (this.presentation.index >= this.presentation.slides.length) {
          this.presentation.index = Math.max(0, this.presentation.slides.length - 1);
        }
        this.presentation.refresh?.();
      }
      if (this.onStatusChange) {
        this.onStatusChange({
          itemCount: this.board.elements.length,
          selectionCount: this.board.selectedIds.size
        });
      }
    });
  }

  switchDocument({ doc, board, swipeFile, viewportState } = {}) {
    this.presentation?.exit();
    if (doc) this.doc = doc;
    if (board) {
      this.board = board;
      if (this.doc) this.board.attachDoc?.(this.doc);
    }
    if (swipeFile) this.swipeFile = swipeFile;

    if (this.boardUnsubscribe) {
      this.boardUnsubscribe();
    }
    this.boardUnsubscribe = this.board.subscribe((evt) => {
      this.renderElements();
      this.updateSelectionHandles();
      if (this.presentation) {
        if (this.presentation.index >= this.presentation.slides.length) {
          this.presentation.index = Math.max(0, this.presentation.slides.length - 1);
        }
        this.presentation.refresh?.();
      }
      if (this.onStatusChange) {
        this.onStatusChange({
          itemCount: this.board.elements.length,
          selectionCount: this.board.selectedIds.size
        });
      }
    });

    if (viewportState && typeof viewportState.zoom === 'number') {
      this.zoom = viewportState.zoom;
      this.panX = viewportState.panX;
      this.panY = viewportState.panY;
      this.updateWorldTransform();
      if (this.onStatusChange) {
        this.onStatusChange({ zoom: Math.round(this.zoom * 100) });
      }
    } else {
      this.fitToScreen();
    }

    this.render();
    this.presentation?.refresh();
  }

  setTool(tool) {
    this.activeTool = tool;
    if (this.viewport) {
      this.viewport.classList.toggle('tool-hand', tool === 'hand');
      this.viewport.classList.toggle('tool-text', tool === 'text');
    }
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="inspire-viewport" tabindex="0">
        <div class="inspire-canvas-world">
          <div class="inspire-artboard-frame">
            <div class="inspire-artboard-header">
              <span class="artboard-title-label"></span>
              <span class="artboard-dims-badge"></span>
            </div>
            <div class="inspire-artboard" id="inspire_artboard">
              <div class="inspire-artboard-bleed"></div>
              <div class="inspire-elements-layer"></div>
              <div class="inspire-connectors-layer">
                <svg class="connectors-svg" width="100%" height="100%"></svg>
              </div>
              <div class="inspire-guides-layer"></div>
            </div>
          </div>
          <div class="inspire-selection-overlay"></div>
          <div class="inspire-marquee-box"></div>
        </div>
      </div>
    `;

    this.viewport = this.container.querySelector('.inspire-viewport');
    this.world = this.container.querySelector('.inspire-canvas-world');
    this.artboardFrame = this.container.querySelector('.inspire-artboard-frame');
    this.artboard = this.container.querySelector('#inspire_artboard');
    this.artboardTitle = this.container.querySelector('.artboard-title-label');
    this.artboardDims = this.container.querySelector('.artboard-dims-badge');
    this.elementsLayer = this.container.querySelector('.inspire-elements-layer');
    this.connectorsSvg = this.container.querySelector('.connectors-svg');
    this.guidesLayer = this.container.querySelector('.inspire-guides-layer');
    this.selectionOverlay = this.container.querySelector('.inspire-selection-overlay');
    this.marqueeBox = this.container.querySelector('.inspire-marquee-box');
  }

  setMode(mode) {
    this.doc.mode = mode; // 'fixed' or 'infinite'
    this.renderArtboardMeta();
    this.fitToScreen();
    if (this.onStatusChange) {
      this.onStatusChange({ mode: this.doc.mode });
    }
  }

  setPreset(presetKey) {
    const p = CANVAS_PRESETS[presetKey];
    if (!p) return;
    this.doc.preset = presetKey;
    this.doc.width = p.width;
    this.doc.height = p.height;
    this.renderArtboardMeta();
    this.fitToScreen();
  }

  renderArtboardMeta() {
    const isInfinite = this.doc.mode === 'infinite';
    const bg = this.doc.background || '#ffffff';
    const pattern = this.doc.bgPattern || 'blank';

    if (isInfinite) {
      this.viewport.classList.add('mode-infinite');
      this.viewport.style.backgroundColor = bg;
      this.artboardFrame.classList.add('infinite-mode');
      this.artboardTitle.textContent = 'Infinite Canvas';
      this.artboardDims.textContent = '∞';
      this.artboard.style.width = '0px';
      this.artboard.style.height = '0px';
      this.artboard.style.transform = 'none';
      this.artboard.style.backgroundColor = 'transparent';
      this.artboard.className = 'inspire-artboard pattern-blank mode-infinite';
      const isPlaying = this.viewport.classList?.contains('spatial-playing');
      this.viewport.className = `inspire-viewport pattern-${pattern} mode-infinite${isPlaying ? ' spatial-playing' : ''}`;
    } else {
      const isPlaying = this.viewport.classList?.contains('spatial-playing');
      this.viewport.classList.remove('mode-infinite');
      this.viewport.style.backgroundColor = '';
      this.viewport.className = `inspire-viewport${isPlaying ? ' spatial-playing' : ''}`;
      this.artboardFrame.classList.remove('infinite-mode');
      this.artboard.style.width = `${this.doc.width}px`;
      this.artboard.style.height = `${this.doc.height}px`;
      this.artboard.style.transform = 'none';
      this.artboard.style.backgroundColor = bg;
      const presetInfo = CANVAS_PRESETS[this.doc.preset] || { name: 'Custom' };
      this.artboardTitle.textContent = `${this.doc.title} — ${presetInfo.name}`;
      this.artboardDims.textContent = `${this.doc.width} × ${this.doc.height} px`;
      this.artboard.className = `inspire-artboard pattern-${pattern}`;
    }
    this.applyGridBackground();
  }

  // Both modes read GRID_CONFIG (grid-config.js) so spacing and dot size match at any zoom
  applyGridBackground() {
    if (!this.artboard?.style || !this.viewport?.style) return;
    const styles = gridStylesForMode(this.doc.mode, this.doc.bgPattern || 'blank', this.zoom, this.panX, this.panY);
    Object.assign(this.artboard.style, styles.artboard);
    Object.assign(this.viewport.style, styles.viewport);
  }

  screenToCanvas(clientX, clientY) {
    const rect = this.viewport.getBoundingClientRect();
    const x = (clientX - rect.left - this.panX) / this.zoom;
    const y = (clientY - rect.top - this.panY) / this.zoom;
    return { x, y };
  }

  canvasToScreen(x, y) {
    const rect = this.viewport.getBoundingClientRect();
    return {
      x: x * this.zoom + this.panX + rect.left,
      y: y * this.zoom + this.panY + rect.top
    };
  }

  getViewportCenter() {
    if (!this.viewport) return { x: 400, y: 300 };
    const rect = this.viewport.getBoundingClientRect();
    return this.screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  setZoom(newZoom, centerX = null, centerY = null) {
    const clamped = Math.max(0.1, Math.min(5, newZoom));
    const rect = this.viewport ? this.viewport.getBoundingClientRect() : { left: 0, top: 0, width: 800, height: 600 };

    let cx = rect.width / 2;
    let cy = rect.height / 2;

    if (centerX !== null && centerY !== null) {
      if (rect.left > 0 && centerX >= rect.left && centerX <= rect.right + 50) {
        cx = centerX - rect.left;
        cy = centerY - rect.top;
      } else {
        cx = centerX;
        cy = centerY;
      }
    }

    const canvasPointX = (cx - this.panX) / this.zoom;
    const canvasPointY = (cy - this.panY) / this.zoom;

    this.zoom = clamped;
    this.panX = cx - canvasPointX * this.zoom;
    this.panY = cy - canvasPointY * this.zoom;

    this.updateWorldTransform();
    if (this.onStatusChange) {
      this.onStatusChange({ zoom: Math.round(this.zoom * 100) });
    }
  }

  fitToScreen() {
    const rect = this.viewport.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => this.fitToScreen());
      }
      return;
    }

    this.hasInitialFitted = true;

    if (this.doc.mode === 'infinite') {
      const elements = this.board?.elements;
      if (!elements || elements.length === 0) {
        this.zoom = 1;
        this.panX = rect.width / 2;
        this.panY = rect.height / 2;
        this.updateWorldTransform();
        if (this.onStatusChange) {
          this.onStatusChange({ zoom: Math.round(this.zoom * 100) });
        }
        return;
      }

      // Compute bounding box encompassing all objects on the board
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const el of elements) {
        const x = el.x;
        const y = el.y;
        const w = el.width || 0;
        const h = el.height || 0;

        if (el.rotation && el.rotation !== 0) {
          const rad = el.rotation * (Math.PI / 180);
          const cx = x + w / 2;
          const cy = y + h / 2;
          const cosA = Math.cos(rad);
          const sinA = Math.sin(rad);
          const corners = [
            { x: -w / 2, y: -h / 2 },
            { x: w / 2, y: -h / 2 },
            { x: w / 2, y: h / 2 },
            { x: -w / 2, y: h / 2 }
          ];
          for (const c of corners) {
            const rx = cx + c.x * cosA - c.y * sinA;
            const ry = cy + c.x * sinA + c.y * cosA;
            minX = Math.min(minX, rx);
            maxX = Math.max(maxX, rx);
            minY = Math.min(minY, ry);
            maxY = Math.max(maxY, ry);
          }
        } else {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x + w);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y + h);
        }
      }

      const contentW = Math.max(1, maxX - minX);
      const contentH = Math.max(1, maxY - minY);
      const centerX = minX + contentW / 2;
      const centerY = minY + contentH / 2;

      // Fit with comfortable margins in viewport
      const pad = 80;
      const availW = Math.max(100, rect.width - pad * 2);
      const availH = Math.max(100, rect.height - pad * 2);

      const scaleW = availW / contentW;
      const scaleH = availH / contentH;
      const fitScale = Math.min(scaleW, scaleH, 1.0);

      this.zoom = Math.max(0.1, fitScale);
      this.panX = (rect.width / 2) - centerX * this.zoom;
      this.panY = (rect.height / 2) - centerY * this.zoom;

      this.updateWorldTransform();
      if (this.onStatusChange) {
        this.onStatusChange({ zoom: Math.round(this.zoom * 100) });
      }
      return;
    }

    const pad = 80;
    const availW = rect.width - pad * 2;
    const availH = rect.height - pad * 2;

    const scaleW = availW / (this.doc.width || 1920);
    const scaleH = availH / (this.doc.height || 1080);
    const fitScale = Math.min(scaleW, scaleH, 1.2);

    this.zoom = Math.max(0.15, fitScale);
    this.panX = (rect.width - this.doc.width * this.zoom) / 2;
    this.panY = (rect.height - this.doc.height * this.zoom) / 2;

    this.updateWorldTransform();
    if (this.onStatusChange) {
      this.onStatusChange({ zoom: Math.round(this.zoom * 100) });
    }
  }

  updateWorldTransform() {
    this.world.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;

    if (this.doc.mode === 'infinite' && this.viewport) {
      this.applyGridBackground();
    }
  }

  render() {
    this.renderArtboardMeta();
    this.renderElements();
    this.updateSelectionHandles();
  }

  renderElements() {
    this.elementsLayer.innerHTML = '';
    this.connectorsSvg.innerHTML = '';

    const sorted = [...this.board.elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    for (const el of sorted) {
      if (el.type === 'connector') {
        this.renderConnector(el);
      } else {
        const dom = this.createDomElement(el);
        this.elementsLayer.appendChild(dom);
      }
    }
  }

  createDomElement(el) {
    const card = document.createElement('div');
    card.className = `inspire-element el-type-${el.type}`;
    if (el.type === 'text' && el.data?.boundary === 'box') {
      card.classList.add('is-textbox');
    }
    card.id = `dom_${el.id}`;
    card.dataset.id = el.id;

    if (this.board.selectedIds.has(el.id)) {
      card.classList.add('selected');
    }

    card.style.left = `${el.x}px`;
    card.style.top = `${el.y}px`;
    card.style.width = `${el.width}px`;
    card.style.height = `${el.height}px`;
    card.style.transform = `rotate(${el.rotation || 0}deg)`;
    card.style.zIndex = el.zIndex || 1;
    card.style.opacity = el.opacity ?? 1;

    let contentHtml = '';

    switch (el.type) {
      case 'image': {
        const data = el.data || {};
        const isPolaroid = data.polaroid;
        const rad = isPolaroid ? 0 : (data.radius ?? 8);
        const filterStyle = this.getFilterCss(data.filter);
        contentHtml = `
          <div class="el-inner-image ${isPolaroid ? 'is-polaroid' : ''}" style="border-radius: ${rad}px;">
            <div class="image-wrapper" style="border-radius: ${isPolaroid ? '4px' : rad + 'px'};">
              <img src="${data.src}" alt="${data.title || ''}" style="object-fit:${data.fit || 'cover'}; filter:${filterStyle};" draggable="false" />
            </div>
            ${isPolaroid ? `<input type="text" class="polaroid-caption polaroid-caption-input" value="${this.escapeHtml(data.caption || data.title || '')}" placeholder="Add caption..." />` : ''}
          </div>
        `;
        break;
      }

      case 'quote': {
        const d = el.data || {};
        contentHtml = `
          <div class="el-inner-quote quote-style-${d.quoteStyle || 'editorial'}" style="background:${d.bg || '#1e2028'}; border-radius:${d.radius ?? 10}px; color:${d.color || '#f8fafc'}; font-family:${d.fontFamily || 'Playfair Display'}, serif;">
            <div class="quote-mark">“</div>
            <div class="quote-body" style="font-size:${d.fontSize || 20}px;">${d.quote || ''}</div>
            ${d.author ? `<div class="quote-author">— ${d.author}${d.cite ? `, <em>${d.cite}</em>` : ''}</div>` : ''}
          </div>
        `;
        break;
      }

      case 'text': {
        const d = el.data || {};
        const isBox = d.boundary === 'box';
        const textColor = d.color || ((this.doc?.background && isDarkColor(this.doc.background)) ? '#ffffff' : '#111827');
        contentHtml = `<div class="el-inner-text ${isBox ? 'text-box-mode' : 'text-point-mode'}" style="font-family:${d.fontFamily || 'Montserrat'}, sans-serif; font-size:${d.fontSize || 32}px; font-weight:${d.fontWeight || '700'}; color:${textColor}; text-align:${d.align || 'left'}; letter-spacing:${d.letterSpacing || 0}px; line-height:${d.lineHeight || 1.2}; ${isBox ? 'white-space: pre-wrap; word-break: break-word; overflow-wrap: break-word; width: 100%; height: 100%;' : 'white-space: pre; word-break: normal; width: 100%; height: 100%; overflow: visible;'}">${this.escapeHtml(d.text || '')}</div>`;
        break;
      }

      case 'sticky': {
        const d = el.data || {};
        const isDark = d.color === '#1e293b';
        contentHtml = `
          <div class="el-inner-sticky" style="background:${d.color || '#fef08a'}; color:${isDark ? '#f8fafc' : '#1e1e1e'};">
            ${d.tape ? `<div class="sticky-washi-tape"></div>` : ''}
            ${d.pin ? `<div class="sticky-pushpin"></div>` : ''}
            <textarea class="sticky-note-textarea font-${d.font || 'handwriting'}" style="color:${isDark ? '#f8fafc' : '#1e1e1e'};" placeholder="Write a note...">${d.text || ''}</textarea>
          </div>
        `;
        break;
      }

      case 'swatch': {
        const d = el.data || {};
        contentHtml = `
          <div class="el-inner-swatch">
            <div class="swatch-color-box" style="background:${d.hex || '#f59e0b'};">
              <button type="button" class="swatch-copy-btn" title="Copy Hex Code">Copy</button>
            </div>
            <div class="swatch-info">
              <div class="swatch-name">${d.name || 'Color Swatch'}</div>
              <div class="swatch-hex">${(d.hex || '#000000').toUpperCase()}</div>
              ${d.label ? `<div class="swatch-label">${d.label}</div>` : ''}
            </div>
          </div>
        `;
        break;
      }

      case 'shape': {
        const d = el.data || {};
        const radius = d.shapeType === 'circle' ? '50%' : (d.shapeType === 'pill' ? '999px' : `${d.radius ?? 8}px`);
        contentHtml = `
          <div class="el-inner-shape" style="background:${d.fill || 'rgba(245,158,11,0.2)'}; border: ${d.strokeWidth || 2}px solid ${d.stroke || '#f59e0b'}; border-radius:${radius}; width:100%; height:100%;">
          </div>
        `;
        break;
      }
    }

    card.innerHTML = contentHtml;

    // Direct in-place editing for sticky notes
    if (el.type === 'sticky') {
      const stickyTa = card.querySelector('.sticky-note-textarea');
      if (stickyTa) {
        stickyTa.addEventListener('input', (e) => {
          e.stopPropagation();
          el.data.text = stickyTa.value;
          // Live sync with inspector textarea if active
          const inspTa = document.querySelector('#inp_sticky_text');
          if (inspTa && inspTa.value !== stickyTa.value) {
            inspTa.value = stickyTa.value;
          }
          if (this.onDocChange) this.onDocChange();
        });
        stickyTa.addEventListener('change', () => {
          this.board.saveHistory('Edit sticky note');
        });
        stickyTa.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            stickyTa.blur();
          }
        });
        stickyTa.addEventListener('focus', () => {
          if (!this.board.selectedIds.has(el.id)) {
            this.board.select(el.id, false);
          }
        });
        stickyTa.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          stickyTa.focus();
          stickyTa.select();
        });
      }
    }

    // Direct in-place editing for polaroid image captions
    if (el.type === 'image' && el.data?.polaroid) {
      const captionInp = card.querySelector('.polaroid-caption-input');
      if (captionInp) {
        captionInp.addEventListener('input', (e) => {
          e.stopPropagation();
          el.data.caption = captionInp.value;
          // Live sync with inspector caption if active
          const inspCap = document.querySelector('#inp_img_caption');
          if (inspCap && inspCap.value !== captionInp.value) {
            inspCap.value = captionInp.value;
          }
          if (this.onDocChange) this.onDocChange();
        });
        captionInp.addEventListener('change', () => {
          this.board.saveHistory('Edit image caption');
        });
        captionInp.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Escape' || e.key === 'Enter') {
            captionInp.blur();
          }
        });
        captionInp.addEventListener('focus', () => {
          if (!this.board.selectedIds.has(el.id)) {
            this.board.select(el.id, false);
          }
        });
        captionInp.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          captionInp.focus();
          captionInp.select();
        });
      }
    }

    // Clicking anywhere on a color swatch copies the hex code to clipboard
    if (el.type === 'swatch') {
      const swatchInner = card.querySelector('.el-inner-swatch');
      if (swatchInner) {
        swatchInner.style.cursor = 'pointer';
        swatchInner.setAttribute('title', `Click to copy ${el.data?.hex || ''}`);
        swatchInner.addEventListener('click', (e) => {
          e.stopPropagation();
          if (el.data?.hex) {
            this.copyHexToClipboard(el.data.hex, card);
          }
        });
      }
    }

    return card;
  }

  copyHexToClipboard(hex, visualEl = null) {
    if (!hex) return;
    const cleanHex = hex.trim().toUpperCase();

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(cleanHex).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = cleanHex;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      });
    } else {
      const ta = document.createElement('textarea');
      ta.value = cleanHex;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }

    if (visualEl) {
      const copyBtn = visualEl.querySelector('.swatch-copy-btn');
      const hexEl = visualEl.querySelector('.swatch-hex');
      if (copyBtn) {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { if (copyBtn) copyBtn.textContent = 'Copy'; }, 1500);
      }
      if (hexEl) {
        const original = hexEl.textContent;
        hexEl.textContent = 'COPIED!';
        hexEl.style.color = '#f59e0b';
        setTimeout(() => {
          if (hexEl) {
            hexEl.textContent = original;
            hexEl.style.color = '';
          }
        }, 1500);
      }
    }

    if (this.onToast) {
      this.onToast(`Copied ${cleanHex} to clipboard`, 'success');
    }
  }

  getFilterCss(filterName) {
    switch (filterName) {
      case 'warm': return 'sepia(0.25) contrast(1.05) saturate(1.2)';
      case 'cool': return 'hue-rotate(180deg) saturate(0.9) brightness(1.05)';
      case 'bw': return 'grayscale(1) contrast(1.2)';
      case 'golden': return 'sepia(0.35) saturate(1.4) brightness(1.08)';
      case 'vintage': return 'sepia(0.4) contrast(0.9) brightness(0.95)';
      case 'moody': return 'contrast(1.3) brightness(0.85) saturate(0.9)';
      default: return 'none';
    }
  }

  renderConnector(el) {
    const d = el.data || {};
    const x1 = el.x + (d.start?.x || 0);
    const y1 = el.y + (d.start?.y || 0);
    const x2 = el.x + (d.end?.x || el.width);
    const y2 = el.y + (d.end?.y || el.height);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const dx = x2 - x1;
    const dy = y2 - y1;
    const cx1 = x1 + dx * 0.4;
    const cy1 = y1;
    const cx2 = x1 + dx * 0.6;
    const cy2 = y2;

    const dStr = d.curved ? `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}` : `M ${x1} ${y1} L ${x2} ${y2}`;
    path.setAttribute('d', dStr);
    path.setAttribute('stroke', d.color || '#f59e0b');
    path.setAttribute('stroke-width', d.strokeWidth || 2);
    path.setAttribute('fill', 'none');
    if (d.strokeStyle === 'dashed') path.setAttribute('stroke-dasharray', '6 4');

    this.connectorsSvg.appendChild(path);
  }

  updateSelectionHandles() {
    this.selectionOverlay.innerHTML = '';
    const selected = this.board.getSelectedElements();
    if (!selected.length) return;

    if (selected.length === 1) {
      const el = selected[0];
      const box = document.createElement('div');
      box.className = 'inspire-transform-box single-selection';
      if (el.type === 'text' && el.data?.boundary === 'box') {
        box.classList.add('is-textbox');
      }
      box.dataset.id = el.id;
      box.style.left = `${el.x}px`;
      box.style.top = `${el.y}px`;
      box.style.width = `${el.width}px`;
      box.style.height = `${el.height}px`;
      box.style.transform = `rotate(${el.rotation || 0}deg)`;

      // Corner rotation zones (Studio and Vector convention)
      const rotateCorners = ['nw', 'ne', 'se', 'sw'];
      for (const rc of rotateCorners) {
        const rotZone = document.createElement('div');
        rotZone.className = `transform-rotate-zone rot-zone-${rc}`;
        rotZone.dataset.rotateCorner = rc;
        box.appendChild(rotZone);
      }

      // Resize handles: nw, n, ne, e, se, s, sw, w
      const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
      for (const h of handles) {
        const handleEl = document.createElement('div');
        handleEl.className = `transform-handle handle-${h}`;
        handleEl.dataset.handle = h;
        box.appendChild(handleEl);
      }

      this.selectionOverlay.appendChild(box);
    } else {
      // Multi-selection bounding box
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      selected.forEach(el => {
        minX = Math.min(minX, el.x);
        maxX = Math.max(maxX, el.x + el.width);
        minY = Math.min(minY, el.y);
        maxY = Math.max(maxY, el.y + el.height);
      });

      const multiBox = document.createElement('div');
      multiBox.className = 'inspire-transform-box multi-selection';
      multiBox.style.left = `${minX}px`;
      multiBox.style.top = `${minY}px`;
      multiBox.style.width = `${maxX - minX}px`;
      multiBox.style.height = `${maxY - minY}px`;

      // Corner rotation zones for multi-selection
      const rotateCorners = ['nw', 'ne', 'se', 'sw'];
      for (const rc of rotateCorners) {
        const rotZone = document.createElement('div');
        rotZone.className = `transform-rotate-zone rot-zone-${rc}`;
        rotZone.dataset.rotateCorner = rc;
        multiBox.appendChild(rotZone);
      }

      const handles = ['nw', 'ne', 'se', 'sw'];
      for (const h of handles) {
        const handleEl = document.createElement('div');
        handleEl.className = `transform-handle handle-${h}`;
        handleEl.dataset.handle = h;
        multiBox.appendChild(handleEl);
      }

      this.selectionOverlay.appendChild(multiBox);
    }

    const selIdsStr = selected.map(e => e.id).sort().join(',');
    if (this.lastSelectedIdsStr !== selIdsStr) {
      this.lastSelectedIdsStr = selIdsStr;
      if (this.onSelectionChange) {
        this.onSelectionChange(selected);
      }
    }
  }

  bindEvents() {
    const vp = this.viewport;

    // Pointer down on viewport
    vp.addEventListener('pointerdown', (e) => {
      // Space or middle-click or 'hand' tool = PAN
      if (e.button === 1 || e.code === 'Space' || e.spaceKey || this.activeTool === 'hand') {
        this.isPanning = true;
        this.panStartX = e.clientX - this.panX;
        this.panStartY = e.clientY - this.panY;
        vp.setPointerCapture(e.pointerId);
        vp.classList.add('panning', 'is-dragging-pan');
        return;
      }

      if (e.button !== 0) return;

      // Text tool interaction (Point Text on click, Textbox on drag, or edit clicked text)
      if (this.activeTool === 'text') {
        const clickedEl = e.target.closest('.inspire-element');
        if (clickedEl) {
          const id = clickedEl.dataset.id;
          const el = this.board.getElementById(id);
          if (el && el.type === 'text') {
            this.board.selectElement(id);
            this.openInlineEditor(el, clickedEl);
            return;
          }
        }

        const canvasPt = this.screenToCanvas(e.clientX, e.clientY);
        this.isTextCreating = true;
        this.textCreateStart = canvasPt;
        this.marqueeBox.style.display = 'block';
        this.marqueeBox.style.left = `${canvasPt.x}px`;
        this.marqueeBox.style.top = `${canvasPt.y}px`;
        this.marqueeBox.style.width = '0px';
        this.marqueeBox.style.height = '0px';
        this.marqueeBox.style.border = '1px dashed #000000';
        vp.setPointerCapture(e.pointerId);
        return;
      }

      const handle = e.target.closest('.transform-handle');
      if (handle) {
        this.startTransform(e, handle.dataset.handle);
        return;
      }

      const rotZone = e.target.closest('.transform-rotate-zone');
      if (rotZone) {
        this.startTransform(e, 'rotate');
        return;
      }

      const stickyTextarea = e.target.closest('.sticky-note-textarea');
      if (stickyTextarea) {
        const clickedEl = e.target.closest('.inspire-element');
        if (clickedEl) {
          const id = clickedEl.dataset.id;
          if (!this.board.selectedIds.has(id)) {
            this.board.select(id, false);
          }
        }
        return;
      }

      const captionInput = e.target.closest('.polaroid-caption-input');
      if (captionInput) {
        const clickedEl = e.target.closest('.inspire-element');
        if (clickedEl) {
          const id = clickedEl.dataset.id;
          if (!this.board.selectedIds.has(id)) {
            this.board.select(id, false);
          }
        }
        return;
      }

      const inlineEditor = e.target.closest('.inspire-inline-editor');
      if (inlineEditor) {
        return;
      }

      const clickedEl = e.target.closest('.inspire-element');
      if (clickedEl) {
        const id = clickedEl.dataset.id;
        const isShift = e.shiftKey;
        if (!this.board.selectedIds.has(id)) {
          this.board.select(id, isShift);
        } else if (isShift) {
          this.board.select(id, true);
        }
        this.startTransform(e, 'move');
        return;
      }

      // Clicked on empty space: clear selection or start marquee
      if (!e.shiftKey) {
        this.board.clearSelection();
      }

      const canvasPt = this.screenToCanvas(e.clientX, e.clientY);
      this.isMarquee = true;
      this.marqueeStart = canvasPt;
      this.marqueeBox.style.display = 'block';
      this.marqueeBox.style.left = `${canvasPt.x}px`;
      this.marqueeBox.style.top = `${canvasPt.y}px`;
      this.marqueeBox.style.width = '0px';
      this.marqueeBox.style.height = '0px';
      this.marqueeBox.style.border = '';
      vp.setPointerCapture(e.pointerId);
    });

    // Pointer move
    vp.addEventListener('pointermove', (e) => {
      if (this.isPanning) {
        this.panX = e.clientX - this.panStartX;
        this.panY = e.clientY - this.panStartY;
        this.updateWorldTransform();
        return;
      }

      if (this.isTransforming) {
        this.handleTransformMove(e);
        return;
      }

      if (this.isTextCreating && this.textCreateStart) {
        const cur = this.screenToCanvas(e.clientX, e.clientY);
        const x = Math.min(this.textCreateStart.x, cur.x);
        const y = Math.min(this.textCreateStart.y, cur.y);
        const w = Math.abs(cur.x - this.textCreateStart.x);
        const h = Math.abs(cur.y - this.textCreateStart.y);

        this.marqueeBox.style.left = `${x}px`;
        this.marqueeBox.style.top = `${y}px`;
        this.marqueeBox.style.width = `${w}px`;
        this.marqueeBox.style.height = `${h}px`;
        return;
      }

      if (this.isMarquee) {
        const cur = this.screenToCanvas(e.clientX, e.clientY);
        const x = Math.min(this.marqueeStart.x, cur.x);
        const y = Math.min(this.marqueeStart.y, cur.y);
        const w = Math.abs(cur.x - this.marqueeStart.x);
        const h = Math.abs(cur.y - this.marqueeStart.y);

        this.marqueeBox.style.left = `${x}px`;
        this.marqueeBox.style.top = `${y}px`;
        this.marqueeBox.style.width = `${w}px`;
        this.marqueeBox.style.height = `${h}px`;

        // Select elements intersecting marquee
        for (const el of this.board.elements) {
          const intersects = !(el.x > x + w || el.x + el.width < x || el.y > y + h || el.y + el.height < y);
          if (intersects) {
            this.board.selectedIds.add(el.id);
          }
        }
        this.updateSelectionHandles();
      }
    });

    // Pointer up
    const pointerUpHandler = (e) => {
      if (this.isPanning) {
        this.isPanning = false;
        vp.classList.remove('panning', 'is-dragging-pan');
      }

      if (this.isTransforming) {
        this.endTransform();
      }

      if (this.isTextCreating && this.textCreateStart) {
        const cur = this.screenToCanvas(e.clientX, e.clientY);
        const start = this.textCreateStart;
        const w = Math.abs(cur.x - start.x);
        const h = Math.abs(cur.y - start.y);

        this.isTextCreating = false;
        this.textCreateStart = null;
        this.marqueeBox.style.display = 'none';
        this.marqueeBox.style.border = '';

        const threshold = 8; // Studio drag threshold
        const isBox = w >= threshold && h >= threshold;

        const defaultTextColor = (this.doc?.background && isDarkColor(this.doc.background)) ? '#ffffff' : '#111827';

        let el;
        if (isBox) {
          const x = Math.min(start.x, cur.x);
          const y = Math.min(start.y, cur.y);
          const boxW = Math.max(w, 80);
          const boxH = Math.max(h, 40);
          const loremText = getLoremIpsumForBox(boxW, boxH, {
            fontFamily: 'Montserrat',
            fontSize: 32,
            fontWeight: '700',
            lineHeight: 1.2
          });
          el = this.board.addTextElement({
            text: loremText,
            x,
            y,
            width: boxW,
            height: boxH,
            color: defaultTextColor,
            boundary: 'box'
          });
        } else {
          el = this.board.addTextElement({
            text: LOREM_IPSUM,
            x: start.x,
            y: start.y,
            color: defaultTextColor,
            boundary: 'dynamic'
          });
        }

        this.board.selectElement(el.id);
        const cardDom = document.getElementById(`dom_${el.id}`);
        if (cardDom) {
          this.openInlineEditor(el, cardDom);
        }
        return;
      }

      if (this.isMarquee) {
        this.isMarquee = false;
        this.marqueeBox.style.display = 'none';
        this.clearGuides();
      }
    };

    vp.addEventListener('pointerup', pointerUpHandler);
    vp.addEventListener('pointercancel', pointerUpHandler);

    // Mouse wheel zoom & pan (Option/Alt + Scroll zooms in/out like Studio and Vector)
    vp.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.altKey || e.ctrlKey || e.metaKey) {
        // Option/Alt or Ctrl/Meta (including trackpad pinch-to-zoom) zooms centered at pointer
        const unit = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? vp.clientHeight : 1);
        const factor = Math.max(0.7, Math.min(1.4, Math.exp(-e.deltaY * unit * 0.0035)));
        this.setZoom(this.zoom * factor, e.clientX, e.clientY);
      } else {
        // Normal scroll pans the canvas
        const unit = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? vp.clientHeight : 1);
        let deltaX = (e.deltaX || 0) * unit;
        let deltaY = (e.deltaY || 0) * unit;
        if (e.shiftKey && deltaX === 0 && deltaY !== 0) {
          // Shift + wheel scrolls horizontally
          deltaX = deltaY;
          deltaY = 0;
        }
        this.panX -= deltaX;
        this.panY -= deltaY;
        this.updateWorldTransform();
      }
    }, { passive: false });

    // Trackpad gesture pinch-to-zoom (Safari / macOS)
    let gestureStartZoom = 1;
    vp.addEventListener('gesturestart', (e) => {
      e.preventDefault();
      gestureStartZoom = this.zoom;
    }, { passive: false });

    vp.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      this.setZoom(gestureStartZoom * e.scale, e.clientX, e.clientY);
    }, { passive: false });

    vp.addEventListener('gestureend', (e) => {
      e.preventDefault();
    }, { passive: false });

    // Drag-and-drop onto workspace
    this.container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      this.container.classList.add('drag-over');
    });

    this.container.addEventListener('dragleave', () => {
      this.container.classList.remove('drag-over');
    });

    this.container.addEventListener('drop', async (e) => {
      e.preventDefault();
      this.container.classList.remove('drag-over');

      const canvasPt = this.screenToCanvas(e.clientX, e.clientY);

      // 1. Check if dropped from Swipe File library
      const libraryItemId = e.dataTransfer.getData('application/x-inspire-item');
      if (libraryItemId) {
        const item = this.swipeFile.items.find(it => it.id === libraryItemId);
        if (item) {
          this.dropLibraryItemOntoBoard(item, canvasPt.x, canvasPt.y);
          return;
        }
      }

      // 2. Check if dropped files
      const files = Array.from(e.dataTransfer.files || []);
      if (files.length) {
        for (const f of files) {
          if (f.name.endsWith('.vid') || f.type.includes('json')) {
            const docData = await InspireDocument.parseVidFile(f);
            window.__visterasLoadDocument?.(docData, f.name);
            return;
          }
          if (f.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = async (evt) => {
              const dataUrl = evt.target.result;
              // Add to library
              const item = await this.swipeFile.addItem({
                type: 'image',
                content: dataUrl,
                title: f.name.replace(/\.[^/.]+$/, ''),
                source: 'drop'
              });
              // Drop on board
              this.board.addImageElement({
                src: dataUrl,
                x: canvasPt.x,
                y: canvasPt.y,
                title: item.title
              });
            };
            reader.readAsDataURL(f);
          }
        }
        return;
      }

      // 3. Plain text or URL drop
      const text = e.dataTransfer.getData('text/plain');
      if (text) {
        const item = await this.swipeFile.addItem({
          type: 'text',
          content: text,
          source: 'drop'
        });
        this.dropLibraryItemOntoBoard(item, canvasPt.x, canvasPt.y);
      }
    });

    // Double-click inline text edit
    this.container.addEventListener('dblclick', (e) => {
      const elDom = e.target.closest('.inspire-element');
      if (!elDom) return;
      const id = elDom.dataset.id;
      const el = this.board.getElementById(id);
      if (!el) return;

      if (el.type === 'text' || el.type === 'sticky' || el.type === 'quote' || (el.type === 'image' && el.data?.polaroid)) {
        this.openInlineEditor(el, elDom);
      }
    });

    // Auto-fit to workspace once viewport dimensions are established by layout
    if (typeof ResizeObserver !== 'undefined' && this.viewport) {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const cr = entry.contentRect;
          if (cr.width > 0 && cr.height > 0 && !this.hasInitialFitted) {
            this.fitToScreen();
          }
        }
      });
      this.resizeObserver.observe(this.viewport);
    }
  }

  dropLibraryItemOntoBoard(item, x, y) {
    switch (item.type) {
      case 'image':
        this.board.addImageElement({
          src: item.content,
          x,
          y,
          title: item.title,
          polaroid: item.category === 'Photos' && Math.random() > 0.5
        });
        break;
      case 'quote':
        this.board.addQuoteElement({
          quote: item.meta?.quote || item.content,
          author: item.meta?.author || '',
          x,
          y
        });
        break;
      case 'color':
        if (Array.isArray(item.colors) && item.colors.length > 1) {
          // Drop palette cluster
          item.colors.forEach((hex, i) => {
            this.board.addSwatchElement({
              hex,
              x: x + i * 150,
              y
            });
          });
        } else {
          this.board.addSwatchElement({
            hex: item.colors?.[0] || '#f59e0b',
            x,
            y
          });
        }
        break;
      case 'text':
      default:
        if (item.category === 'Sticky Notes' || item.content.length < 180) {
          this.board.addStickyElement({
            text: item.content,
            x,
            y
          });
        } else {
          this.board.addTextElement({
            text: item.content,
            x,
            y
          });
        }
        break;
    }
  }

  openInlineEditor(el, dom) {
    if (el.type === 'sticky') {
      const stickyTa = dom.querySelector('.sticky-note-textarea');
      if (stickyTa) {
        stickyTa.focus();
        stickyTa.select();
        return;
      }
    }

    // Dismiss any existing inline editor
    const existing = document.querySelector('.inspire-inline-editor');
    if (existing) {
      existing.blur();
    }

    const isQuote = el.type === 'quote';
    const isPolaroid = el.type === 'image' && el.data?.polaroid;
    const isText = el.type === 'text';

    let currentText = '';
    if (isText) currentText = el.data?.text || '';
    else if (isQuote) currentText = el.data?.quote || '';
    else if (isPolaroid) currentText = el.data?.caption || el.data?.title || '';

    const textarea = document.createElement('textarea');
    textarea.className = 'inspire-inline-editor';
    textarea.value = currentText || '';
    textarea.style.position = 'absolute';
    textarea.style.zIndex = '1000';

    if (isPolaroid) {
      textarea.style.left = '8px';
      textarea.style.right = '8px';
      textarea.style.bottom = '4px';
      textarea.style.width = 'calc(100% - 16px)';
      textarea.style.height = '32px';
      textarea.style.background = '#ffffff';
      textarea.style.color = '#222222';
      textarea.style.border = '2px solid #f59e0b';
      textarea.style.borderRadius = '4px';
      textarea.style.padding = '4px 6px';
      textarea.style.fontSize = '15px';
      textarea.style.fontFamily = '"Caveat", "Comic Sans MS", cursive, sans-serif';
      textarea.style.textAlign = 'center';
      textarea.style.resize = 'none';
      textarea.style.boxSizing = 'border-box';
    } else if (isText) {
      const d = el.data || {};
      const isBox = d.boundary === 'box';
      const defaultTextColor = (this.doc?.background && isDarkColor(this.doc.background)) ? '#ffffff' : '#111827';
      textarea.classList.add('inspire-inline-text-editor');
      if (isBox) textarea.classList.add('is-textbox');
      textarea.style.left = '0';
      textarea.style.top = '0';
      textarea.style.width = '100%';
      textarea.style.height = '100%';
      textarea.style.background = 'transparent';
      textarea.style.color = d.color || defaultTextColor;
      textarea.style.fontFamily = `${d.fontFamily || 'Montserrat'}, sans-serif`;
      textarea.style.fontSize = `${d.fontSize || 32}px`;
      textarea.style.fontWeight = d.fontWeight || '700';
      textarea.style.textAlign = d.align || 'left';
      textarea.style.letterSpacing = `${d.letterSpacing || 0}px`;
      textarea.style.lineHeight = String(d.lineHeight || 1.2);
      textarea.style.border = isBox ? '1px dashed #000000' : '1px solid rgba(63, 143, 247, 0.5)';
      textarea.style.borderRadius = '0';
      textarea.style.padding = '0';
      textarea.style.margin = '0';
      textarea.style.boxSizing = 'border-box';
      textarea.style.outline = 'none';
      textarea.style.resize = 'none';
      textarea.style.overflow = isBox ? 'hidden' : 'visible';
      textarea.style.whiteSpace = isBox ? 'pre-wrap' : 'pre';
      textarea.style.wordBreak = isBox ? 'break-word' : 'normal';
    } else {
      textarea.style.left = '0';
      textarea.style.top = '0';
      textarea.style.width = '100%';
      textarea.style.height = '100%';
      textarea.style.background = 'rgba(17, 24, 39, 0.9)';
      textarea.style.color = '#ffffff';
      textarea.style.border = '2px solid #f59e0b';
      textarea.style.borderRadius = '6px';
      textarea.style.padding = '8px';
      textarea.style.fontSize = '20px';
      textarea.style.fontFamily = 'inherit';
    }

    const innerText = dom.querySelector('.el-inner-text');
    if (innerText) innerText.style.visibility = 'hidden';

    dom.appendChild(textarea);
    textarea.focus();
    textarea.select();

    // Live measurement for point text during typing
    if (isText) {
      const d = el.data || {};
      const isBox = d.boundary === 'box';
      textarea.addEventListener('input', () => {
        el.data.text = textarea.value;
        if (!isBox) {
          const measured = measureTextBounds(textarea.value || ' ', {
            fontFamily: d.fontFamily,
            fontSize: d.fontSize,
            fontWeight: d.fontWeight,
            letterSpacing: d.letterSpacing,
            lineHeight: d.lineHeight
          });
          el.width = measured.width;
          el.height = measured.height;
          dom.style.width = `${el.width}px`;
          dom.style.height = `${el.height}px`;
          this.updateSelectionHandles();
        }
        const inspContent = document.querySelector('#inp_text_content');
        if (inspContent && inspContent.value !== textarea.value) {
          inspContent.value = textarea.value;
        }
      });
    }

    const commit = () => {
      const val = textarea.value;
      if (isText) {
        el.data.text = val;
        const d = el.data || {};
        if (d.boundary !== 'box') {
          const measured = measureTextBounds(val || ' ', {
            fontFamily: d.fontFamily,
            fontSize: d.fontSize,
            fontWeight: d.fontWeight,
            letterSpacing: d.letterSpacing,
            lineHeight: d.lineHeight
          });
          el.width = measured.width;
          el.height = measured.height;
          dom.style.width = `${el.width}px`;
          dom.style.height = `${el.height}px`;
        }
        if (innerText) {
          innerText.textContent = val;
          innerText.style.visibility = '';
        }
        const inspContent = document.querySelector('#inp_text_content');
        if (inspContent && inspContent.value !== val) {
          inspContent.value = val;
        }
      } else if (isQuote) {
        el.data.quote = val;
      } else if (isPolaroid) {
        el.data.caption = val;
        // Live sync with inspector if active
        const inspCap = document.querySelector('#inp_img_caption');
        if (inspCap && inspCap.value !== val) inspCap.value = val;
      }
      this.board.saveHistory(`Edit text in ${el.type}`);
      this.board.notify({ type: 'update', element: el });
      if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
    };

    textarea.addEventListener('blur', commit);
    textarea.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape' || (isPolaroid && e.key === 'Enter') || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        commit();
      }
    });
  }

  startTransform(e, handleType) {
    this.isTransforming = true;
    this.transformType = handleType === 'move' ? 'move' : (handleType === 'rotate' ? 'rotate' : 'resize');
    this.transformHandle = handleType;

    const canvasPt = this.screenToCanvas(e.clientX, e.clientY);
    const selected = this.board.getSelectedElements();

    let cx = 0, cy = 0;
    if (selected.length === 1) {
      cx = selected[0].x + selected[0].width / 2;
      cy = selected[0].y + selected[0].height / 2;
    } else if (selected.length > 1) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      selected.forEach(el => {
        minX = Math.min(minX, el.x);
        maxX = Math.max(maxX, el.x + el.width);
        minY = Math.min(minY, el.y);
        maxY = Math.max(maxY, el.y + el.height);
      });
      cx = (minX + maxX) / 2;
      cy = (minY + maxY) / 2;
    }

    const startAngle = Math.atan2(canvasPt.y - cy, canvasPt.x - cx) * (180 / Math.PI);

    this.transformStart = {
      canvasX: canvasPt.x,
      canvasY: canvasPt.y,
      centerX: cx,
      centerY: cy,
      startAngle: startAngle,
      elements: selected.map(el => ({ ...el, data: { ...el.data } }))
    };

    if (this.transformType === 'rotate') {
      this.viewport.style.cursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="%23ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" d="M 17 5.9 A 8 8 0 1 0 18.9 17.1"/><path fill="%23ffffff" stroke="%23ffffff" stroke-width="2.8" stroke-linejoin="round" d="M 19 18.5 L 21.6 13.6 L 16 16.1 Z"/><path fill="none" stroke="%23000000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M 17 5.9 A 8 8 0 1 0 18.9 17.1"/><path fill="%23000000" stroke="%23000000" stroke-width="0.9" stroke-linejoin="round" d="M 19 18.5 L 21.6 13.6 L 16 16.1 Z"/></svg>') 12 12, crosshair`;
    }

    this.viewport.setPointerCapture(e.pointerId);
  }

  handleTransformMove(e) {
    const curPt = this.screenToCanvas(e.clientX, e.clientY);
    const dx = curPt.x - this.transformStart.canvasX;
    const dy = curPt.y - this.transformStart.canvasY;

    if (this.transformType === 'move') {
      let finalDx = dx;
      let finalDy = dy;

      // Smart Snapping (if gridSnap enabled)
      if (this.doc.gridSnap && this.transformStart.elements.length === 1) {
        const moving = this.transformStart.elements[0];
        const testX = moving.x + dx;
        const testY = moving.y + dy;
        const snap = this.calculateSnap(testX, testY, moving.width, moving.height, moving.id);
        if (snap.snappedX) finalDx = snap.x - moving.x;
        if (snap.snappedY) finalDy = snap.y - moving.y;
        this.renderGuides(snap.guides);
      }

      this.transformStart.elements.forEach(initEl => {
        const el = this.board.getElementById(initEl.id);
        if (el) {
          el.x = Math.round(initEl.x + finalDx);
          el.y = Math.round(initEl.y + finalDy);
        }
      });
      this.board.notify({ type: 'moving' });
    } else if (this.transformType === 'resize') {
      const init = this.transformStart.elements[0];
      const el = this.board.getElementById(init.id);
      if (!el) return;

      const h = this.transformHandle;
      let newW = init.width;
      let newH = init.height;
      let newX = init.x;
      let newY = init.y;

      if (h.includes('e')) newW = Math.max(40, init.width + dx);
      if (h.includes('s')) newH = Math.max(40, init.height + dy);
      if (h.includes('w')) {
        const diff = Math.min(dx, init.width - 40);
        newW = init.width - diff;
        newX = init.x + diff;
      }
      if (h.includes('n')) {
        const diff = Math.min(dy, init.height - 40);
        newH = init.height - diff;
        newY = init.y + diff;
      }

      // Shift key = aspect ratio lock
      if (e.shiftKey) {
        const aspect = init.width / (init.height || 1);
        if (h.includes('e') || h.includes('w')) {
          newH = Math.round(newW / aspect);
        } else {
          newW = Math.round(newH * aspect);
        }
      }

      el.x = Math.round(newX);
      el.y = Math.round(newY);
      el.width = Math.round(newW);
      el.height = Math.round(newH);
      this.board.notify({ type: 'resizing' });
    } else if (this.transformType === 'rotate') {
      const cx = this.transformStart.centerX;
      const cy = this.transformStart.centerY;
      const curAngle = Math.atan2(curPt.y - cy, curPt.x - cx) * (180 / Math.PI);
      const deltaAngle = ((curAngle - this.transformStart.startAngle + 540) % 360) - 180;

      let finalDelta = deltaAngle;
      if (e.shiftKey) {
        // Snap to 15-degree increments while holding Shift (Studio and Vector parity)
        const baseRot = (this.transformStart.elements[0]?.rotation || 0) + deltaAngle;
        const snapped = Math.round(baseRot / 15) * 15;
        finalDelta = snapped - (this.transformStart.elements[0]?.rotation || 0);
      }

      const rad = finalDelta * Math.PI / 180;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);

      this.transformStart.elements.forEach(initEl => {
        const el = this.board.getElementById(initEl.id);
        if (!el) return;

        if (this.transformStart.elements.length === 1) {
          let newRot = Math.round(((initEl.rotation || 0) + finalDelta) * 10) / 10;
          newRot = ((newRot % 360) + 360) % 360;
          el.rotation = newRot;
        } else {
          // Multi-layer rotation around group center
          const lcx = initEl.x + initEl.width / 2;
          const lcy = initEl.y + initEl.height / 2;
          const dx = lcx - cx;
          const dy = lcy - cy;
          const newCx = cx + dx * cosA - dy * sinA;
          const newCy = cy + dx * sinA + dy * cosA;
          el.x = Math.round(newCx - initEl.width / 2);
          el.y = Math.round(newCy - initEl.height / 2);

          let newRot = Math.round(((initEl.rotation || 0) + finalDelta) * 10) / 10;
          newRot = ((newRot % 360) + 360) % 360;
          el.rotation = newRot;
        }
      });

      this.board.notify({ type: 'rotating' });
    }
  }

  calculateSnap(x, y, w, h, ignoreId) {
    const threshold = 8 / this.zoom;
    let snappedX = false, snappedY = false;
    let targetX = x, targetY = y;
    const guides = [];

    const otherElements = this.board.elements.filter(e => e.id !== ignoreId);

    // Candidates: artboard edges & centers
    const xCandidates = [0, this.doc.width / 2, this.doc.width];
    const yCandidates = [0, this.doc.height / 2, this.doc.height];

    // Other element edges & centers
    otherElements.forEach(o => {
      xCandidates.push(o.x, o.x + o.width / 2, o.x + o.width);
      yCandidates.push(o.y, o.y + o.height / 2, o.y + o.height);
    });

    const myEdgesX = [x, x + w / 2, x + w];
    const myEdgesY = [y, y + h / 2, y + h];

    // Find closest X snap
    for (const c of xCandidates) {
      for (const my of myEdgesX) {
        if (Math.abs(c - my) < threshold) {
          targetX = x + (c - my);
          snappedX = true;
          guides.push({ type: 'v', pos: c });
          break;
        }
      }
      if (snappedX) break;
    }

    // Find closest Y snap
    for (const c of yCandidates) {
      for (const my of myEdgesY) {
        if (Math.abs(c - my) < threshold) {
          targetY = y + (c - my);
          snappedY = true;
          guides.push({ type: 'h', pos: c });
          break;
        }
      }
      if (snappedY) break;
    }

    return { x: targetX, y: targetY, snappedX, snappedY, guides };
  }

  renderGuides(guides) {
    this.guidesLayer.innerHTML = '';
    for (const g of guides) {
      const line = document.createElement('div');
      line.className = `inspire-guide-line guide-${g.type}`;
      if (g.type === 'v') line.style.left = `${g.pos}px`;
      else line.style.top = `${g.pos}px`;
      this.guidesLayer.appendChild(line);
    }
  }

  clearGuides() {
    this.guidesLayer.innerHTML = '';
  }

  endTransform() {
    this.isTransforming = false;
    this.viewport.style.cursor = '';
    this.clearGuides();
    const before = this.transformStart?.elements || [];
    this.transformStart = null;
    // A click with no movement must not dirty the doc or add an undo step.
    if (!transformChanged(before, this.board.getSelectedElements())) return;
    this.board.activeLayout = 'custom';
    this.board.saveHistory(`Transformed elements`);
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
