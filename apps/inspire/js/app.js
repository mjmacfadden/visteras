/**
 * Visteras Inspire — Main Application Controller
 * Manages multiple open documents with tabbed document display,
 * Swipe File Library, Moodboard Composer, Infinite/Fixed Canvas,
 * Properties Inspector, Templates & Layouts, Menus, Toolbars, and Keyboard Shortcuts.
 */

import {
  InspireDocument,
  CANVAS_PRESETS,
  VID_FORMAT_IDENTIFIER,
  VID_CURRENT_VERSION
} from './document.js';
import { SwipeFileManager } from './swipe-file.js';
import { BoardComposer } from './board-composer.js';
import { WorkspaceCanvas } from './canvas.js';
import { InspectorPanel } from './inspector.js';
import { MoodboardLayouts } from './moodboard-layouts.js';
import { zoomPercent, applyFileMeta, safeVidFileName, safeFileBase } from './inspire-utils.js';
import { resolveOpenTarget } from './open-match.js';
import { showToast } from '../lib/visteras-ui/toast.js';
import { saveFile } from '../lib/visteras-ui/file.js';

/** showSaveFilePicker types for Inspire documents (.vid stays Inspire's own type). */
const VID_SAVE_TYPES = [{
  description: 'Visteras Inspire Document (.vid)',
  accept: { 'application/json': ['.vid'], 'application/x-visteras-inspire': ['.vid'] }
}];
import { exportRegion, computeSafeExportScale, prepareExportClone, EXPORT_DEFAULT_SCALE } from './export-utils.js';
import {
  clearStaleDocumentStorage,
  trackDirty,
  markSaved,
  handleBeforeUnload,
  confirmCloseIfDirty
} from './unsaved-changes.js';

class InspireApp {
  constructor() {
    this.documents = []; // Array of document models
    this.activeDocId = null;
    this.autoDocCounter = 1;

    // Current active references (mirrors active document model)
    this.doc = null;
    this.board = null;
    this.swipeFile = null;
    this.canvas = null;
    this.inspector = null;

    this.activeSidepanelTab = 'swipe_file'; // 'swipe_file' | 'inspector' | 'templates' | 'layers'
    this.activeCategoryFilter = 'All';
    this.activeTagFilter = null;
    this.searchQuery = '';
    this.internalClipboard = null;
    this.spacePanPrevTool = null;

    this.init();
  }

  async init() {
    this.initDocuments();
    this.initCanvasAndInspector();
    this.initUI();
    this.renderDocumentTabs();
    this.initLibraryPanel();
    this.initTemplatesPanel();
    this.initLayersPanel();
    this.initKeyboardShortcuts();
    this.initClipboardBridge();
    this.initWindowDropZone();
    this.initUnsavedChangesGuard();
    this.syncOptionsBar();
    this.updateStatus();

    // Ensure initial canvas view defaults to fit to workspace once layout has settled
    requestAnimationFrame(() => {
      this.canvas?.fitToScreen();
      this.updateStatus();
    });
    setTimeout(() => {
      this.canvas?.fitToScreen();
      this.updateStatus();
    }, 50);

    window.__visterasLoadDocument = (docData, fileName) => this.openDocumentData(docData, fileName);

    this.showToast('Visteras Inspire Ready: Paste or drag items to auto-categorize!', 'info');
  }

  /* -------------------------------------------------------------------------- */
  /* 1. Multi-Document & Tabbed Storage Management                              */
  /* -------------------------------------------------------------------------- */

  createDocumentModel({
    initialData = null,
    title = null,
    fileName = null,
    isDirty = false
  } = {}) {
    const data = initialData || InspireDocument.createBlank();
    const docId = data.meta?.id || ('doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));

    let resolvedFileName = fileName || (initialData ? data.meta?.fileName : null) || null;
    let resolvedTitle = title || (initialData ? data.meta?.title : null) || null;

    const isGenericUntitled = (val) => !val || val === 'Untitled' || /^Untitled\s+Inspiration\s+Board$/i.test(val);

    // If no explicit title or fileName was provided, or if the title is generic/untitled, generate the incrementing Untitled-# title
    if ((!fileName && !title) || (!resolvedFileName && (!resolvedTitle || isGenericUntitled(resolvedTitle)))) {
      const num = this.autoDocCounter++;
      resolvedTitle = `Untitled-${num}`;
      resolvedFileName = `Untitled-${num}.vid`;
    } else if (resolvedFileName && (!resolvedTitle || isGenericUntitled(resolvedTitle))) {
      resolvedTitle = resolvedFileName.replace(/\.vid$/i, '');
    } else if (resolvedFileName && !resolvedTitle) {
      resolvedTitle = resolvedFileName.replace(/\.vid$/i, '');
    } else if (!resolvedFileName && resolvedTitle) {
      resolvedFileName = resolvedTitle.toLowerCase().endsWith('.vid') ? resolvedTitle : `${resolvedTitle}.vid`;
      resolvedTitle = resolvedTitle.replace(/\.vid$/i, '');
    }

    if (data.meta) {
      data.meta.title = resolvedTitle;
      data.meta.fileName = resolvedFileName;
    }

    const docInstance = new InspireDocument(data.board);
    docInstance.id = docId;
    docInstance.title = resolvedTitle;
    docInstance.fileName = resolvedFileName;
    applyFileMeta(docInstance, data.meta); // keep the board's original created date

    const boardInstance = new BoardComposer(data.board?.elements || [], data.board?.customLayoutSnapshot || null, docInstance);
    const swipeInstance = new SwipeFileManager(data.swipeFile || null);

    const model = {
      id: docId,
      title: resolvedTitle,
      fileName: resolvedFileName,
      isDirty: isDirty,
      doc: docInstance,
      board: boardInstance,
      swipeFile: swipeInstance,
      viewportState: data.viewportState || null
    };

    // Track dirty state on real edits (selection-only changes don't count), like Studio's is_dirty
    trackDirty(model, {
      onChange: () => {
        if (model.id === this.activeDocId) {
          this.renderLibraryGrid();
          this.renderLibraryTags();
        }
        this.renderDocumentTabs();
        this.updateStatus();
      }
    });

    return model;
  }

  initDocuments() {
    // Documents are saved only as .vid files. Clear document snapshots left by the old autosave.
    let local = null;
    let session = null;
    try { local = typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { /* storage disabled */ }
    try { session = typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch (_) { /* storage disabled */ }
    clearStaleDocumentStorage(local, session);

    // Always start with a clean blank document (empty board, empty swipe file, white background)
    this.autoDocCounter = 2;
    const initialDoc = this.createDocumentModel({
      initialData: InspireDocument.createBlank('Untitled-1'),
      title: 'Untitled-1',
      fileName: 'Untitled-1.vid',
      isDirty: false
    });

    this.documents = [initialDoc];
    this.activeDocId = initialDoc.id;
    this.doc = initialDoc.doc;
    this.board = initialDoc.board;
    this.swipeFile = initialDoc.swipeFile;
  }

  getActiveDocument() {
    return this.documents.find(d => d.id === this.activeDocId) || this.documents[0];
  }

  activateDocument(id) {
    if (!id || id === this.activeDocId) return;

    const target = this.documents.find(d => d.id === id);
    if (!target) return;

    // 1. Save current active viewport state
    const current = this.getActiveDocument();
    if (current && this.canvas) {
      current.viewportState = {
        zoom: this.canvas.zoom,
        panX: this.canvas.panX,
        panY: this.canvas.panY
      };
    }

    // 2. Switch active model pointers
    this.activeDocId = target.id;
    this.doc = target.doc;
    this.board = target.board;
    this.swipeFile = target.swipeFile;

    // 3. Update Canvas & Inspector
    this.canvas.switchDocument({
      doc: this.doc,
      board: this.board,
      swipeFile: this.swipeFile,
      viewportState: target.viewportState
    });

    this.inspector.switchDocument({
      doc: this.doc,
      board: this.board,
      canvas: this.canvas
    });

    // 4. Update UI Chrome
    this.renderDocumentTabs();
    this.renderLibraryGrid();
    this.renderLibraryTags();
    this.renderLayersList();
    this.syncOptionsBar();
    this.updateStatus();

    this.showToast(`Switched to "${target.title}"`, 'info', 1500);
  }

  newDocument(templateData = null, customTitle = null, customFileName = null) {
    // 1. Save current active viewport
    const current = this.getActiveDocument();
    if (current && this.canvas) {
      current.viewportState = {
        zoom: this.canvas.zoom,
        panX: this.canvas.panX,
        panY: this.canvas.panY
      };
    }

    // 2. Create new document model
    const newModel = this.createDocumentModel({
      initialData: templateData,
      title: customTitle,
      fileName: customFileName,
      isDirty: false
    });

    this.documents.push(newModel);
    this.activateDocument(newModel.id);
    this.showToast(`Created "${newModel.fileName}"`, 'success');
  }

  // openDocumentData(docData)
  openDocumentData(docData, fileName = null) {
    if (!docData || !docData.board || !docData.swipeFile) {
      this.showToast('Invalid .vid document structure', 'error');
      return;
    }

    const resolvedFileName = fileName || docData.meta?.fileName || (docData.meta?.title ? (docData.meta.title.toLowerCase().endsWith('.vid') ? docData.meta.title : `${docData.meta.title}.vid`) : 'Imported Moodboard.vid');
    const title = resolvedFileName.replace(/\.vid$/i, '') || docData.meta?.title || 'Imported Moodboard';

    // If currently active doc is untouched and empty, replace it
    const active = this.getActiveDocument();
    if (
      active &&
      !active.isDirty &&
      active.board.elements.length === 0 &&
      active.swipeFile.items.length === 0
    ) {
      const idx = this.documents.findIndex(d => d.id === active.id);
      const replaced = this.createDocumentModel({ initialData: docData, title, fileName: resolvedFileName, isDirty: false });
      this.documents[idx] = replaced;
      this.activateDocument(replaced.id);
      this.showToast(`Opened "${resolvedFileName}"`, 'success');
      return;
    }

    // Same name/title/id already open: switch only if the content is identical; otherwise open a
    // new tab (Studio always opens into a new tab), so a different file is never hidden.
    const target = resolveOpenTarget(this.documents, docData, { fileName: resolvedFileName, title });
    if (target.action === 'switch') {
      this.activateDocument(target.model.id);
      this.showToast(`"${target.model.fileName || target.model.title}" is already open`, 'info');
      return;
    }
    // Tab ids must stay unique when the same board (same meta.id) is opened again
    if (docData.meta?.id && this.documents.some(d => d.id === docData.meta.id)) {
      docData = { ...docData, meta: { ...docData.meta, id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5) } };
    }

    // Open as new tab
    const newModel = this.createDocumentModel({
      initialData: docData,
      title: title,
      fileName: resolvedFileName,
      isDirty: false
    });

    this.documents.push(newModel);
    this.activateDocument(newModel.id);
    this.showToast(target.sameNameOpen
      ? `Opened "${resolvedFileName}" in a new tab (an open tab with that name has different content)`
      : `Opened "${resolvedFileName}" in new tab`, 'success');
  }

  initUnsavedChangesGuard() {
    // Studio parity: warn before leaving the page only when a document has unsaved changes
    window.addEventListener('beforeunload', (e) => handleBeforeUnload(e, this.documents));
  }

  async closeDocument(id) {
    if (this.closingDocId) return;
    const docToClose = this.documents.find(d => d.id === id);
    if (!docToClose) return;

    // Confirm close if unsaved changes (Studio-style "Unsaved Changes" dialog, Cancel focused)
    this.closingDocId = id;
    let ok;
    try {
      ok = await confirmCloseIfDirty(docToClose);
    } finally {
      this.closingDocId = null;
    }
    if (!ok) return;

    const idx = this.documents.findIndex(d => d.id === id);
    if (idx === -1) return;
    this.documents.splice(idx, 1);

    // If no documents left, automatically create a fresh one
    if (this.documents.length === 0) {
      const num = this.autoDocCounter++;
      const fresh = this.createDocumentModel({
        initialData: InspireDocument.createBlank(),
        title: `Untitled-${num}`,
        fileName: `Untitled-${num}.vid`,
        isDirty: false
      });
      this.documents.push(fresh);
      this.activateDocument(fresh.id);
      return;
    }

    // If closed the active document, activate neighboring tab
    if (docToClose.id === this.activeDocId) {
      const nextIdx = Math.min(idx, this.documents.length - 1);
      this.activateDocument(this.documents[nextIdx].id);
    } else {
      this.renderDocumentTabs();
    }

    this.showToast(`Closed "${docToClose.fileName || docToClose.title}"`, 'info', 1500);
  }

  renderDocumentTabs() {
    const container = document.getElementById('document_tabs');
    if (!container) return;

    let tabsHtml = '';
    for (const d of this.documents) {
      const isActive = d.id === this.activeDocId;
      const zoomVal = isActive
        ? (this.canvas ? Math.round(this.canvas.zoom * 100) : null)
        : (d.viewportState?.zoom ? Math.round(d.viewportState.zoom * 100) : null);

      const zoomLabel = zoomVal !== null ? `@ ${zoomVal}%` : '@ Fit';
      const dirtyBullet = d.isDirty ? '<span class="tab_dirty">•</span>' : '';
      const tabFileName = d.fileName || (d.title ? (d.title.endsWith('.vid') ? d.title : `${d.title}.vid`) : 'Untitled-1.vid');

      tabsHtml += `
        <div class="document_tab ${isActive ? 'active' : ''}${d.isDirty ? ' dirty' : ''}"
             data-id="${d.id}"
             role="tab"
             aria-selected="${isActive ? 'true' : 'false'}"
             title="${this.escapeHtml(tabFileName)}${d.isDirty ? ' — unsaved' : ''}">
          <span class="tab_title">${this.escapeHtml(tabFileName)}${dirtyBullet}</span>
          <span class="tab_zoom">${zoomLabel}</span>
          <span class="tab_close" data-id="${d.id}" title="Close Tab (⌘W)">✕</span>
        </div>
      `;
    }

    tabsHtml += `<button type="button" class="new_tab_btn" id="new_tab_btn" title="New Tab (⌘N)">+</button>`;
    container.innerHTML = tabsHtml;

    // Attach tab event handlers
    container.querySelectorAll('.document_tab').forEach(tabEl => {
      const docId = tabEl.dataset.id;

      // Click to switch or close
      tabEl.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab_close')) {
          e.stopPropagation();
          this.closeDocument(docId);
        } else {
          this.activateDocument(docId);
        }
      });

      // Middle-click to close
      tabEl.addEventListener('auxclick', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          this.closeDocument(docId);
        }
      });

