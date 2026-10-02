/**
 * Visteras Inspire — Properties Inspector Panel
 * Dynamic contextual inspector for Board settings, Images, Quotes, Text, Notes, Swatches, and Multi-selection.
 */

import { CANVAS_PRESETS } from './document.js';
import { DEFAULT_FONTS, loadFontFamily } from '../lib/visteras-fonts.js';
import { extractPaletteFromImage } from './color-extractor.js';
import { measureTextBounds } from './board-composer.js';

export class InspectorPanel {
  constructor({ container, doc, boardComposer, canvas, onDocChange, onSaveLibrary }) {
    this.container = container;
    this.doc = doc;
    this.board = boardComposer;
    this.canvas = canvas;
    this.onDocChange = onDocChange;
    this.onSaveLibrary = onSaveLibrary;
    this.activeView = null; // null | 'add_quote'
    this.addQuoteCallbacks = null;

    this.initDOM();
    this.render();

    this.boardUnsubscribe = this.board.subscribe((evt) => {
      if (evt.type === 'selection') {
        if (this.board.getSelectedElements().length > 0) {
          this.activeView = null;
        }
        this.render();
      } else if (evt.type === 'update' || evt.type === 'history') {
        // Do NOT re-render inspector while user is actively focused on an input/textarea inside inspector,
        // because tearing down the DOM loses input focus, resetting activeElement to body and triggering
        // global keyboard shortcuts (e.g. Backspace deleting elements, S adding stickies, etc.)
        if (document.activeElement && this.container.contains(document.activeElement)) {
          return;
        }
        this.render();
      } else if (evt.type === 'delete' || evt.type === 'undo' || evt.type === 'redo') {
        this.render();
      }
    });
  }

  switchDocument({ doc, board, canvas } = {}) {
    if (doc) this.doc = doc;
    if (board) this.board = board;
    if (canvas) this.canvas = canvas;
    this.activeView = null;

    if (this.boardUnsubscribe) {
      this.boardUnsubscribe();
    }
    this.boardUnsubscribe = this.board.subscribe((evt) => {
      if (evt.type === 'selection') {
        if (this.board.getSelectedElements().length > 0) {
          this.activeView = null;
        }
        this.render();
      } else if (evt.type === 'update' || evt.type === 'history') {
        if (document.activeElement && this.container.contains(document.activeElement)) {
          return;
        }
        this.render();
      } else if (evt.type === 'delete' || evt.type === 'undo' || evt.type === 'redo') {
        this.render();
      }
    });
    this.render();
  }

  showAddQuoteForm(options = {}) {
    this.addQuoteCallbacks = options;
    this.activeView = 'add_quote';
    this.render();
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="inspire-inspector-scroll">
        <div id="inspector_content"></div>
      </div>
    `;
    this.content = this.container.querySelector('#inspector_content');

    // Prevent typing inside inspector inputs from bubbling to global window keyboard shortcuts
    this.container.addEventListener('keydown', (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') {
        document.activeElement?.blur?.();
      }
    });
    this.container.addEventListener('keyup', (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    });
    this.container.addEventListener('keypress', (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
    });
  }

  render() {
    // If the user is currently typing in an input or textarea inside this inspector,
    // do not destroy and rebuild the DOM under their cursor.
    if (document.activeElement && this.container?.contains(document.activeElement)) {
      return;
    }

    if (this.activeView === 'add_quote') {
      this.renderAddQuoteForm();
      return;
    }

    const selected = this.board.getSelectedElements();

    if (selected.length === 0) {
      this.renderBoardProperties();
    } else if (selected.length === 1) {
      this.renderSingleElementProperties(selected[0]);
    } else {
      this.renderMultiSelectionProperties(selected);
    }
  }

  renderBoardProperties() {
    let presetOptions = '';
    for (const [key, val] of Object.entries(CANVAS_PRESETS)) {
      const isSel = this.doc.preset === key ? 'selected' : '';
      presetOptions += `<option value="${key}" ${isSel}>${val.name}</option>`;
    }

    this.content.innerHTML = `
      <div class="inspector-section">
        <div class="inspector-section-title">Board Settings</div>
        
        <div class="inspector-row">
          <label class="inspector-label">Mode</label>
          <div class="inspector-btn-group">
            <button type="button" class="inspector-toggle-btn ${this.doc.mode === 'fixed' ? 'active' : ''}" id="btn_mode_fixed" title="Fixed Artboard for defined printing and digital framing">Fixed Board</button>
            <button type="button" class="inspector-toggle-btn ${this.doc.mode === 'infinite' ? 'active' : ''}" id="btn_mode_infinite" title="Infinite Canvas for boundless brainstorming">Infinite</button>
          </div>
        </div>

        ${this.doc.mode === 'fixed' ? `
          <div class="inspector-row">
            <label class="inspector-label">Preset</label>
            <select class="inspector-select" id="inp_board_preset">
              ${presetOptions}
            </select>
          </div>

          <div class="inspector-row dual-inputs">
            <div>
              <label class="inspector-label-sub">Width (px)</label>
              <input type="number" class="inspector-input" id="inp_board_w" value="${this.doc.width}" />
            </div>
            <div>
              <label class="inspector-label-sub">Height (px)</label>
              <input type="number" class="inspector-input" id="inp_board_h" value="${this.doc.height}" />
            </div>
          </div>
        ` : ''}

        <div class="inspector-row">
          <label class="inspector-label">Background</label>
          <div class="inspector-color-row">
            <input type="color" class="inspector-color-picker" id="inp_board_bg" value="${this.doc.background || '#ffffff'}" />
            <input type="text" class="inspector-input" id="inp_board_bg_hex" value="${this.doc.background || '#ffffff'}" />
          </div>
        </div>

        <div class="inspector-row">
          <label class="inspector-label">Pattern</label>
          <select class="inspector-select" id="inp_board_pattern">
            <option value="blank" ${this.doc.bgPattern === 'blank' ? 'selected' : ''}>Solid / Blank</option>
            <option value="dots" ${this.doc.bgPattern === 'dots' ? 'selected' : ''}>Subtle Dots</option>
            <option value="grid" ${this.doc.bgPattern === 'grid' ? 'selected' : ''}>Blueprint Grid</option>
          </select>
        </div>

        <div class="inspector-row inspector-checkbox-row">
          <label class="inspector-checkbox-label" for="chk_grid_snap">
            <input type="checkbox" id="chk_grid_snap" class="inspector-checkbox" ${this.doc.gridSnap ? 'checked' : ''} />
            <span>Smart Snapping</span>
          </label>
        </div>
      </div>

      <div class="inspector-section">
        <div class="inspector-section-title">Add Elements</div>
        <div class="inspector-actions-grid">
          <button type="button" class="btn_visteras_amber w-100 mb-2" id="action_panel_add_quote">
            + Add Inspiring Quote
          </button>
        </div>
      </div>

      <div class="inspector-section">
        <div class="inspector-section-title">Quick Actions</div>
        <div class="inspector-actions-grid">
          <button type="button" class="btn_visteras_secondary w-100 mb-2" id="action_fit_view">Fit Board in View (⌘0)</button>
          <button type="button" class="btn_visteras_secondary w-100" id="action_clear_board">Clear All Board Elements</button>
        </div>
      </div>
    `;

    // Wire listeners
    this.content.querySelector('#action_panel_add_quote')?.addEventListener('click', () => {
      this.showAddQuoteForm();
    });

    this.content.querySelector('#btn_mode_fixed')?.addEventListener('click', () => {
      this.canvas.setMode('fixed');
      this.render();
    });

    this.content.querySelector('#btn_mode_infinite')?.addEventListener('click', () => {
      this.canvas.setMode('infinite');
      this.render();
    });

    this.content.querySelector('#inp_board_preset')?.addEventListener('change', (e) => {
      this.canvas.setPreset(e.target.value);
      this.render();
    });

    this.content.querySelector('#inp_board_w')?.addEventListener('change', (e) => {
      this.doc.width = parseInt(e.target.value, 10) || 1920;
      this.canvas.renderArtboardMeta();
    });

    this.content.querySelector('#inp_board_h')?.addEventListener('change', (e) => {
      this.doc.height = parseInt(e.target.value, 10) || 1080;
      this.canvas.renderArtboardMeta();
    });

    const bgPicker = this.content.querySelector('#inp_board_bg');
    const bgHex = this.content.querySelector('#inp_board_bg_hex');
    bgPicker?.addEventListener('input', (e) => {
      this.doc.background = e.target.value;
      if (bgHex) bgHex.value = e.target.value;
      this.canvas.renderArtboardMeta();
    });
    bgHex?.addEventListener('change', (e) => {
      this.doc.background = e.target.value;
      if (bgPicker) bgPicker.value = e.target.value;
      this.canvas.renderArtboardMeta();
    });

    this.content.querySelector('#inp_board_pattern')?.addEventListener('change', (e) => {
      this.doc.bgPattern = e.target.value;
      this.canvas.renderArtboardMeta();
    });

    this.content.querySelector('#chk_grid_snap')?.addEventListener('change', (e) => {
      this.doc.gridSnap = e.target.checked;
    });

    this.content.querySelector('#action_fit_view')?.addEventListener('click', () => {
      this.canvas.fitToScreen();
    });

    this.content.querySelector('#action_clear_board')?.addEventListener('click', () => {
      if (confirm('Clear all elements from the inspiration board?')) {
        this.board.clearBoard();
      }
    });
  }

  renderAddQuoteForm() {
    const fontOptions = DEFAULT_FONTS.map(f =>
      `<option value="${f}" ${f === 'Playfair Display' ? 'selected' : ''}>${f}</option>`
    ).join('');

    this.content.innerHTML = `
      <div class="inspector-section add-quote-panel-card">
        <div class="inspector-section-header-row">
          <div class="inspector-section-title">Add Inspiring Quote</div>
          <button type="button" class="btn_icon_close" id="btn_cancel_add_quote_top" title="Cancel">✕</button>
        </div>
        <p class="inspector-desc-text">Compose typography & quotes directly on your moodboard.</p>

        <div class="inspector-row">
          <label class="inspector-label" for="inp_add_quote_text">Quote Text *</label>
          <textarea id="inp_add_quote_text" class="inspector-textarea" rows="4" placeholder="Enter inspiring quote text...">The details are not the details. They make the design.</textarea>
        </div>

        <div class="inspector-row">
          <label class="inspector-label" for="inp_add_quote_author">Author / Attribution</label>
          <input type="text" id="inp_add_quote_author" class="inspector-input" value="Charles Eames" placeholder="e.g. Charles Eames" />
        </div>

        <div class="inspector-row">
          <label class="inspector-label" for="inp_add_quote_cite">Citation / Source</label>
          <input type="text" id="inp_add_quote_cite" class="inspector-input" value="" placeholder="Book, lecture, or project..." />
        </div>

        <div class="inspector-row">
          <label class="inspector-label" for="inp_add_quote_style">Quote Style</label>
          <select class="inspector-select" id="inp_add_quote_style">
            <option value="editorial" selected>Editorial Magazine (Serif italic)</option>
            <option value="modern">Modern Minimal (Clean sans-serif)</option>
            <option value="classic">Classic Serif (Traditional elegance)</option>
          </select>
        </div>

        <div class="inspector-row">
          <label class="inspector-label" for="inp_add_quote_font">Typeface</label>
          <select class="inspector-select" id="inp_add_quote_font">
            ${fontOptions}
          </select>
        </div>

        <div class="inspector-row">
          <label class="inspector-label" for="inp_add_quote_size">Font Size</label>
          <div class="slider-with-val">
            <input type="range" class="inspector-slider" id="inp_add_quote_size" min="14" max="48" value="22" />
            <span class="slider-val" id="val_add_quote_size">22px</span>
          </div>
        </div>

        <div class="inspector-row">
          <label class="inspector-label" for="inp_add_quote_bg">Card Background</label>
          <div class="inspector-color-row">
            <input type="color" class="inspector-color-picker" id="inp_add_quote_bg" value="#1a1c23" />
            <input type="text" class="inspector-input" id="inp_add_quote_bg_hex" value="#1a1c23" />
          </div>
        </div>

        <div class="inspector-row">
          <label class="inspector-label" for="inp_add_quote_color">Text Color</label>
          <div class="inspector-color-row">
            <input type="color" class="inspector-color-picker" id="inp_add_quote_color" value="#f8fafc" />
            <input type="text" class="inspector-input" id="inp_add_quote_color_hex" value="#f8fafc" />
          </div>
        </div>

        <div class="inspector-actions-block mt-3">
          <button type="button" class="btn_visteras_amber w-100 mb-2" id="btn_confirm_add_quote">
            + Add Quote to Moodboard
          </button>
          <button type="button" class="btn_visteras_secondary w-100 mb-2" id="btn_save_quote_library">
            Save to Swipe Library
          </button>
          <button type="button" class="btn_visteras_text w-100" id="btn_cancel_add_quote">
            Cancel
          </button>
        </div>
      </div>
    `;

    // Focus textarea
    const quoteTextEl = this.content.querySelector('#inp_add_quote_text');
    if (quoteTextEl) {
      setTimeout(() => {
        quoteTextEl.focus();
        quoteTextEl.select();
      }, 50);
    }

    // Sliders & pickers
    const sizeSlider = this.content.querySelector('#inp_add_quote_size');
    const sizeVal = this.content.querySelector('#val_add_quote_size');
    sizeSlider?.addEventListener('input', (e) => {
      if (sizeVal) sizeVal.textContent = `${e.target.value}px`;
    });

    const bgPicker = this.content.querySelector('#inp_add_quote_bg');
    const bgHex = this.content.querySelector('#inp_add_quote_bg_hex');
    bgPicker?.addEventListener('input', (e) => {
      if (bgHex) bgHex.value = e.target.value;
    });
    bgHex?.addEventListener('change', (e) => {
      if (bgPicker) bgPicker.value = e.target.value;
    });

    const colorPicker = this.content.querySelector('#inp_add_quote_color');
    const colorHex = this.content.querySelector('#inp_add_quote_color_hex');
    colorPicker?.addEventListener('input', (e) => {
      if (colorHex) colorHex.value = e.target.value;
    });
    colorHex?.addEventListener('change', (e) => {
      if (colorPicker) colorPicker.value = e.target.value;
    });

    const closeForm = () => {
      this.activeView = null;
      this.render();
    };

    this.content.querySelector('#btn_cancel_add_quote_top')?.addEventListener('click', closeForm);
    this.content.querySelector('#btn_cancel_add_quote')?.addEventListener('click', closeForm);

    const getFormData = () => {
      const quote = this.content.querySelector('#inp_add_quote_text')?.value.trim() || 'The details are not the details. They make the design.';
      const author = this.content.querySelector('#inp_add_quote_author')?.value.trim() || '';
      const cite = this.content.querySelector('#inp_add_quote_cite')?.value.trim() || '';
      const quoteStyle = this.content.querySelector('#inp_add_quote_style')?.value || 'editorial';
      const fontFamily = this.content.querySelector('#inp_add_quote_font')?.value || 'Playfair Display';
      const fontSize = parseInt(this.content.querySelector('#inp_add_quote_size')?.value, 10) || 22;
      const bg = this.content.querySelector('#inp_add_quote_bg')?.value || '#1a1c23';
      const color = this.content.querySelector('#inp_add_quote_color')?.value || '#f8fafc';
      return { quote, author, cite, quoteStyle, fontFamily, fontSize, bg, color };
    };

    this.content.querySelector('#btn_confirm_add_quote')?.addEventListener('click', () => {
      const data = getFormData();
      loadFontFamily({ family: data.fontFamily }).catch(() => {});

      if (this.addQuoteCallbacks?.onAdd) {
        this.addQuoteCallbacks.onAdd(data);
      } else {
        const center = this.canvas.getViewportCenter ? this.canvas.getViewportCenter() : { x: 400, y: 300 };
        const el = this.board.addQuoteElement({
          ...data,
          x: Math.round(center.x - 190),
          y: Math.round(center.y - 110)
        });
        this.board.selectElement(el.id);
      }
      this.activeView = null;
      this.render();
    });

    this.content.querySelector('#btn_save_quote_library')?.addEventListener('click', () => {
      const data = getFormData();
      const saveCb = this.addQuoteCallbacks?.onSaveLibrary || this.onSaveLibrary;
      if (saveCb) {
        saveCb(data);
      }
    });
  }

  renderSingleElementProperties(el) {
    const d = el.data || {};
    let typeSpecificHtml = '';

    if (el.type === 'image') {
      typeSpecificHtml = `
        <div class="inspector-section">
          <div class="inspector-section-title">Image Styling</div>

          <div class="inspector-row inspector-checkbox-row">
            <label class="inspector-checkbox-label" for="inp_img_polaroid">
              <input type="checkbox" id="inp_img_polaroid" class="inspector-checkbox" ${d.polaroid ? 'checked' : ''} />
              <span>Polaroid Frame</span>
            </label>
          </div>

          ${d.polaroid ? `
            <div class="inspector-row">
              <label class="inspector-label">Caption</label>
              <input type="text" class="inspector-input" id="inp_img_caption" value="${d.caption || ''}" placeholder="Handwritten caption..." />
            </div>
          ` : `
            <div class="inspector-row">
              <label class="inspector-label">Corner Radius</label>
              <input type="range" class="inspector-slider" id="inp_img_radius" min="0" max="40" value="${d.radius ?? 8}" />
              <span class="slider-val">${d.radius ?? 8}px</span>
            </div>
          `}

          <div class="inspector-row">
            <label class="inspector-label">Mood Filter</label>
            <select class="inspector-select" id="inp_img_filter">
              <option value="none" ${d.filter === 'none' ? 'selected' : ''}>Original / Clean</option>
              <option value="warm" ${d.filter === 'warm' ? 'selected' : ''}>Warm Vintage</option>
              <option value="golden" ${d.filter === 'golden' ? 'selected' : ''}>Golden Hour</option>
              <option value="cool" ${d.filter === 'cool' ? 'selected' : ''}>Cool Editorial</option>
              <option value="bw" ${d.filter === 'bw' ? 'selected' : ''}>B&W Contrast</option>
              <option value="moody" ${d.filter === 'moody' ? 'selected' : ''}>Moody & Dark</option>
            </select>
          </div>

          <div class="inspector-row">
            <label class="inspector-label">Image Fit</label>
            <select class="inspector-select" id="inp_img_fit">
              <option value="cover" ${d.fit === 'cover' ? 'selected' : ''}>Cover (Fill)</option>
              <option value="contain" ${d.fit === 'contain' ? 'selected' : ''}>Contain (Full)</option>
            </select>
          </div>

          <div class="inspector-row mt-2">
            <button type="button" class="btn_visteras_secondary w-100" id="btn_extract_palette">
              Extract Color Palette to Board
            </button>
          </div>
        </div>
      `;
    } else if (el.type === 'quote') {
      const fontOptions = DEFAULT_FONTS.map(f =>
        `<option value="${f}" ${d.fontFamily === f ? 'selected' : ''}>${f}</option>`
      ).join('');

      typeSpecificHtml = `
        <div class="inspector-section">
          <div class="inspector-section-title">Quote Content</div>

          <div class="inspector-row">
            <label class="inspector-label" for="inp_quote_text">Quote Text</label>
            <textarea class="inspector-textarea" id="inp_quote_text" rows="4" placeholder="Enter inspiring quote text...">${d.quote || ''}</textarea>
          </div>

          <div class="inspector-row">
            <label class="inspector-label" for="inp_quote_author">Author / Attribution</label>
            <input type="text" class="inspector-input" id="inp_quote_author" value="${d.author || ''}" placeholder="Attribution..." />
          </div>

          <div class="inspector-row">
            <label class="inspector-label" for="inp_quote_cite">Citation / Source</label>
            <input type="text" class="inspector-input" id="inp_quote_cite" value="${d.cite || ''}" placeholder="Book or source..." />
          </div>
        </div>

        <div class="inspector-section">
          <div class="inspector-section-title">Quote Typography & Colors</div>

          <div class="inspector-row">
            <label class="inspector-label" for="inp_quote_font">Typeface</label>
            <select class="inspector-select" id="inp_quote_font">
              ${fontOptions}
            </select>
          </div>

          <div class="inspector-row">
            <label class="inspector-label" for="inp_quote_size">Font Size</label>
            <div class="slider-with-val">
              <input type="range" class="inspector-slider" id="inp_quote_size" min="14" max="48" value="${d.fontSize || 22}" />
              <span class="slider-val" id="val_quote_size">${d.fontSize || 22}px</span>
            </div>
          </div>

          <div class="inspector-row">
            <label class="inspector-label" for="inp_quote_style">Style</label>
            <select class="inspector-select" id="inp_quote_style">
              <option value="editorial" ${d.quoteStyle === 'editorial' ? 'selected' : ''}>Editorial Magazine</option>
              <option value="modern" ${d.quoteStyle === 'modern' ? 'selected' : ''}>Modern Minimal</option>
              <option value="classic" ${d.quoteStyle === 'classic' ? 'selected' : ''}>Classic Serif</option>
            </select>
          </div>

          <div class="inspector-row">
            <label class="inspector-label" for="inp_quote_bg">Card Background</label>
            <div class="inspector-color-row">
              <input type="color" class="inspector-color-picker" id="inp_quote_bg" value="${d.bg || '#1a1c23'}" />
              <input type="text" class="inspector-input" id="inp_quote_bg_hex" value="${d.bg || '#1a1c23'}" />
            </div>
          </div>

          <div class="inspector-row">
            <label class="inspector-label" for="inp_quote_color">Text Color</label>
            <div class="inspector-color-row">
              <input type="color" class="inspector-color-picker" id="inp_quote_color" value="${d.color || '#f8fafc'}" />
              <input type="text" class="inspector-input" id="inp_quote_color_hex" value="${d.color || '#f8fafc'}" />
            </div>
          </div>

          <div class="inspector-row mt-2">
            <button type="button" class="btn_visteras_secondary w-100" id="btn_quote_save_lib">
              Save Quote to Swipe Library
            </button>
          </div>
        </div>
      `;
    } else if (el.type === 'text') {
      const fontOptions = DEFAULT_FONTS.map(f =>
        `<option value="${f}" ${d.fontFamily === f ? 'selected' : ''}>${f}</option>`
      ).join('');

      typeSpecificHtml = `
        <div class="inspector-section">
          <div class="inspector-section-title">Text Content</div>
          <div class="inspector-row">
            <label class="inspector-label" for="inp_text_content">Text Content</label>
            <textarea class="inspector-textarea" id="inp_text_content" rows="3" placeholder="Enter text...">${d.text || ''}</textarea>
          </div>
        </div>

        <div class="inspector-section">
          <div class="inspector-section-title">Text Boundary & Layout</div>
          <div class="inspector-row">
            <label class="inspector-label">Boundary Mode</label>
            <select class="inspector-select" id="inp_text_boundary">
              <option value="dynamic" ${(!d.boundary || d.boundary === 'dynamic' || d.boundary === 'point') ? 'selected' : ''}>Point Text (Auto-fit Content)</option>
              <option value="box" ${d.boundary === 'box' ? 'selected' : ''}>Textbox (Wrap in Box)</option>
            </select>
          </div>
        </div>

        <div class="inspector-section">
          <div class="inspector-section-title">Typography & Style</div>

          <div class="inspector-row">
            <label class="inspector-label">Typeface</label>
            <select class="inspector-select" id="inp_text_font">
              ${fontOptions}
            </select>
          </div>

          <div class="inspector-row">
            <label class="inspector-label">Size</label>
            <input type="range" class="inspector-slider" id="inp_text_size" min="12" max="120" value="${d.fontSize || 32}" />
            <span class="slider-val" id="val_text_size">${d.fontSize || 32}px</span>
          </div>

          <div class="inspector-row">
            <label class="inspector-label">Weight</label>
            <select class="inspector-select" id="inp_text_weight">
              <option value="300" ${d.fontWeight === '300' ? 'selected' : ''}>Light (300)</option>
              <option value="400" ${d.fontWeight === '400' ? 'selected' : ''}>Regular (400)</option>
              <option value="500" ${d.fontWeight === '500' ? 'selected' : ''}>Medium (500)</option>
              <option value="600" ${d.fontWeight === '600' ? 'selected' : ''}>Semi-Bold (600)</option>
              <option value="700" ${d.fontWeight === '700' ? 'selected' : ''}>Bold (700)</option>
              <option value="800" ${d.fontWeight === '800' ? 'selected' : ''}>Extra-Bold (800)</option>
              <option value="900" ${d.fontWeight === '900' ? 'selected' : ''}>Black (900)</option>
            </select>
          </div>

          <div class="inspector-row">
            <label class="inspector-label">Letter Spacing (px)</label>
            <input type="range" class="inspector-slider" id="inp_text_spacing" min="-2" max="20" value="${d.letterSpacing || 0}" />
            <span class="slider-val" id="val_text_spacing">${d.letterSpacing || 0}px</span>
          </div>

          <div class="inspector-row">
            <label class="inspector-label">Color</label>
            <div class="inspector-color-row">
              <input type="color" class="inspector-color-picker" id="inp_text_color" value="${d.color || '#ffffff'}" />
              <input type="text" class="inspector-input" id="inp_text_color_hex" value="${d.color || '#ffffff'}" />
            </div>
          </div>

          <div class="inspector-row">
            <label class="inspector-label">Alignment</label>
            <div class="inspector-btn-group">
              <button type="button" class="inspector-toggle-btn ${d.align === 'left' || !d.align ? 'active' : ''}" id="btn_align_left">Left</button>
              <button type="button" class="inspector-toggle-btn ${d.align === 'center' ? 'active' : ''}" id="btn_align_center">Center</button>
              <button type="button" class="inspector-toggle-btn ${d.align === 'right' ? 'active' : ''}" id="btn_align_right">Right</button>
            </div>
          </div>
        </div>
      `;
    } else if (el.type === 'sticky') {
      const colors = [
        { name: 'Yellow', hex: '#fef08a' },
        { name: 'Peach', hex: '#fed7aa' },
        { name: 'Mint', hex: '#bbf7d0' },
        { name: 'Lavender', hex: '#e9d5ff' },
        { name: 'Rose', hex: '#fbcfe8' },
        { name: 'Dark Slate', hex: '#1e293b' }
      ];

      const colorChips = colors.map(c => `
        <button type="button" class="sticky-color-chip ${d.color === c.hex ? 'active' : ''}" data-color="${c.hex}" style="background:${c.hex};" title="${c.name}"></button>
      `).join('');

      typeSpecificHtml = `
        <div class="inspector-section">
          <div class="inspector-section-title">Sticky Note Content</div>

          <div class="inspector-row">
            <label class="inspector-label" for="inp_sticky_text">Note Text</label>
            <textarea class="inspector-textarea" id="inp_sticky_text" rows="4" placeholder="Write your note here...">${d.text || ''}</textarea>
          </div>
        </div>

        <div class="inspector-section">
          <div class="inspector-section-title">Sticky Note Styling</div>

          <div class="inspector-row">
            <label class="inspector-label">Card Tint</label>
            <div class="sticky-color-chips-row">${colorChips}</div>
          </div>

          <div class="inspector-row inspector-checkbox-row">
            <label class="inspector-checkbox-label" for="inp_sticky_tape">
              <input type="checkbox" id="inp_sticky_tape" class="inspector-checkbox" ${d.tape ? 'checked' : ''} />
              <span>Washi Tape</span>
            </label>
          </div>

          <div class="inspector-row inspector-checkbox-row">
            <label class="inspector-checkbox-label" for="inp_sticky_pin">
              <input type="checkbox" id="inp_sticky_pin" class="inspector-checkbox" ${d.pin ? 'checked' : ''} />
              <span>Pushpin</span>
            </label>
          </div>

          <div class="inspector-row">
            <label class="inspector-label">Typeface</label>
            <select class="inspector-select" id="inp_sticky_font">
              <option value="handwriting" ${d.font === 'handwriting' ? 'selected' : ''}>Handwriting</option>
              <option value="sans" ${d.font === 'sans' ? 'selected' : ''}>Clean Sans</option>
            </select>
          </div>
        </div>
      `;
    } else if (el.type === 'swatch') {
      typeSpecificHtml = `
        <div class="inspector-section">
          <div class="inspector-section-title">Color Swatch</div>

          <div class="inspector-row">
            <label class="inspector-label">Color Tone</label>
            <div class="inspector-color-row">
              <input type="color" class="inspector-color-picker" id="inp_swatch_color" value="${d.hex || '#f59e0b'}" />
              <input type="text" class="inspector-input" id="inp_swatch_hex" value="${d.hex || '#f59e0b'}" />
            </div>
          </div>

          <div class="inspector-row">
            <label class="inspector-label">Name</label>
            <input type="text" class="inspector-input" id="inp_swatch_name" value="${d.name || ''}" placeholder="Color name..." />
          </div>

          <div class="inspector-row">
            <label class="inspector-label">Role / Label</label>
            <input type="text" class="inspector-input" id="inp_swatch_label" value="${d.label || ''}" placeholder="e.g. Primary Accent" />
          </div>
        </div>
      `;
    }

    this.content.innerHTML = `
      <div class="inspector-section">
        <div class="inspector-section-title">Transform & Position</div>
        <div class="inspector-row dual-inputs">
          <div>
            <label class="inspector-label-sub">X (px)</label>
            <input type="number" class="inspector-input" id="inp_pos_x" value="${el.x}" />
          </div>
          <div>
            <label class="inspector-label-sub">Y (px)</label>
            <input type="number" class="inspector-input" id="inp_pos_y" value="${el.y}" />
          </div>
        </div>

        <div class="inspector-row dual-inputs">
          <div>
            <label class="inspector-label-sub">Width</label>
            <input type="number" class="inspector-input" id="inp_dim_w" value="${el.width}" />
          </div>
          <div>
            <label class="inspector-label-sub">Height</label>
            <input type="number" class="inspector-input" id="inp_dim_h" value="${el.height}" />
          </div>
        </div>

        <div class="inspector-row">
          <label class="inspector-label">Rotation (°)</label>
          <input type="range" class="inspector-slider" id="inp_rot" min="-180" max="180" value="${el.rotation || 0}" />
          <span class="slider-val">${el.rotation || 0}°</span>
        </div>
      </div>

      ${typeSpecificHtml}

      <div class="inspector-section">
        <div class="inspector-section-title">Layer Arrange</div>
        <div class="inspector-arrange-grid">
          <button type="button" class="btn_visteras_arrange" id="btn_bring_front" title="Bring to Front">
            <img src="images/move_top.svg" alt="Bring to Front" class="visteras_arrange_icon" />
            <span>To Front</span>
          </button>
          <button type="button" class="btn_visteras_arrange" id="btn_bring_forward" title="Bring Forward">
            <img src="images/go_up.svg" alt="Bring Forward" class="visteras_arrange_icon" />
            <span>Forward</span>
          </button>
          <button type="button" class="btn_visteras_arrange" id="btn_send_backward" title="Send Backward">
            <img src="images/go_down.svg" alt="Send Backward" class="visteras_arrange_icon" />
            <span>Backward</span>
          </button>
          <button type="button" class="btn_visteras_arrange" id="btn_send_back" title="Send to Back">
            <img src="images/move_bottom.svg" alt="Send to Back" class="visteras_arrange_icon" />
            <span>To Back</span>
          </button>
        </div>
        <button type="button" class="btn_visteras_danger w-100 mt-2" id="btn_delete_el">Delete Element</button>
      </div>
    `;

    // Wire universal transform listeners
    this.content.querySelector('#inp_pos_x')?.addEventListener('change', (e) => {
      this.board.updateElement(el.id, { x: parseInt(e.target.value, 10) || 0 });
    });
    this.content.querySelector('#inp_pos_y')?.addEventListener('change', (e) => {
      this.board.updateElement(el.id, { y: parseInt(e.target.value, 10) || 0 });
    });
    this.content.querySelector('#inp_dim_w')?.addEventListener('change', (e) => {
      this.board.updateElement(el.id, { width: parseInt(e.target.value, 10) || 100 });
    });
    this.content.querySelector('#inp_dim_h')?.addEventListener('change', (e) => {
      this.board.updateElement(el.id, { height: parseInt(e.target.value, 10) || 100 });
    });
    this.content.querySelector('#inp_rot')?.addEventListener('input', (e) => {
      this.board.updateElement(el.id, { rotation: parseFloat(e.target.value) || 0 });
    });

    // Wire Layer Actions
    this.content.querySelector('#btn_bring_front')?.addEventListener('click', () => this.board.bringToFront());
    this.content.querySelector('#btn_send_back')?.addEventListener('click', () => this.board.sendToBack());
    this.content.querySelector('#btn_bring_forward')?.addEventListener('click', () => this.board.bringForward());
    this.content.querySelector('#btn_send_backward')?.addEventListener('click', () => this.board.sendBackward());
    this.content.querySelector('#btn_delete_el')?.addEventListener('click', () => this.board.deleteSelected());

    // Wire type specifics
    if (el.type === 'image') {
      this.content.querySelector('#inp_img_polaroid')?.addEventListener('change', (e) => {
        this.board.updateElement(el.id, { data: { polaroid: e.target.checked } });
        this.render();
      });
      this.content.querySelector('#inp_img_caption')?.addEventListener('input', (e) => {
        this.board.updateElement(el.id, { data: { caption: e.target.value } }, false);
        const cardCap = document.querySelector(`.inspire-element[data-id="${el.id}"] .polaroid-caption-input`);
        if (cardCap && cardCap.value !== e.target.value) {
          cardCap.value = e.target.value;
        }
      });
      this.content.querySelector('#inp_img_caption')?.addEventListener('change', () => {
        this.board.saveHistory('Edit image caption');
      });
      this.content.querySelector('#inp_img_radius')?.addEventListener('input', (e) => {
        this.board.updateElement(el.id, { data: { radius: parseInt(e.target.value, 10) } });
      });
      this.content.querySelector('#inp_img_filter')?.addEventListener('change', (e) => {
        this.board.updateElement(el.id, { data: { filter: e.target.value } });
      });
      this.content.querySelector('#inp_img_fit')?.addEventListener('change', (e) => {
        this.board.updateElement(el.id, { data: { fit: e.target.value } });
      });

      this.content.querySelector('#btn_extract_palette')?.addEventListener('click', async () => {
        if (!el.data?.src) return;
        try {
          const pal = await extractPaletteFromImage(el.data.src, 5);
          if (pal.length) {
            pal.forEach((sw, i) => {
              this.board.addSwatchElement({
                hex: sw.hex,
                name: sw.name,
                label: `Tone ${i + 1}`,
                x: el.x + i * 140,
                y: el.y + el.height + 20
              });
            });
          }
        } catch (err) {
          alert('Could not extract palette from this image.');
        }
      });
    } else if (el.type === 'quote') {
      this.content.querySelector('#inp_quote_text')?.addEventListener('input', (e) => {
        this.board.updateElement(el.id, { data: { quote: e.target.value } }, false);
      });
      this.content.querySelector('#inp_quote_text')?.addEventListener('change', () => {
        this.board.saveHistory('Edit quote');
      });
      this.content.querySelector('#inp_quote_author')?.addEventListener('input', (e) => {
        this.board.updateElement(el.id, { data: { author: e.target.value } }, false);
      });
      this.content.querySelector('#inp_quote_author')?.addEventListener('change', () => {
        this.board.saveHistory('Edit quote author');
      });
      this.content.querySelector('#inp_quote_cite')?.addEventListener('input', (e) => {
        this.board.updateElement(el.id, { data: { cite: e.target.value } }, false);
      });
      this.content.querySelector('#inp_quote_cite')?.addEventListener('change', () => {
        this.board.saveHistory('Edit quote citation');
      });
      this.content.querySelector('#inp_quote_font')?.addEventListener('change', (e) => {
        const font = e.target.value;
        loadFontFamily({ family: font }).catch(() => {});
        this.board.updateElement(el.id, { data: { fontFamily: font } });
      });
      this.content.querySelector('#inp_quote_size')?.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        const valSpan = this.content.querySelector('#val_quote_size');
        if (valSpan) valSpan.textContent = `${val}px`;
        this.board.updateElement(el.id, { data: { fontSize: val } });
      });
      this.content.querySelector('#inp_quote_style')?.addEventListener('change', (e) => {
        this.board.updateElement(el.id, { data: { quoteStyle: e.target.value } });
      });

      const qBgPicker = this.content.querySelector('#inp_quote_bg');
      const qBgHex = this.content.querySelector('#inp_quote_bg_hex');
      qBgPicker?.addEventListener('input', (e) => {
        if (qBgHex) qBgHex.value = e.target.value;
        this.board.updateElement(el.id, { data: { bg: e.target.value } });
      });
      qBgHex?.addEventListener('change', (e) => {
        if (qBgPicker) qBgPicker.value = e.target.value;
        this.board.updateElement(el.id, { data: { bg: e.target.value } });
      });

      const qColPicker = this.content.querySelector('#inp_quote_color');
      const qColHex = this.content.querySelector('#inp_quote_color_hex');
      qColPicker?.addEventListener('input', (e) => {
        if (qColHex) qColHex.value = e.target.value;
        this.board.updateElement(el.id, { data: { color: e.target.value } });
      });
      qColHex?.addEventListener('change', (e) => {
        if (qColPicker) qColPicker.value = e.target.value;
        this.board.updateElement(el.id, { data: { color: e.target.value } });
      });

      this.content.querySelector('#btn_quote_save_lib')?.addEventListener('click', () => {
        const saveCb = this.addQuoteCallbacks?.onSaveLibrary || this.onSaveLibrary;
        if (saveCb) {
          saveCb({
            quote: el.data?.quote || '',
            author: el.data?.author || '',
            cite: el.data?.cite || '',
            fontFamily: el.data?.fontFamily || 'Playfair Display'
          });
        }
      });
    } else if (el.type === 'text') {
      const d = el.data || {};

      this.content.querySelector('#inp_text_content')?.addEventListener('input', (e) => {
        const textVal = e.target.value;
        const updates = { data: { text: textVal } };
        if (el.data?.boundary !== 'box') {
          const measured = measureTextBounds(textVal || ' ', {
            fontFamily: el.data?.fontFamily || 'Montserrat',
            fontSize: el.data?.fontSize || 32,
            fontWeight: el.data?.fontWeight || '700',
            letterSpacing: el.data?.letterSpacing || 0
          });
          updates.width = measured.width;
          updates.height = measured.height;
        }
        this.board.updateElement(el.id, updates, false);
      });

      this.content.querySelector('#inp_text_content')?.addEventListener('change', () => {
        this.board.saveHistory('Edit text content');
      });

      this.content.querySelector('#inp_text_boundary')?.addEventListener('change', (e) => {
        const boundVal = e.target.value;
        const updates = { data: { boundary: boundVal } };
        if (boundVal !== 'box') {
          const measured = measureTextBounds(el.data?.text || ' ', {
            fontFamily: el.data?.fontFamily || 'Montserrat',
            fontSize: el.data?.fontSize || 32,
            fontWeight: el.data?.fontWeight || '700',
            letterSpacing: el.data?.letterSpacing || 0
          });
          updates.width = measured.width;
          updates.height = measured.height;
        }
        this.board.updateElement(el.id, updates);
        this.render();
      });

      this.content.querySelector('#inp_text_font')?.addEventListener('change', (e) => {
        const font = e.target.value;
        loadFontFamily({ family: font }).catch(() => {});
        const updates = { data: { fontFamily: font } };
        if (el.data?.boundary !== 'box') {
          const measured = measureTextBounds(el.data?.text || ' ', {
            fontFamily: font,
            fontSize: el.data?.fontSize || 32,
            fontWeight: el.data?.fontWeight || '700',
            letterSpacing: el.data?.letterSpacing || 0
          });
          updates.width = measured.width;
          updates.height = measured.height;
        }
        this.board.updateElement(el.id, updates);
      });

      this.content.querySelector('#inp_text_size')?.addEventListener('input', (e) => {
        const sz = parseInt(e.target.value, 10) || 32;
        const valSpan = this.content.querySelector('#val_text_size');
        if (valSpan) valSpan.textContent = `${sz}px`;
        const updates = { data: { fontSize: sz } };
        if (el.data?.boundary !== 'box') {
          const measured = measureTextBounds(el.data?.text || ' ', {
            fontFamily: el.data?.fontFamily || 'Montserrat',
            fontSize: sz,
            fontWeight: el.data?.fontWeight || '700',
            letterSpacing: el.data?.letterSpacing || 0
          });
          updates.width = measured.width;
          updates.height = measured.height;
        }
        this.board.updateElement(el.id, updates);
      });

      this.content.querySelector('#inp_text_weight')?.addEventListener('change', (e) => {
        const wt = e.target.value;
        const updates = { data: { fontWeight: wt } };
        if (el.data?.boundary !== 'box') {
          const measured = measureTextBounds(el.data?.text || ' ', {
            fontFamily: el.data?.fontFamily || 'Montserrat',
            fontSize: el.data?.fontSize || 32,
            fontWeight: wt,
            letterSpacing: el.data?.letterSpacing || 0
          });
          updates.width = measured.width;
          updates.height = measured.height;
        }
        this.board.updateElement(el.id, updates);
      });

      this.content.querySelector('#inp_text_spacing')?.addEventListener('input', (e) => {
        const sp = parseInt(e.target.value, 10) || 0;
        const valSpan = this.content.querySelector('#val_text_spacing');
        if (valSpan) valSpan.textContent = `${sp}px`;
        const updates = { data: { letterSpacing: sp } };
        if (el.data?.boundary !== 'box') {
          const measured = measureTextBounds(el.data?.text || ' ', {
            fontFamily: el.data?.fontFamily || 'Montserrat',
            fontSize: el.data?.fontSize || 32,
            fontWeight: el.data?.fontWeight || '700',
            letterSpacing: sp
          });
          updates.width = measured.width;
          updates.height = measured.height;
        }
        this.board.updateElement(el.id, updates);
      });

      const tColPicker = this.content.querySelector('#inp_text_color');
      const tColHex = this.content.querySelector('#inp_text_color_hex');
      tColPicker?.addEventListener('input', (e) => {
        if (tColHex) tColHex.value = e.target.value;
        this.board.updateElement(el.id, { data: { color: e.target.value } });
      });
      tColHex?.addEventListener('change', (e) => {
        if (tColPicker) tColPicker.value = e.target.value;
        this.board.updateElement(el.id, { data: { color: e.target.value } });
      });

      this.content.querySelector('#btn_align_left')?.addEventListener('click', () => {
        this.board.updateElement(el.id, { data: { align: 'left' } });
        this.render();
      });
      this.content.querySelector('#btn_align_center')?.addEventListener('click', () => {
        this.board.updateElement(el.id, { data: { align: 'center' } });
        this.render();
      });
      this.content.querySelector('#btn_align_right')?.addEventListener('click', () => {
        this.board.updateElement(el.id, { data: { align: 'right' } });
        this.render();
      });
    } else if (el.type === 'sticky') {
      this.content.querySelector('#inp_sticky_text')?.addEventListener('input', (e) => {
        this.board.updateElement(el.id, { data: { text: e.target.value } }, false);
        const canvasTa = document.querySelector(`.inspire-element[data-id="${el.id}"] .sticky-note-textarea`);
        if (canvasTa && canvasTa.value !== e.target.value) {
          canvasTa.value = e.target.value;
        }
      });
      this.content.querySelector('#inp_sticky_text')?.addEventListener('change', () => {
        this.board.saveHistory('Edit sticky note');
      });
      this.content.querySelectorAll('.sticky-color-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          this.board.updateElement(el.id, { data: { color: btn.dataset.color } });
          this.render();
        });
      });
      this.content.querySelector('#inp_sticky_tape')?.addEventListener('change', (e) => {
        this.board.updateElement(el.id, { data: { tape: e.target.checked } });
      });
      this.content.querySelector('#inp_sticky_pin')?.addEventListener('change', (e) => {
        this.board.updateElement(el.id, { data: { pin: e.target.checked } });
      });
      this.content.querySelector('#inp_sticky_font')?.addEventListener('change', (e) => {
        this.board.updateElement(el.id, { data: { font: e.target.value } });
      });
    } else if (el.type === 'swatch') {
      const swatchPicker = this.content.querySelector('#inp_swatch_color');
      const swatchHex = this.content.querySelector('#inp_swatch_hex');
      swatchPicker?.addEventListener('input', (e) => {
        if (swatchHex) swatchHex.value = e.target.value;
        this.board.updateElement(el.id, { data: { hex: e.target.value } }, false);
      });
      swatchPicker?.addEventListener('change', () => {
        this.board.saveHistory('Edit swatch color');
      });
      swatchHex?.addEventListener('change', (e) => {
        if (swatchPicker) swatchPicker.value = e.target.value;
        this.board.updateElement(el.id, { data: { hex: e.target.value } });
      });
      this.content.querySelector('#inp_swatch_name')?.addEventListener('input', (e) => {
        this.board.updateElement(el.id, { data: { name: e.target.value } }, false);
      });
      this.content.querySelector('#inp_swatch_name')?.addEventListener('change', () => {
        this.board.saveHistory('Edit swatch name');
      });
      this.content.querySelector('#inp_swatch_label')?.addEventListener('input', (e) => {
        this.board.updateElement(el.id, { data: { label: e.target.value } }, false);
      });
      this.content.querySelector('#inp_swatch_label')?.addEventListener('change', () => {
        this.board.saveHistory('Edit swatch label');
      });
    }
  }

  renderMultiSelectionProperties(selected) {
    this.content.innerHTML = `
      <div class="inspector-section">
        <div class="inspector-section-title">${selected.length} Items Selected</div>

        <div class="inspector-row">
          <label class="inspector-label">Align to Each Other</label>
          <div class="inspector-actions-grid">
            <button type="button" class="btn_visteras_secondary" id="btn_align_left">Left</button>
            <button type="button" class="btn_visteras_secondary" id="btn_align_center">Center</button>
            <button type="button" class="btn_visteras_secondary" id="btn_align_right">Right</button>
            <button type="button" class="btn_visteras_secondary" id="btn_align_top">Top</button>
            <button type="button" class="btn_visteras_secondary" id="btn_align_middle">Middle</button>
            <button type="button" class="btn_visteras_secondary" id="btn_align_bottom">Bottom</button>
          </div>
        </div>

        <div class="inspector-row mt-2">
          <label class="inspector-label">Distribute Evenly</label>
          <div class="inspector-actions-grid">
            <button type="button" class="btn_visteras_secondary" id="btn_distrib_h">Horizontal</button>
            <button type="button" class="btn_visteras_secondary" id="btn_distrib_v">Vertical</button>
          </div>
        </div>
      </div>

      <div class="inspector-section">
        <div class="inspector-section-title">Batch Actions</div>
        <div class="inspector-actions-grid mb-2">
          <button type="button" class="btn_visteras_secondary w-100" id="btn_dup_selected">Duplicate Selection (⌘D)</button>
        </div>
        <div class="inspector-arrange-grid">
          <button type="button" class="btn_visteras_arrange" id="btn_bring_front_multi" title="Bring to Front">
            <img src="images/move_top.svg" alt="Bring to Front" class="visteras_arrange_icon" />
            <span>To Front</span>
          </button>
          <button type="button" class="btn_visteras_arrange" id="btn_send_back_multi" title="Send to Back">
            <img src="images/move_bottom.svg" alt="Send to Back" class="visteras_arrange_icon" />
            <span>To Back</span>
          </button>
        </div>
        <button type="button" class="btn_visteras_danger w-100 mt-2" id="btn_del_multi">Delete All ${selected.length} Items</button>
      </div>
    `;

    this.content.querySelector('#btn_align_left')?.addEventListener('click', () => this.board.alignSelected('left'));
    this.content.querySelector('#btn_align_center')?.addEventListener('click', () => this.board.alignSelected('center'));
    this.content.querySelector('#btn_align_right')?.addEventListener('click', () => this.board.alignSelected('right'));
    this.content.querySelector('#btn_align_top')?.addEventListener('click', () => this.board.alignSelected('top'));
    this.content.querySelector('#btn_align_middle')?.addEventListener('click', () => this.board.alignSelected('middle'));
    this.content.querySelector('#btn_align_bottom')?.addEventListener('click', () => this.board.alignSelected('bottom'));
    this.content.querySelector('#btn_distrib_h')?.addEventListener('click', () => this.board.alignSelected('distribute-h'));
    this.content.querySelector('#btn_distrib_v')?.addEventListener('click', () => this.board.alignSelected('distribute-v'));

    this.content.querySelector('#btn_dup_selected')?.addEventListener('click', () => this.board.duplicateSelected());
    this.content.querySelector('#btn_bring_front_multi')?.addEventListener('click', () => this.board.bringToFront());
    this.content.querySelector('#btn_send_back_multi')?.addEventListener('click', () => this.board.sendToBack());
    this.content.querySelector('#btn_del_multi')?.addEventListener('click', () => this.board.deleteSelected());
  }
}