      // Double-click to inline rename title / file name
      const titleSpan = tabEl.querySelector('.tab_title');
      if (titleSpan) {
        titleSpan.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          const docModel = this.documents.find(d => d.id === docId);
          if (!docModel) return;

          const currentFileName = docModel.fileName || (docModel.title.endsWith('.vid') ? docModel.title : `${docModel.title}.vid`);
          const input = document.createElement('input');
          input.type = 'text';
          input.value = currentFileName;
          input.className = 'tab_rename_input';
          titleSpan.replaceWith(input);
          input.focus();
          input.select();

          const commitRename = () => {
            let val = input.value.trim();
            if (val && val !== currentFileName) {
              val = safeVidFileName(val);
              docModel.fileName = val;
              const cleanTitle = val.replace(/\.vid$/i, '');
              docModel.title = cleanTitle;
              docModel.doc.title = cleanTitle;
              docModel.isDirty = true;
              this.syncOptionsBar();
            }
            this.renderDocumentTabs();
          };

          input.addEventListener('blur', commitRename);
          input.addEventListener('keydown', (evt) => {
            if (evt.key === 'Enter') {
              input.blur();
            } else if (evt.key === 'Escape') {
              input.value = currentFileName;
              input.blur();
            }
          });
        });
      }
    });

    // New Tab button
    container.querySelector('#new_tab_btn')?.addEventListener('click', () => {
      this.newDocument();
    });
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* -------------------------------------------------------------------------- */
  /* 2. Workspace, Canvas & Inspector Initialization                            */
  /* -------------------------------------------------------------------------- */

  initCanvasAndInspector() {
    // Mount into canvas container below document_tabs
    const canvasContainer = document.getElementById('inspire_canvas_container') || document.getElementById('workarea');
    const inspectorContainer = document.getElementById('panel_inspector');

    this.canvas = new WorkspaceCanvas({
      container: canvasContainer,
      doc: this.doc,
      boardComposer: this.board,
      swipeFileManager: this.swipeFile,
      onSelectionChange: (selected) => {
        if (selected.length && this.inspector) {
          if (this.canvas.presentation.editing) this.handleToolAction('select', document.getElementById('tool_select'));
          this.switchSidepanel('inspector');
        }
        this.syncSelectionUI(selected);
        this.renderLayersList();
      },
      onStatusChange: (status) => {
        this.updateStatus(status);
        // Update zoom in active tab title
        if (status?.zoom) {
          const tabEl = document.querySelector(`.document_tab[data-id="${this.activeDocId}"] .tab_zoom`);
          if (tabEl) tabEl.textContent = `@ ${status.zoom}%`;
        }
      },
      onDocChange: () => {
        const active = this.getActiveDocument();
        if (active) active.isDirty = true;
        this.renderDocumentTabs();
      },
      onToast: (msg, type) => this.showToast(msg, type)
    });

    this.inspector = new InspectorPanel({
      container: inspectorContainer,
      doc: this.doc,
      boardComposer: this.board,
      canvas: this.canvas,
      onDocChange: () => {
        const active = this.getActiveDocument();
        if (active) active.isDirty = true;
        this.renderDocumentTabs();
        this.syncOptionsBar();
      },
      onSaveLibrary: async (data) => {
        await this.swipeFile.addItem({
          category: 'Quotes',
          title: data.author ? `${data.author} Quote` : 'Inspiring Quote',
          content: data.quote,
          meta: {
            author: data.author,
            cite: data.cite
          },
          tags: ['quote', 'inspiration'],
          source: 'manual'
        });
        this.showToast('Quote saved to inspiration library', 'success');
      }
    });
  }

  /* -------------------------------------------------------------------------- */
  /* 3. Main UI, Toolbars & Menus Wiring                                        */
  /* -------------------------------------------------------------------------- */

  initUI() {
    this.canvas.presentation.onEditingChange = () => {
      this.inspector.activeView = null;
      this.switchSidepanel('inspector');
    };
    // 3.1 Options Bar Controls
    const presetSelect = document.getElementById('opt_board_preset');
    if (presetSelect) {
      presetSelect.innerHTML = Object.entries(CANVAS_PRESETS)
        .map(([k, v]) => `<option value="${k}" ${this.doc.preset === k ? 'selected' : ''}>${v.name}</option>`)
        .join('');

      presetSelect.addEventListener('change', (e) => {
        this.canvas.setPreset(e.target.value);
        const active = this.getActiveDocument();
        if (active) active.isDirty = true;
        this.renderDocumentTabs();
        this.inspector.render();
        this.updateStatus();
      });
    }

    const btnModeFixed = document.getElementById('opt_btn_fixed');
    const btnModeInfinite = document.getElementById('opt_btn_infinite');

    if (btnModeFixed && btnModeInfinite) {
      btnModeFixed.addEventListener('click', () => {
        this.canvas.setMode('fixed');
        btnModeFixed.classList.add('active');
        btnModeInfinite.classList.remove('active');
        if (presetSelect) presetSelect.style.display = 'inline-block';
        const active = this.getActiveDocument();
        if (active) active.isDirty = true;
        this.renderDocumentTabs();
        this.inspector.render();
        this.updateStatus();
      });

      btnModeInfinite.addEventListener('click', () => {
        this.canvas.setMode('infinite');
        btnModeInfinite.classList.add('active');
        btnModeFixed.classList.remove('active');
        if (presetSelect) presetSelect.style.display = 'none';
        const active = this.getActiveDocument();
        if (active) active.isDirty = true;
        this.renderDocumentTabs();
        this.inspector.render();
        this.updateStatus();
      });
    }

    // Auto-Layout Quick Trigger
    const btnAutoLayout = document.getElementById('opt_btn_autolayout');
    const selAutoLayout = document.getElementById('opt_select_autolayout');
    if (btnAutoLayout) {
      btnAutoLayout.addEventListener('click', () => {
        const layoutType = selAutoLayout ? selAutoLayout.value : 'masonry';
        this.applyAutoLayout(layoutType);
      });
    }
    if (selAutoLayout) {
      selAutoLayout.addEventListener('change', (e) => {
        this.applyAutoLayout(e.target.value);
      });
    }

    // Undo / Redo buttons
    const btnUndo = document.getElementById('opt_btn_undo');
    const btnRedo = document.getElementById('opt_btn_redo');
    if (btnUndo) {
      btnUndo.addEventListener('click', () => {
        this.board.undo();
        this.updateUndoRedoState();
      });
    }
    if (btnRedo) {
      btnRedo.addEventListener('click', () => {
        this.board.redo();
        this.updateUndoRedoState();
      });
    }
    this.board.subscribe(() => this.updateUndoRedoState());

    // Export & Print buttons
    const btnSaveVid = document.getElementById('opt_btn_save_vid');
    if (btnSaveVid) btnSaveVid.addEventListener('click', () => this.exportVidFile());

    const btnExportImage = document.getElementById('opt_btn_export_image');
    if (btnExportImage) btnExportImage.addEventListener('click', () => this.exportHighResImage('png'));

    const btnPrintSheet = document.getElementById('opt_btn_print');
    if (btnPrintSheet) btnPrintSheet.addEventListener('click', () => window.print());

    // 3.2 Left Toolbar Buttons
    const toolBtns = document.querySelectorAll('#tools_left .tool_btn');
    toolBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        this.handleToolAction(tool, btn);
      });
    });

    // 3.3 Sidepanel Tabs Switching
    const tabBtns = document.querySelectorAll('.sidepanel_tab');
    tabBtns.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetPane = tab.dataset.panel;
        this.switchSidepanel(targetPane);
      });
    });

    // 3.4 Menu Bar Dropdowns & Actions
    this.initMenuBarActions();

    // 3.5 Status Bar Controls
    const zoomBtn = document.getElementById('status-zoom-btn');
    if (zoomBtn) {
      zoomBtn.addEventListener('click', () => this.canvas.fitToScreen());
    }
  }

  syncOptionsBar() {
    const presetSelect = document.getElementById('opt_board_preset');
    const btnModeFixed = document.getElementById('opt_btn_fixed');
    const btnModeInfinite = document.getElementById('opt_btn_infinite');

    if (presetSelect) {
      presetSelect.value = this.doc.preset || '16:9';
      presetSelect.style.display = this.doc.mode === 'infinite' ? 'none' : 'inline-block';
    }
    if (btnModeFixed && btnModeInfinite) {
      btnModeFixed.classList.toggle('active', this.doc.mode === 'fixed');
      btnModeInfinite.classList.toggle('active', this.doc.mode === 'infinite');
    }
    const selAutoLayout = document.getElementById('opt_select_autolayout');
    if (selAutoLayout && this.board) {
      selAutoLayout.value = this.board.activeLayout || 'custom';
    }
    this.updateUndoRedoState();
  }

  updateUndoRedoState() {
    const btnUndo = document.getElementById('opt_btn_undo');
    const btnRedo = document.getElementById('opt_btn_redo');
    const menuUndo = document.getElementById('action_menu_undo');
    const menuRedo = document.getElementById('action_menu_redo');

    const canUndo = this.board.canUndo();
    const canRedo = this.board.canRedo();

    if (btnUndo) btnUndo.disabled = !canUndo;
    if (btnRedo) btnRedo.disabled = !canRedo;
    if (menuUndo) menuUndo.classList.toggle('disabled', !canUndo);
    if (menuRedo) menuRedo.classList.toggle('disabled', !canRedo);
  }

  switchSidepanel(panelName) {
    this.activeSidepanelTab = panelName;
    document.querySelectorAll('.sidepanel_tab').forEach(t => {
      t.classList.toggle('active', t.dataset.panel === panelName);
    });
    document.querySelectorAll('.sidepanel_pane').forEach(p => {
      p.classList.toggle('active', p.id === `panel_${panelName}`);
    });

    if (panelName === 'inspector') {
      this.inspector.render();
    } else if (panelName === 'layers') {
      this.renderLayersList();
    }
  }

  handleToolAction(tool, btnEl) {
    if (!btnEl && tool) {
      btnEl = document.querySelector(`#tools_left .tool_btn[data-tool="${tool}"]`) || document.getElementById(`tool_${tool}`);
    }
    this.canvas.presentation.setEditing(tool === 'slide');
    document.querySelectorAll('#tools_left .tool_btn').forEach(b => b.classList.remove('active'));

    switch (tool) {
      case 'slide':
        this.canvas.setTool('slide');
        btnEl?.classList.add('active');
        break;

      case 'select':
        this.canvas.setTool('select');
        btnEl?.classList.add('active');
        break;

      case 'hand':
        this.canvas.setTool('hand');
        btnEl?.classList.add('active');
        break;

      case 'image':
        this.canvas.setTool('select');
        document.getElementById('tool_select')?.classList.add('active');
        this.promptAddImage();
        break;

      case 'quote':
        this.canvas.setTool('select');
        document.getElementById('tool_select')?.classList.add('active');
        this.promptAddQuote();
        break;

      case 'text':
        this.canvas.setTool('text');
        btnEl?.classList.add('active');
        this.showToast('Text Tool: Click on canvas for Point Text, or drag to draw a Textbox', 'info');
        break;

      case 'sticky':
        this.canvas.setTool('select');
        document.getElementById('tool_select')?.classList.add('active');
        this.addStickyNote();
        break;

      case 'swatch':
        this.canvas.setTool('select');
        document.getElementById('tool_select')?.classList.add('active');
        this.promptAddSwatch();
        break;

      case 'shape':
        this.canvas.setTool('select');
        document.getElementById('tool_select')?.classList.add('active');
        this.addShape('rect');
        break;

      case 'connector':
        this.canvas.setTool('select');
        document.getElementById('tool_select')?.classList.add('active');
        this.addConnector();
        break;

      case 'library':
        this.switchSidepanel('swipe_file');
        break;

      case 'templates':
        this.switchSidepanel('templates');
        break;

      default:
        this.canvas.setTool('select');
        document.getElementById('tool_select')?.classList.add('active');
        break;
    }
  }

  /* -------------------------------------------------------------------------- */
  /* 4. Menu Bar Dropdowns & File Operations                                    */
  /* -------------------------------------------------------------------------- */

  initMenuBarActions() {
    // Menu Dropdown Toggles
    const menuEntries = document.querySelectorAll('.menu_entry');
    menuEntries.forEach(entry => {
      const title = entry.querySelector('.menu_entry_title');
      title.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = entry.classList.contains('open');
        menuEntries.forEach(m => m.classList.remove('open'));
        if (!isOpen) entry.classList.add('open');
      });

      entry.addEventListener('mouseenter', () => {
        const anyOpen = Array.from(menuEntries).some(m => m.classList.contains('open'));
        if (anyOpen) {
          menuEntries.forEach(m => m.classList.remove('open'));
          entry.classList.add('open');
        }
      });
    });

    document.addEventListener('click', () => {
      menuEntries.forEach(m => m.classList.remove('open'));
    });

    // File Menu Actions
    document.getElementById('action_menu_new')?.addEventListener('click', () => this.newDocument());
    document.getElementById('action_menu_open')?.addEventListener('click', () => this.openVidFile());
    document.getElementById('action_menu_save')?.addEventListener('click', () => this.exportVidFile());
    document.getElementById('action_menu_save_as')?.addEventListener('click', () => this.exportVidFile({ saveAs: true }));
    document.getElementById('action_menu_import_image')?.addEventListener('click', () => this.promptAddImage());
    document.getElementById('action_menu_export_png')?.addEventListener('click', () => this.exportHighResImage('png'));
    document.getElementById('action_menu_export_jpg')?.addEventListener('click', () => this.exportHighResImage('jpg'));
    document.getElementById('action_menu_print')?.addEventListener('click', () => window.print());
    document.getElementById('action_menu_close_tab')?.addEventListener('click', () => this.closeDocument(this.activeDocId));

    // Edit Menu Actions
    document.getElementById('action_menu_undo')?.addEventListener('click', () => this.board.undo());
    document.getElementById('action_menu_redo')?.addEventListener('click', () => this.board.redo());
    document.getElementById('action_menu_cut')?.addEventListener('click', () => this.cutSelected());
    document.getElementById('action_menu_copy')?.addEventListener('click', () => this.copySelected());
    document.getElementById('action_menu_paste')?.addEventListener('click', () => this.pasteFromInternal());
    document.getElementById('action_menu_duplicate')?.addEventListener('click', () => this.board.duplicateSelected());
    document.getElementById('action_menu_delete')?.addEventListener('click', () => this.board.deleteSelected());
    document.getElementById('action_menu_select_all')?.addEventListener('click', () => this.board.selectAll());
    document.getElementById('action_menu_deselect')?.addEventListener('click', () => this.board.clearSelection());

    // Board Menu Actions
    document.getElementById('action_menu_layout_custom')?.addEventListener('click', () => this.applyAutoLayout('custom'));
    document.getElementById('action_menu_layout_masonry')?.addEventListener('click', () => this.applyAutoLayout('masonry'));
    document.getElementById('action_menu_layout_editorial')?.addEventListener('click', () => this.applyAutoLayout('editorial'));
    document.getElementById('action_menu_layout_colorflow')?.addEventListener('click', () => this.applyAutoLayout('colorFlow'));
    document.getElementById('action_menu_layout_collage')?.addEventListener('click', () => this.applyAutoLayout('collage'));
    document.getElementById('action_menu_clear_board')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all elements from the moodboard? (Library items will remain safe)')) {
        this.board.clearBoard();
        this.showToast('Board cleared', 'info');
      }
    });

    // Arrange Menu Actions
    document.getElementById('action_menu_bring_front')?.addEventListener('click', () => this.board.bringToFront());
    document.getElementById('action_menu_bring_forward')?.addEventListener('click', () => this.board.bringForward());
    document.getElementById('action_menu_send_backward')?.addEventListener('click', () => this.board.sendBackward());
    document.getElementById('action_menu_send_back')?.addEventListener('click', () => this.board.sendToBack());

    document.getElementById('action_menu_align_left')?.addEventListener('click', () => this.board.alignSelected('left'));
    document.getElementById('action_menu_align_center')?.addEventListener('click', () => this.board.alignSelected('center'));
    document.getElementById('action_menu_align_right')?.addEventListener('click', () => this.board.alignSelected('right'));
    document.getElementById('action_menu_align_top')?.addEventListener('click', () => this.board.alignSelected('top'));
    document.getElementById('action_menu_align_middle')?.addEventListener('click', () => this.board.alignSelected('middle'));
    document.getElementById('action_menu_align_bottom')?.addEventListener('click', () => this.board.alignSelected('bottom'));

    // View Menu Actions
    document.getElementById('action_menu_mode_fixed')?.addEventListener('click', () => {
      this.canvas.setMode('fixed');
      this.syncOptionsBar();
    });
    document.getElementById('action_menu_mode_infinite')?.addEventListener('click', () => {
      this.canvas.setMode('infinite');
      this.syncOptionsBar();
    });
    document.getElementById('action_menu_fit')?.addEventListener('click', () => this.canvas.fitToScreen());
    document.getElementById('action_menu_100')?.addEventListener('click', () => this.canvas.setZoom(1));
    document.getElementById('action_menu_zoomin')?.addEventListener('click', () => this.canvas.setZoom(this.canvas.zoom * 1.2));
    document.getElementById('action_menu_zoomout')?.addEventListener('click', () => this.canvas.setZoom(this.canvas.zoom * 0.8));

    // Window Menu Actions
    document.getElementById('action_menu_win_swipe')?.addEventListener('click', () => this.switchSidepanel('swipe_file'));
    document.getElementById('action_menu_win_inspector')?.addEventListener('click', () => this.switchSidepanel('inspector'));
    document.getElementById('action_menu_win_templates')?.addEventListener('click', () => this.switchSidepanel('templates'));
    document.getElementById('action_menu_win_layers')?.addEventListener('click', () => this.switchSidepanel('layers'));

    // Help Menu Actions
    document.getElementById('action_menu_about')?.addEventListener('click', () => this.showAboutModal());
    document.getElementById('action_menu_shortcuts')?.addEventListener('click', () => this.showShortcutsModal());
  }

  openVidFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vid,application/json';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const docData = await InspireDocument.parseVidFile(file);
        this.openDocumentData(docData, file.name);
      } catch (err) {
        this.showToast(`Error opening .vid file: ${err.message}`, 'error');
      }
    };
    input.click();
  }

  /**
   * Save the active board as .vid (shared @visteras/ui file helper, Studio behaviour):
   * Save writes back to the file chosen earlier; otherwise (and always for Save As)
   * the save picker opens with the tab's name; browsers without the picker download.
   * The tab takes the name that was actually saved. Cancelling changes nothing.
   */
  async exportVidFile({ saveAs = false } = {}) {
    const active = this.getActiveDocument();
    if (!active) return;
    try {
      // The tab name and the saved file name are always the same string
      const fileName = safeVidFileName(active.fileName || active.doc.title);
      const data = active.doc.serialize(active.board, active.swipeFile);
      const result = await saveFile({
        data: JSON.stringify(data, null, 2),
        fileName,
        mimeType: 'application/json;charset=utf-8',
        types: VID_SAVE_TYPES,
        handle: saveAs ? null : (active.fileHandle || null)
      });
      if (result.cancelled) return;
      const savedFileName = safeVidFileName(result.name || fileName);
      const savedTitle = savedFileName.replace(/\.vid$/i, '');
      active.fileHandle = result.handle || null;
      active.fileName = savedFileName;
      active.title = savedTitle;
      active.doc.fileName = savedFileName;
      active.doc.title = savedTitle;
      markSaved(active);
      this.renderDocumentTabs();
      if (active.id === this.activeDocId) this.canvas?.renderArtboardMeta();
      this.showToast(`Saved "${savedFileName}"`, 'success');
    } catch (err) {
      this.showToast(`Export failed: ${err.message}`, 'error');
    }
  }

  async exportHighResImage(format = 'png') {
    const artboard = document.getElementById('inspire_artboard');
    if (!artboard) return;

    // Fixed: the artboard. Infinite: bounds of all elements + padding (the artboard is 0×0 there).
    const region = exportRegion(this.doc, this.board.elements);
    if (!region) {
      this.showToast('Nothing to export yet. Add something to the board first.', 'info');
      return;
    }
    // Stay inside browser canvas limits (Safari ~16.7M px); downscale instead of failing
    const sizing = computeSafeExportScale(region.width, region.height, EXPORT_DEFAULT_SCALE);

    this.showToast('Rendering high-resolution moodboard...', 'info');

    // Deselect elements temporarily for clean output
    const prevSelected = new Set(this.board.selectedIds);
    this.board.clearSelection();

    // Use html2canvas if loaded
    if (window.html2canvas) {
      try {
        const canvas = await window.html2canvas(artboard, {
          backgroundColor: this.doc.background,
          scale: sizing.scale,
          width: region.width,
          height: region.height,
          useCORS: true,
          logging: false,
          onclone: (clonedDoc) => prepareExportClone(clonedDoc, {
            region,
            mode: this.doc.mode,
            background: this.doc.background,
            pattern: this.doc.bgPattern
          })
        });
        if (!canvas || !canvas.width || !canvas.height) throw new Error('the rendered image was empty');

        const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
        const quality = format === 'jpg' ? 0.92 : undefined;
        const blob = await new Promise((resolve) => {
          try { canvas.toBlob(resolve, mime, quality); } catch (_) { resolve(null); }
        });
        if (!blob) throw new Error('the browser could not encode the image');
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeFileBase(this.doc.title)}.${format}`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);

        this.lastExport = { width: canvas.width, height: canvas.height, scale: sizing.scale, reduced: sizing.reduced, region };
        const sizeNote = `${canvas.width} × ${canvas.height}px`;
        this.showToast(sizing.reduced
          ? `Exported ${format.toUpperCase()} at ${sizeNote} (scale reduced to ${sizing.scale}× to stay within browser image limits)`
          : `Exported ${format.toUpperCase()} moodboard (${sizeNote})`, 'success', sizing.reduced ? 6000 : 3000);
      } catch (err) {
        console.error('[Export Image Error]', err);
        this.showToast(`Failed to render image: ${err.message}`, 'error');
      } finally {
        this.board.selectedIds = prevSelected;
        this.canvas.updateSelectionHandles();
      }
    } else {
      window.print();
    }
  }

  /* -------------------------------------------------------------------------- */
  /* 5. Swipe File Library Panel (Auto-Categorization & Filtering)             */
  /* -------------------------------------------------------------------------- */

  initLibraryPanel() {
    const container = document.getElementById('panel_swipe_file');
    if (!container) return;

    container.innerHTML = `
      <div class="swipe-panel-header">
        <div class="panel_field">
          <input type="text" id="lib_search_input" class="panel_input" placeholder="Search inspiration, tags, quotes..." />
        </div>
        
        <!-- Category Filter Tabs -->
        <div class="category-tabs-scroll" id="lib_category_tabs">
          <!-- Populated by JS -->
        </div>

        <!-- Quick Capture Dropzone Input -->
        <div class="quick-capture-dropzone" id="quick_capture_zone" title="Click or Paste to add item">
          <div class="capture-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14"></path>
            </svg>
          </div>
          <div class="capture-text">
            <strong>Paste or Drop Inspiration</strong>
            <span>Images, quotes, written copy, hex colors</span>
          </div>
        </div>

        <!-- Active Tags Filter Bar -->
        <div class="tags-filter-bar" id="lib_tags_bar">
          <!-- Populated by JS -->
        </div>
      </div>

      <!-- Library Items Grid -->
      <div class="swipe-items-scroll">
        <div class="swipe-cards-masonry" id="swipe_cards_grid">
          <!-- Populated by JS -->
        </div>
      </div>
    `;

    // Category Tabs Render
    this.renderCategoryTabs();
    this.renderLibraryTags();
    this.renderLibraryGrid();

    // Search Input
    const searchInput = container.querySelector('#lib_search_input');
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.renderLibraryGrid();
    });

    // Quick Capture Click: opens modal or file picker
    const captureZone = container.querySelector('#quick_capture_zone');
    captureZone?.addEventListener('click', () => this.showAddItemModal());

    // Drag and drop onto quick capture
    captureZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      captureZone.classList.add('drag-active');
    });
    captureZone?.addEventListener('dragleave', () => captureZone.classList.remove('drag-active'));
    captureZone?.addEventListener('drop', async (e) => {
      e.preventDefault();
      captureZone.classList.remove('drag-active');
      await this.handleDropOntoLibrary(e);
    });
  }

  renderCategoryTabs() {
    const tabsContainer = document.getElementById('lib_category_tabs');
    if (!tabsContainer) return;

    const cats = this.swipeFile.categories;
    tabsContainer.innerHTML = cats.map(cat => `
      <button type="button" class="cat-pill ${this.activeCategoryFilter === cat ? 'active' : ''}" data-cat="${cat}">
        ${cat}
      </button>
    `).join('');

    tabsContainer.querySelectorAll('.cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeCategoryFilter = btn.dataset.cat;
        tabsContainer.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderLibraryGrid();
      });
    });
  }

  renderLibraryTags() {
    const tagsBar = document.getElementById('lib_tags_bar');
    if (!tagsBar) return;

    const tags = Array.from(this.swipeFile.tags).slice(0, 16);
    tagsBar.innerHTML = `
      <span class="tags-label">Tags:</span>
      ${tags.map(t => `
        <button type="button" class="tag-badge ${this.activeTagFilter === t ? 'active' : ''}" data-tag="${t}">
          #${t}
        </button>
      `).join('')}
      ${this.activeTagFilter ? `<button type="button" class="tag-badge-clear" id="btn_clear_tag_filter">✕ Clear</button>` : ''}
    `;

    tagsBar.querySelectorAll('.tag-badge').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        this.activeTagFilter = this.activeTagFilter === tag ? null : tag;
        this.renderLibraryTags();
        this.renderLibraryGrid();
      });
    });

    tagsBar.querySelector('#btn_clear_tag_filter')?.addEventListener('click', () => {
      this.activeTagFilter = null;
      this.renderLibraryTags();
      this.renderLibraryGrid();
    });
  }

  renderLibraryGrid() {
    const grid = document.getElementById('swipe_cards_grid');
    if (!grid) return;

    const items = this.swipeFile.getFilteredItems({
      query: this.searchQuery,
      category: this.activeCategoryFilter,
      tag: this.activeTagFilter
    });

    if (items.length === 0) {
      grid.innerHTML = `
        <div class="empty-library-state">
          <p>No items found in <strong>${this.activeCategoryFilter}</strong></p>
          <span>Paste an image, quote, or color palette to auto-categorize it into your swipe file.</span>
        </div>
      `;
      return;
    }

    grid.innerHTML = items.map(item => this.createCardHtml(item)).join('');

    // Attach event listeners to card actions
    grid.querySelectorAll('.swipe-card').forEach(card => {
      const id = card.dataset.id;
      const item = items.find(it => it.id === id);
      if (!item) return;

      // Dragstart
      card.addEventListener('dragstart', (e) => {
        // Don't drag card if dragging from inside tag form
        if (e.target.closest?.('.inline-tag-form, .btn-add-tag-trigger, .btn-remove-tag')) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData('application/x-inspire-item', item.id);
        e.dataTransfer.effectAllowed = 'copy';
      });

      // Add to Board button
      card.querySelector('.btn-add-to-board')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.addItemToBoardAtCenter(item);
      });

      // Delete item button
      card.querySelector('.btn-delete-item')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.swipeFile.removeItem(id);
        this.showToast('Item removed from library', 'info');
      });

      // Swatch bars and color dots click to copy
      card.querySelectorAll('.palette-swatch-bar, .color-dot').forEach(sw => {
        sw.style.cursor = 'pointer';
        sw.addEventListener('click', (e) => {
          e.stopPropagation();
          const hex = sw.dataset.hex;
          if (hex) {
            navigator.clipboard?.writeText(hex);
            this.showToast(`Copied ${hex.toUpperCase()} to clipboard`, 'success');
          }
        });
      });

      // Inline Add Tag Form
      const addTagBtn = card.querySelector('.btn-add-tag-trigger');
      const tagForm = card.querySelector('.inline-tag-form');
      const tagInput = card.querySelector('.card-tag-input');
      const confirmBtn = card.querySelector('.btn-confirm-add-tag');
      const cancelBtn = card.querySelector('.btn-cancel-add-tag');

      const showTagForm = () => {
        if (!tagForm) return;
        addTagBtn.style.display = 'none';
        tagForm.style.display = 'inline-flex';
        tagInput.value = '';
        tagInput.focus();
      };

      const hideTagForm = () => {
        if (!tagForm) return;
        tagForm.style.display = 'none';
        if (addTagBtn) addTagBtn.style.display = 'inline-flex';
      };

      const commitAddTag = () => {
        const val = tagInput.value.trim();
        if (val) {
          const newTags = val.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean);
          for (const t of newTags) {
            this.swipeFile.addTagToItem(item.id, t);
          }
          this.showToast(`Added tag(s) to "${item.title || 'file'}"`, 'success');
        }
        hideTagForm();
      };

      addTagBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        showTagForm();
      });

      // Prevent dragging or leaking clicks inside tag form
      tagForm?.addEventListener('pointerdown', (e) => e.stopPropagation());
      tagForm?.addEventListener('mousedown', (e) => e.stopPropagation());
      tagForm?.addEventListener('click', (e) => e.stopPropagation());

      tagInput?.addEventListener('keydown', (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          commitAddTag();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          hideTagForm();
        }
      });

      confirmBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        commitAddTag();
      });

      cancelBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        hideTagForm();
      });

      // Remove tag buttons
      card.querySelectorAll('.btn-remove-tag').forEach(rmBtn => {
        rmBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const tag = rmBtn.dataset.tag;
          if (tag) {
            this.swipeFile.removeTagFromItem(item.id, tag);
            this.showToast(`Removed #${tag}`, 'info');
          }
        });
      });

      // Clicking a card tag to filter by that tag
      card.querySelectorAll('.card-tag').forEach(tagSpan => {
        tagSpan.addEventListener('click', (e) => {
          if (e.target.classList.contains('btn-remove-tag')) return;
          e.stopPropagation();
          const tag = tagSpan.dataset.tag;
          if (tag) {
            this.activeTagFilter = this.activeTagFilter === tag ? null : tag;
            this.renderLibraryTags();
            this.renderLibraryGrid();
          }
        });
      });
    });
  }

  createCardHtml(item) {
    let previewHtml = '';
    const cat = item.category || 'General';

    switch (item.type) {
      case 'image':
        previewHtml = `
          <div class="card-thumb-wrap">
            <img src="${item.content}" alt="${item.title || ''}" loading="lazy" />
          </div>
        `;
        break;

      case 'quote':
        previewHtml = `
          <div class="card-quote-preview">
            <div class="quote-text">“${item.content || ''}”</div>
            ${item.meta?.author ? `<div class="quote-author">— ${item.meta.author}</div>` : ''}
          </div>
        `;
        break;

      case 'color':
        const colors = item.colors || (item.content ? item.content.split(',').map(s => s.trim()) : []);
        previewHtml = `
          <div class="card-palette-preview">
            ${colors.map(c => `<div class="palette-swatch-bar" data-hex="${c}" style="background:${c};" title="Click to copy ${c}"></div>`).join('')}
          </div>
        `;
        break;

      default:
        previewHtml = `
          <div class="card-text-preview">
            ${item.content ? item.content.slice(0, 160) + (item.content.length > 160 ? '...' : '') : ''}
          </div>
        `;
        break;
    }

    const tagBadges = (item.tags || [])
      .map(t => `
        <span class="card-tag" data-tag="${this.escapeHtml(t)}">
          #${this.escapeHtml(t)}
          <button type="button" class="btn-remove-tag" data-id="${item.id}" data-tag="${this.escapeHtml(t)}" title="Remove tag">×</button>
        </span>
      `)
      .join('');

    const colorDots = (item.colors || []).slice(0, 4)
      .map(c => `<span class="color-dot" data-hex="${c}" style="background:${c};" title="Click to copy ${c}"></span>`)
      .join('');

    return `
      <div class="swipe-card card-cat-${cat.toLowerCase().replace(/[^a-z0-9]/g, '-')}" data-id="${item.id}" draggable="true">
        <div class="card-header">
          <span class="card-cat-badge">${cat}</span>
          <div class="card-actions">
            <button type="button" class="btn-delete-item" title="Delete from library">✕</button>
          </div>
        </div>
        ${previewHtml}
        <div class="card-info">
          <div class="card-title">${this.escapeHtml(item.title || 'Untitled Item')}</div>
          ${colorDots ? `<div class="card-palette-dots">${colorDots}</div>` : ''}
          <div class="card-tags-row" data-id="${item.id}">
            ${tagBadges}
            <button type="button" class="btn-add-tag-trigger" data-id="${item.id}" title="Add a tag to this file">+ Tag</button>
            <div class="inline-tag-form" style="display: none;" data-id="${item.id}">
              <input type="text" class="card-tag-input" placeholder="Tag name..." data-id="${item.id}" />
              <button type="button" class="btn-confirm-add-tag" data-id="${item.id}" title="Confirm tag">✓</button>
              <button type="button" class="btn-cancel-add-tag" data-id="${item.id}" title="Cancel">✕</button>
            </div>
          </div>
        </div>
        <button type="button" class="btn-add-to-board" title="Place on moodboard">
          + Add to Board
        </button>
      </div>
    `;
  }

  addItemToBoardAtCenter(item) {
    // Determine canvas center in world coordinates
    const rect = this.canvas.viewport.getBoundingClientRect();
    const center = this.canvas.screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);

    // Stagger slightly so multiple items don't completely overlap
    const jitterX = (Math.random() - 0.5) * 60;
    const jitterY = (Math.random() - 0.5) * 60;

    this.canvas.dropLibraryItemOntoBoard(item, center.x + jitterX, center.y + jitterY);
    this.showToast(`Placed "${item.title || item.category}" on board`, 'success');
  }

  async handleDropOntoLibrary(e) {
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) {
      for (const f of files) {
        if (f.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = async (evt) => {
            const item = await this.swipeFile.addItem({
              type: 'image',
              content: evt.target.result,
              title: f.name.replace(/\.[^/.]+$/, ''),
              source: 'file-drop'
            });
            this.showToast(`Added "${item.title}" to ${item.category}`, 'success');
          };
          reader.readAsDataURL(f);
        }
      }
      return;
    }

    const text = e.dataTransfer.getData('text/plain');
    if (text) {
      const item = await this.swipeFile.addItem({
        type: 'text',
        content: text,
        source: 'text-drop'
      });
      this.showToast(`Auto-categorized as ${item.category}`, 'success');
    }
  }

  /* -------------------------------------------------------------------------- */
  /* 6. Templates & Auto-Layouts Panel                                         */
  /* -------------------------------------------------------------------------- */

  initTemplatesPanel() {
    const container = document.getElementById('panel_templates');
    if (!container) return;

    container.innerHTML = `
      <div class="panel_section">
        <div class="panel_header">
          <span>1-Click Moodboard Auto-Arrangers</span>
          <span class="panel_badge">LAYOUT</span>
        </div>
        <div class="panel_section_body" style="display:flex; flex-direction:column; gap:8px;">
          <p class="panel_helper_text">
            Reconstitute selected elements or your whole board into structured editorial layouts automatically.
          </p>

          <button type="button" class="btn-layout-card ${this.board.activeLayout === 'custom' ? 'active' : ''}" data-layout="custom">
            <div class="layout-card-icon">📌</div>
            <div class="layout-card-content">
              <strong>Custom Positioning</strong>
              <span>${this.board.hasCustomLayout() ? 'Revert to saved manual placement & rotations' : 'Manual positioning and organic arrangement'}</span>
            </div>
          </button>

          <button type="button" class="btn-layout-card ${this.board.activeLayout === 'masonry' ? 'active' : ''}" data-layout="masonry">
            <div class="layout-card-icon">🧱</div>
            <div class="layout-card-content">
              <strong>Masonry Moodboard</strong>
              <span>Even-column staggered heights, clean alignment</span>
            </div>
          </button>

          <button type="button" class="btn-layout-card ${this.board.activeLayout === 'editorial' ? 'active' : ''}" data-layout="editorial">
            <div class="layout-card-icon">📰</div>
            <div class="layout-card-content">
              <strong>Editorial Magazine Grid</strong>
              <span>Prominent hero focus with balanced sidebar accents</span>
            </div>
          </button>

          <button type="button" class="btn-layout-card ${this.board.activeLayout === 'colorFlow' ? 'active' : ''}" data-layout="colorFlow">
            <div class="layout-card-icon">🌈</div>
            <div class="layout-card-content">
              <strong>Color Flow Harmony</strong>
              <span>Smooth gradient chromatic transition across elements</span>
            </div>
          </button>

          <button type="button" class="btn-layout-card ${this.board.activeLayout === 'collage' ? 'active' : ''}" data-layout="collage">
            <div class="layout-card-icon">✂️</div>
            <div class="layout-card-content">
              <strong>Artistic Collage Cluster</strong>
              <span>Playful rotations, tactile layered paper aesthetic</span>
            </div>
          </button>
        </div>
      </div>

      <div class="panel_section" style="margin-top: 14px;">
        <div class="panel_header">
          <span>Curated Moodboard Starters</span>
          <span class="panel_badge">THEMES</span>
        </div>
        <div class="panel_section_body" style="display:flex; flex-direction:column; gap:8px;">
          <button type="button" class="btn_visteras_secondary" id="btn_preset_nordic" style="justify-content: flex-start; text-align: left; padding: 10px;">
            <div>
              <strong>Nordic Architecture & Editorial</strong>
              <div style="font-size: 10px; color: var(--studio-text-muted);">Warm gold, slate gray, clean typography</div>
            </div>
          </button>

          <button type="button" class="btn_visteras_secondary" id="btn_preset_editorial" style="justify-content: flex-start; text-align: left; padding: 10px;">
            <div>
              <strong>Warm Editorial & Serif Quotes</strong>
              <div style="font-size: 10px; color: var(--studio-text-muted);">Playfair Display, rich sepia tones, paper textures</div>
            </div>
          </button>
        </div>
      </div>
    `;

    container.querySelectorAll('.btn-layout-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const layoutType = btn.dataset.layout;
        this.applyAutoLayout(layoutType);
      });
    });

    container.querySelector('#btn_preset_nordic')?.addEventListener('click', () => {
      this.newDocument(InspireDocument.createSampleDemo(), 'Nordic Architecture');
    });

    container.querySelector('#btn_preset_editorial')?.addEventListener('click', () => {
      const starter = InspireDocument.createSampleDemo();
      starter.meta.title = 'Warm Editorial & Serif Quotes';
      starter.board.background = '#181512';
      this.newDocument(starter, 'Warm Editorial');
    });
  }

  applyAutoLayout(layoutType) {
    if (this.board.elements.length === 0) {
      this.showToast('No elements on the board to arrange!', 'error');
      return;
    }

    if (layoutType === 'custom') {
      if (this.board.hasCustomLayout()) {
        const reverted = this.board.revertToCustomLayout();
        if (reverted) {
          this.canvas.fitToScreen();
          this.syncOptionsBar();
          this.renderTemplatesAndLayouts();
          this.showToast('Reverted to custom layout positioning!', 'success');
          return;
        }
      }
      this.board.activeLayout = 'custom';
      this.syncOptionsBar();
      this.renderTemplatesAndLayouts();
      this.showToast('Currently in custom layout positioning', 'info');
      return;
    }

    // Capture custom layout snapshot before applying any auto-layout
    if (this.board.activeLayout === 'custom' || !this.board.hasCustomLayout()) {
      this.board.snapshotCustomLayout();
    }

    const marginX = Math.min(60, Math.round((this.doc.width || 1920) * 0.04));
    const marginY = Math.min(60, Math.round((this.doc.height || 1080) * 0.04));
    const bounds = {
      x: marginX,
      y: marginY,
      width: Math.max(200, (this.doc.width || 1920) - 2 * marginX),
      height: Math.max(200, (this.doc.height || 1080) - 2 * marginY)
    };

    let updates = [];
    switch (layoutType) {
      case 'masonry':
        updates = MoodboardLayouts.masonry(this.board.elements, { bounds, gap: 24 });
        break;
      case 'editorial':
        updates = MoodboardLayouts.editorial(this.board.elements, { bounds, gap: 24 });
        break;
      case 'colorFlow':
        updates = MoodboardLayouts.colorFlow(this.board.elements, { bounds, gap: 24 });
        break;
      case 'collage':
        updates = MoodboardLayouts.collage(this.board.elements, { bounds, gap: 40 });
        break;
      default:
        updates = MoodboardLayouts.masonry(this.board.elements, { bounds });
        break;
    }

    this.board.applyLayoutUpdates(updates, `Apply ${layoutType} layout`);
    this.board.activeLayout = layoutType;
    this.canvas.fitToScreen();
    this.syncOptionsBar();
    this.renderTemplatesAndLayouts();
    this.showToast(`Applied ${layoutType} auto-layout!`, 'success');
  }

  /* -------------------------------------------------------------------------- */
  /* 7. Layers & Outliner Panel                                                 */
  /* -------------------------------------------------------------------------- */

  initLayersPanel() {
    this.renderLayersList();
  }

  renderLayersList() {
    const container = document.getElementById('panel_layers');
    if (!container) return;

    const elementsDesc = [...this.board.elements].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));

    container.innerHTML = `
      <div class="panel_section">
        <div class="panel_header">
          <span>Board Elements (${elementsDesc.length})</span>
          <span class="panel_badge">OUTLINER</span>
        </div>
        <div class="layers-list-scroll">
          <div class="layers-list-items" id="layers_items_list">
            ${elementsDesc.length === 0 ? '<div class="empty-layers">No elements on board</div>' : ''}
          </div>
        </div>
      </div>
    `;

    const list = container.querySelector('#layers_items_list');
    if (!list) return;

    for (const el of elementsDesc) {
      const isSel = this.board.selectedIds.has(el.id);
      const row = document.createElement('div');
      row.className = `layer-item-row ${isSel ? 'selected' : ''}`;
      row.dataset.id = el.id;

      let icon = '📄';
      let title = el.type.toUpperCase();
      if (el.type === 'image') { icon = '🖼️'; title = el.data?.title || 'Image'; }
      else if (el.type === 'quote') { icon = '💬'; title = el.data?.author ? `Quote: ${el.data.author}` : 'Quote'; }
      else if (el.type === 'sticky') { icon = '📝'; title = el.data?.text ? el.data.text.slice(0, 20) : 'Sticky Note'; }
      else if (el.type === 'swatch') { icon = '🎨'; title = el.data?.name || el.data?.hex || 'Swatch'; }
      else if (el.type === 'text') { icon = '5'; title = el.data?.text ? el.data.text.slice(0, 20) : 'Text'; }

      row.innerHTML = `
        <span class="layer-icon">${icon}</span>
        <span class="layer-title">${this.escapeHtml(title)}</span>
        <div class="layer-controls">
          <button type="button" class="layer-btn-up" title="Bring Forward">
            <img src="images/go_up.svg" alt="Bring Forward" class="layer-ctrl-icon" />
          </button>
          <button type="button" class="layer-btn-down" title="Send Backward">
            <img src="images/go_down.svg" alt="Send Backward" class="layer-ctrl-icon" />
          </button>
        </div>
      `;

      row.addEventListener('click', (e) => {
        this.board.select(el.id, e.shiftKey);
      });

      row.querySelector('.layer-btn-up')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.board.select(el.id, false);
        this.board.bringForward();
      });

      row.querySelector('.layer-btn-down')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.board.select(el.id, false);
        this.board.sendBackward();
      });

      list.appendChild(row);
    }
  }

  /* -------------------------------------------------------------------------- */
  /* 8. Global Paste, Clipboard Bridge & Drag-Drop                             */
  /* -------------------------------------------------------------------------- */

  initClipboardBridge() {
    window.addEventListener('paste', async (e) => {
      // Don't intercept paste inside active text inputs or contenteditable
      const target = e.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      e.preventDefault();
      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      // 1. Check for images in clipboard
      const items = Array.from(clipboardData.items || []);
      const imageItem = items.find(it => it.type.startsWith('image/'));

      if (imageItem) {
        const file = imageItem.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = async (evt) => {
            const dataUrl = evt.target.result;
            const libItem = await this.swipeFile.addItem({
              type: 'image',
              content: dataUrl,
              title: `Pasted Image ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
              source: 'clipboard'
            });

            this.addItemToBoardAtCenter(libItem);
            this.showToast(`Pasted image: Auto-categorized as ${libItem.category}`, 'success');
          };
          reader.readAsDataURL(file);
          return;
        }
      }

      // 2. Text paste (Quotes, Copy, Hex colors)
      const text = clipboardData.getData('text/plain');
      if (text && text.trim()) {
        const libItem = await this.swipeFile.addItem({
          type: 'text',
          content: text.trim(),
          source: 'clipboard'
        });

        this.addItemToBoardAtCenter(libItem);
        this.showToast(`Pasted text: Auto-categorized as ${libItem.category}`, 'success');
      }
    });
  }

  initWindowDropZone() {
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());
  }

  /* -------------------------------------------------------------------------- */
  /* 9. Keyboard Shortcuts                                                      */
  /* -------------------------------------------------------------------------- */

  initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ignore if typing inside input / textarea / editable element / active element
      const target = e.target;
      const activeEl = document.activeElement;
      const isTextInput = (el) => {
        if (!el) return false;
        const tag = el.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (el.isContentEditable) return true;
        if (typeof el.closest === 'function' && el.closest('input, textarea, select, [contenteditable="true"], .inspire-inline-editor, .sticky-note-textarea, .polaroid-caption, .polaroid-caption-input, .inspector-input, .inspector-textarea, .tab_rename_input, .card-tag-input')) {
          return true;
        }
        return false;
      };

      const isInsidePanels = (el) => {
        if (!el || typeof el.closest !== 'function') return false;
        return !!el.closest('#panel_inspector, #sidepanels, #tools_top, #document_tabs, .inspire-modal-overlay');
      };

      if (isTextInput(target) || isTextInput(activeEl) || isInsidePanels(target) || isInsidePanels(activeEl)) {
        if (e.key === 'Escape') {
          (activeEl || target).blur?.();
        }
        return;
      }

      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      // Close Tab: Cmd+W
      if (isCmdOrCtrl && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        this.closeDocument(this.activeDocId);
        return;
      }

      // New Tab: Cmd+N
      if (isCmdOrCtrl && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        this.newDocument();
        return;
      }

      if (isCmdOrCtrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey) || (e.key === 'Z' && e.shiftKey))) {
        e.preventDefault();
        this.board.redo();
        return;
      }

      if (isCmdOrCtrl && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        this.board.undo();
        return;
      }

      if (isCmdOrCtrl && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        this.exportVidFile({ saveAs: e.shiftKey }); // ⌘S Save, ⇧⌘S Save As
        return;
      }

      if (isCmdOrCtrl && e.key === 'o') {
        e.preventDefault();
        this.openVidFile();
        return;
      }

      if (isCmdOrCtrl && e.key === 'p') {
        e.preventDefault();
        window.print();
        return;
      }

      if (isCmdOrCtrl && e.key === 'a') {
        e.preventDefault();
        this.board.selectAll();
        return;
      }

      if (isCmdOrCtrl && e.key === 'd') {
        e.preventDefault();
        this.board.duplicateSelected();
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (this.canvas?.presentation?.editing && this.canvas.presentation.slides.length > 0) {
          if (this.board.selectedIds.size === 0) {
            e.preventDefault();
            this.canvas.presentation.deleteSlide(this.canvas.presentation.index);
            return;
          }
        }
        if (this.board.selectedIds.size > 0) {
          e.preventDefault();
          this.board.deleteSelected();
        }
        return;
      }

      if (e.key === 'Escape') {
        this.board.clearSelection();
        return;
      }

      if (e.key === 'Enter') {
        const selected = this.board.getSelectedElements();
        if (selected.length === 1 && (selected[0].type === 'text' || selected[0].type === 'sticky' || selected[0].type === 'quote' || (selected[0].type === 'image' && selected[0].data?.polaroid))) {
          const dom = document.getElementById(`dom_${selected[0].id}`);
          if (dom) {
            e.preventDefault();
            this.canvas.openInlineEditor(selected[0], dom);
            return;
          }
        }
      }

      if (isCmdOrCtrl && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        this.canvas.setZoom(this.canvas.zoom * 1.2);
        return;
      }

      if (isCmdOrCtrl && e.key === '-') {
        e.preventDefault();
        this.canvas.setZoom(this.canvas.zoom * 0.8);
        return;
      }

      if (isCmdOrCtrl && e.key === '0') {
        e.preventDefault();
        this.canvas.fitToScreen();
        return;
      }

      // Spacebar: Hot swap to hand/pan tool
      if ((e.code === 'Space' || e.key === ' ') && !isCmdOrCtrl && !e.altKey) {
        if (!this.canvas?.presentation?.playing) {
          e.preventDefault();
          if (!e.repeat && this.spacePanPrevTool === null) {
            this.spacePanPrevTool = this.canvas?.activeTool || 'select';
            if (this.canvas?.activeTool !== 'hand') {
              this.handleToolAction('hand', document.getElementById('tool_hand'));
            }
          }
          return;
        }
      }

      // Quick Tools Keys: V (Select), H (Hand), T (Text), Q (Quote), S (Sticky), C (Swatch), I (Image)
      if (!isCmdOrCtrl && !e.altKey) {
        if (e.key.toLowerCase() === 'v') this.handleToolAction('select', document.getElementById('tool_select'));
        if (e.key.toLowerCase() === 'h') this.handleToolAction('hand', document.getElementById('tool_hand'));
        if (e.key.toLowerCase() === 't') this.handleToolAction('text', document.getElementById('tool_text'));
        if (e.key.toLowerCase() === 'q') this.promptAddQuote();
        if (e.key.toLowerCase() === 's') this.addStickyNote();
        if (e.key.toLowerCase() === 'c') this.promptAddSwatch();
        if (e.key.toLowerCase() === 'i') this.promptAddImage();
      }

      // Arrow keys to nudge selected elements
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        if (this.board.selectedIds.size > 0) {
          e.preventDefault();
          const dist = e.shiftKey ? 10 : 2;
          const dx = e.key === 'ArrowLeft' ? -dist : (e.key === 'ArrowRight' ? dist : 0);
          const dy = e.key === 'ArrowUp' ? -dist : (e.key === 'ArrowDown' ? dist : 0);

          for (const id of this.board.selectedIds) {
            const el = this.board.getElementById(id);
            if (el) {
              this.board.updateElement(id, { x: el.x + dx, y: el.y + dy }, false);
            }
          }
          this.canvas.renderElements();
          this.canvas.updateSelectionHandles();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if ((e.code === 'Space' || e.key === ' ') && this.spacePanPrevTool !== null) {
        if (this.canvas?.isPanning) {
          this.canvas.isPanning = false;
          this.canvas.viewport?.classList.remove('panning', 'is-dragging-pan');
        }
        const prev = this.spacePanPrevTool;
        this.spacePanPrevTool = null;
        const targetBtn = document.querySelector(`#tools_left .tool_btn[data-tool="${prev}"]`) || document.getElementById(`tool_${prev}`) || document.getElementById('tool_select');
        this.handleToolAction(prev, targetBtn);
      }
    });

    window.addEventListener('blur', () => {
      if (this.spacePanPrevTool !== null) {
        if (this.canvas?.isPanning) {
          this.canvas.isPanning = false;
          this.canvas.viewport?.classList.remove('panning', 'is-dragging-pan');
        }
        const prev = this.spacePanPrevTool;
        this.spacePanPrevTool = null;
        const targetBtn = document.querySelector(`#tools_left .tool_btn[data-tool="${prev}"]`) || document.getElementById(`tool_${prev}`) || document.getElementById('tool_select');
        this.handleToolAction(prev, targetBtn);
      }
    });
  }

  /* -------------------------------------------------------------------------- */
  /* 10. Creation Helpers & Modals                                              */
  /* -------------------------------------------------------------------------- */

  promptAddImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const dataUrl = evt.target.result;
        const item = await this.swipeFile.addItem({
          type: 'image',
          content: dataUrl,
          title: file.name.replace(/\.[^/.]+$/, ''),
          source: 'manual'
        });
        this.addItemToBoardAtCenter(item);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  promptAddQuote() {
    this.switchSidepanel('inspector');
    this.inspector.showAddQuoteForm({
      onAdd: (data) => {
        const center = this.canvas.getViewportCenter ? this.canvas.getViewportCenter() : { x: 400, y: 300 };
        const el = this.board.addQuoteElement({
          ...data,
          x: Math.round(center.x - 190),
          y: Math.round(center.y - 110)
        });
        this.board.select(el.id);
        const active = this.getActiveDocument();
        if (active) active.isDirty = true;
        this.renderDocumentTabs();
        this.showToast('Added quote to moodboard', 'success');
      },
      onSaveLibrary: async (data) => {
        await this.swipeFile.addItem({
          category: 'Quotes',
          title: data.author ? `${data.author} Quote` : 'Inspiring Quote',
          content: data.quote,
          meta: {
            author: data.author,
            cite: data.cite
          },
          tags: ['quote', 'inspiration'],
          source: 'manual'
        });
        this.showToast('Quote saved to inspiration library', 'success');
      }
    });
  }

  promptAddText() {
    const center = this.canvas.getViewportCenter ? this.canvas.getViewportCenter() : { x: 400, y: 300 };
    const el = this.board.addTextElement({
      text: 'CREATIVE DIRECTION 2027',
      fontFamily: 'Montserrat',
      fontSize: 36,
      fontWeight: '800',
      x: Math.round(center.x - 160),
      y: Math.round(center.y - 40)
    });
    this.board.select(el.id);
    this.switchSidepanel('inspector');
    const active = this.getActiveDocument();
    if (active) active.isDirty = true;
    this.renderDocumentTabs();
    this.showToast('Added text element (customize in Inspector)', 'success');
  }

  addStickyNote() {
    const colors = ['#fef08a', '#bbf7d0', '#bae6fd', '#fed7aa', '#fbcfe8'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const center = this.canvas.getViewportCenter ? this.canvas.getViewportCenter() : { x: 400, y: 300 };
    const el = this.board.addStickyElement({
      text: 'Pin your ideas, creative notes, or reminders here.',
      color: randomColor,
      tape: true,
      x: Math.round(center.x - 110),
      y: Math.round(center.y - 110)
    });
    this.board.select(el.id);
    this.switchSidepanel('inspector');
    const active = this.getActiveDocument();
    if (active) active.isDirty = true;
    this.renderDocumentTabs();
    this.showToast('Added sticky note', 'success');
  }

  promptAddSwatch() {
    const center = this.canvas.getViewportCenter ? this.canvas.getViewportCenter() : { x: 400, y: 300 };
    const el = this.board.addSwatchElement({
      hex: '#f59e0b',
      name: 'Amber Gold',
      label: 'Primary Accent',
      x: Math.round(center.x - 80),
      y: Math.round(center.y - 80)
    });
    this.board.select(el.id);
    this.switchSidepanel('inspector');
    const active = this.getActiveDocument();
    if (active) active.isDirty = true;
    this.renderDocumentTabs();
    this.showToast('Added color swatch (customize in Inspector)', 'success');
  }

  addShape(shapeType = 'rect') {
    this.board.addShapeElement({ shapeType });
    this.showToast('Added shape to moodboard', 'success');
  }

  addConnector() {
    this.board.addConnectorElement({});
    this.showToast('Added connector arrow', 'success');
  }

  showAddItemModal() {
    const modal = document.createElement('div');
    modal.className = 'visteras-modal-backdrop';
    modal.innerHTML = `
      <div class="visteras-modal-card">
        <div class="modal-header">
          <h3>Add to Inspiration Library</h3>
          <button type="button" class="modal-close-btn" id="modal_close">✕</button>
        </div>
        <div class="modal-body">
          <div class="panel_field">
            <span class="panel_label">Category</span>
            <select class="panel_select" id="modal_item_cat">
              ${this.swipeFile.categories.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div class="panel_field">
            <span class="panel_label">Title / Caption</span>
            <input type="text" class="panel_input" id="modal_item_title" placeholder="Give this inspiration a name..." />
          </div>
          <div class="panel_field">
            <span class="panel_label">Content (Text, Quote, Hex Codes, or Image URL)</span>
            <textarea class="panel_textarea" id="modal_item_content" rows="4" placeholder="Paste your text or image URL here..."></textarea>
          </div>
          <div class="panel_field">
            <span class="panel_label">Tags (comma separated)</span>
            <input type="text" class="panel_input" id="modal_item_tags" placeholder="editorial, warm, minimal" />
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn_visteras_secondary" id="modal_cancel">Cancel</button>
          <button type="button" class="btn_visteras_amber" id="modal_save">Save to Library</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('#modal_close').addEventListener('click', close);
    modal.querySelector('#modal_cancel').addEventListener('click', close);

    modal.querySelector('#modal_save').addEventListener('click', async () => {
      const cat = modal.querySelector('#modal_item_cat').value;
      const title = modal.querySelector('#modal_item_title').value;
      const content = modal.querySelector('#modal_item_content').value;
      const tagsStr = modal.querySelector('#modal_item_tags').value;
      const tags = tagsStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

      if (!content.trim()) {
        alert('Please enter content or a URL');
        return;
      }

      await this.swipeFile.addItem({
        category: cat,
        title: title || undefined,
        content: content.trim(),
        tags: tags,
        source: 'manual'
      });

      close();
      this.showToast('Item saved to inspiration library', 'success');
    });
  }

  showAboutModal() {
    alert('Visteras Inspire v1.0.0\n\nThe client-side creative bridge between your personal swipe file library and expressive moodboards.\n\nFiles saved as 100% self-contained .vid documents.');
  }

  showShortcutsModal() {
    alert('Keyboard Shortcuts:\n• ⌘N: New Tab\n• ⌘W: Close Current Tab\n• ⌘Z: Undo\n• ⇧⌘Z: Redo\n• ⌘S: Save .vid file\n• ⌘O: Open .vid file\n• ⌘P: Print Board\n• ⌘A: Select All\n• ⌘D: Duplicate\n• ⌫: Delete selected\n• V: Select tool\n• H: Hand/Pan tool\n• Space: Pan canvas\n• Arrow keys: Nudge elements');
  }

  /* -------------------------------------------------------------------------- */
  /* 11. Clipboard Internal Cut/Copy/Paste                                      */
  /* -------------------------------------------------------------------------- */

  cutSelected() {
    this.copySelected();
    this.board.deleteSelected();
  }

  copySelected() {
    const selected = this.board.getSelectedElements();
    if (!selected.length) return;
    this.internalClipboard = JSON.parse(JSON.stringify(selected));
    this.showToast(`Copied ${selected.length} element(s)`, 'info');
  }

  pasteFromInternal() {
    if (!this.internalClipboard || !this.internalClipboard.length) return;
    this.board.clearSelection();

    for (const item of this.internalClipboard) {
      const clone = JSON.parse(JSON.stringify(item));
      clone.id = 'el_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      clone.x += 30;
      clone.y += 30;
      clone.zIndex = this.board.elements.length + 1;
      this.board.elements.push(clone);
      this.board.selectedIds.add(clone.id);
    }

    this.board.normalizeZIndex();
    this.board.saveHistory('Paste Elements');
    this.board.notify({ type: 'add' });
    this.showToast(`Pasted ${this.internalClipboard.length} element(s)`, 'success');
  }

  /* -------------------------------------------------------------------------- */
  /* 12. Status Bar Updates & Toasts                                           */
  /* -------------------------------------------------------------------------- */

  syncSelectionUI(selected) {
    if (this.activeSidepanelTab === 'inspector') {
      if (document.activeElement && this.inspector?.container?.contains(document.activeElement)) {
        return;
      }
      this.inspector.render();
    }
  }

  updateStatus(extra = {}) {
    const modeEl = document.getElementById('status-mode-text');
    const dimsEl = document.getElementById('status-dims-text');
    const countEl = document.getElementById('status-items-text');
    const zoomEl = document.getElementById('status-zoom-btn');
    const msgEl = document.getElementById('status-bar-text');

    if (modeEl) {
      modeEl.textContent = this.doc.mode === 'fixed' ? 'Fixed Artboard' : 'Infinite Canvas';
    }

    if (dimsEl) {
      dimsEl.textContent = this.doc.mode === 'fixed'
        ? `${this.doc.width} × ${this.doc.height}px`
        : 'Unconstrained';
    }

    if (countEl) {
      countEl.textContent = `${this.board.elements.length} on board · ${this.swipeFile.items.length} in library`;
    }

    if (zoomEl) {
      const z = zoomPercent(extra, this.canvas);
      zoomEl.textContent = `${z}%`;
    }

    if (msgEl && extra.message) {
      msgEl.textContent = extra.message;
    }
  }

  showToast(message, type = 'info', duration = 3000) {
    return showToast(message, type, duration); // shared kit (lib/visteras-ui/toast.js)
  }
}

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.inspireApp = new InspireApp();
});
