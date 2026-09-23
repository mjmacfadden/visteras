/**
 * Visteras Vector — document shell
 *
 * Multi-document tabs, New Document modal, fit-to-workspace default artboard
 * (~32px padding), status bar (zoom / size / units), rulers toggle, unit switching.
 *
 * In-memory documents only (v1). Does not import Studio modules.
 */

import {
  DOCUMENT_PRESETS,
  CATEGORIES,
  UNITS,
  PX_PER_INCH,
  convertToPixels,
  convertFromPixels,
  convertUnits,
  formatPresetDimensions,
  formatSize,
} from './visteras-document-presets.js';

const RECENT_KEY = 'visteras_vector_recent_document_presets';
const LAST_PRESET_KEY = 'visteras_vector_last_new_preset';
const UNIT_KEY = 'visteras_vector_base_unit';
const RULERS_KEY = 'visteras_vector_show_rulers';
const WORKSPACE_PADDING = 32;
const EMPTY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"></svg>';

function uid() {
  return `doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function calcAspectStyle(w, h) {
  const width = parseFloat(w) || 1;
  const height = parseFloat(h) || 1;
  const ratio = width / height;
  let boxW = 60;
  let boxH = 60;
  if (ratio >= 1) {
    boxW = 68;
    boxH = Math.max(16, Math.min(60, Math.round(68 / ratio)));
  } else {
    boxH = 60;
    boxW = Math.max(16, Math.min(68, Math.round(60 * ratio)));
  }
  return `width:${boxW}px;height:${boxH}px;`;
}

function svgHasUserContent(svgString) {
  if (!svgString || typeof svgString !== 'string') return false;
  try {
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    const root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() === 'parsererror') return false;
    const skip = new Set(['defs', 'metadata', 'title', 'desc', 'style', 'script']);
    const walk = (node) => {
      for (const child of Array.from(node.children || [])) {
        const name = (child.nodeName || '').toLowerCase();
        if (name.includes(':') || skip.has(name)) continue;
        if (name === 'g') {
          if (walk(child)) return true;
          continue;
        }
        return true;
      }
      return false;
    };
    return walk(root);
  } catch {
    return /<(?:rect|circle|ellipse|path|line|polyline|polygon|text|image|use)\b/i.test(svgString);
  }
}

/**
 * @param {{ svgEditor: object }} opts
 */
export function mountVisterasDocumentShell({ svgEditor }) {
  if (!svgEditor?.svgCanvas) {
    console.warn('[visteras-document-shell] svgEditor not ready');
    return null;
  }
  if (window.__visterasDocumentShell) return window.__visterasDocumentShell;

  const sc = svgEditor.svgCanvas;

  const state = {
    documents: [],
    activeId: null,
    autoTitleCount: 1,
    suppressDirty: false,
    resizeTimer: null,
    modal: {
      open: false,
      category: 'web',
      preset: null,
      orientation: 'landscape',
      unit: 'px',
      width: 1920,
      height: 1080,
      name: 'Untitled-1',
    },
  };

  // ----- config / canvas helpers -----
  function curConfig() {
    return svgEditor.configObj?.curConfig || svgEditor.curConfig || {};
  }

  function getBaseUnit() {
    return curConfig().baseUnit || localStorage.getItem(UNIT_KEY) || 'px';
  }

  function setBaseUnit(unit) {
    const u = UNITS.some((x) => x.id === unit) ? unit : 'px';
    if (svgEditor.configObj?.curConfig) svgEditor.configObj.curConfig.baseUnit = u;
    try { sc.setConfig?.(curConfig()); } catch { /* ignore */ }
    try { localStorage.setItem(UNIT_KEY, u); } catch { /* ignore */ }
    const prefs = document.querySelector('se-svg-editor-dialog, #svg_prefs');
    if (prefs?.setAttribute) prefs.setAttribute('baseunit', u);
    updateRulers();
    updateStatusBar();
    return u;
  }

  function rulersVisible() {
    return curConfig().showRulers !== false;
  }

  function setRulersVisible(show) {
    const on = !!show;
    if (svgEditor.configObj?.curConfig) svgEditor.configObj.curConfig.showRulers = on;
    try {
      if (svgEditor.rulers && typeof svgEditor.rulers.display === 'function') {
        svgEditor.rulers.display(on);
      }
    } catch { /* ignore */ }
    document.querySelector('.svg_editor')?.classList.toggle('visteras-rulers-hidden', !on);
    try { localStorage.setItem(RULERS_KEY, on ? '1' : '0'); } catch { /* ignore */ }
    if (on) updateRulers();
    const doc = getActiveDoc();
    if (doc?.isStartupDefault && !doc.dirty && !svgHasUserContent(captureSvg())) {
      fitDefaultArtboard();
    } else {
      try { svgEditor.updateCanvas?.(true); } catch { /* ignore */ }
    }
    updateStatusBar();
  }

  function toggleRulers() {
    setRulersVisible(!rulersVisible());
  }

  function updateRulers() {
    try {
      if (rulersVisible() && svgEditor.rulers?.updateRulers) {
        svgEditor.rulers.updateRulers();
      }
    } catch { /* ignore */ }
  }

  function getResolution() {
    try {
      const r = sc.getResolution?.();
      if (r && (r.w || r.width)) {
        return { w: Number(r.w ?? r.width), h: Number(r.h ?? r.height) };
      }
    } catch { /* ignore */ }
    return { w: 800, h: 600 };
  }

  function setResolution(w, h) {
    const width = Math.max(1, Math.round(Number(w) || 1));
    const height = Math.max(1, Math.round(Number(h) || 1));
    try { sc.setResolution?.(width, height); } catch (err) {
      console.warn('[visteras-document-shell] setResolution failed', err);
    }
    try { svgEditor.updateCanvas?.(true); } catch { /* ignore */ }
    updateRulers();
    return { w: width, h: height };
  }

  function captureSvg() {
    try { return sc.getSvgString?.() || EMPTY_SVG; } catch { return EMPTY_SVG; }
  }

  function loadSvg(svgString, width, height) {
    state.suppressDirty = true;
    try {
      if (width && height) setResolution(width, height);
      if (svgString) {
        const ok = sc.setSvgString?.(svgString);
        if (ok === false) sc.clearSvgContentElement?.();
      } else {
        sc.clearSvgContentElement?.();
      }
      try { svgEditor.updateCanvas?.(true); } catch { /* ignore */ }
      updateRulers();
    } finally {
      setTimeout(() => { state.suppressDirty = false; }, 60);
    }
  }

  function getZoomPercent() {
    try {
      const z = sc.getZoom?.();
      if (typeof z === 'number' && z > 0) return Math.round(z * 100);
    } catch { /* ignore */ }
    return 100;
  }

  function computePaddedWorkspaceSize() {
    const workarea = document.getElementById('workarea') || svgEditor.workarea;
    let availW = 0;
    let availH = 0;
    if (workarea) {
      const rect = workarea.getBoundingClientRect?.() || {};
      availW = Math.floor(rect.width || workarea.clientWidth || 0);
      availH = Math.floor(rect.height || workarea.clientHeight || 0);
    }
    if (!availW || !availH) {
      availW = Math.floor(window.innerWidth - 36 - 240 - 16);
      availH = Math.floor(window.innerHeight - 28 - 45 - 28 - 24 - 16);
    }
    return {
      w: Math.max(200, availW - WORKSPACE_PADDING * 2),
      h: Math.max(200, availH - WORKSPACE_PADDING * 2),
    };
  }

  function fitDefaultArtboard() {
    const { w, h } = computePaddedWorkspaceSize();
    setResolution(w, h);
    const doc = getActiveDoc();
    if (doc) {
      doc.width = w;
      doc.height = h;
      doc.svg = captureSvg();
    }
    updateStatusBar();
    renderTabs();
  }

  // ----- document model -----
  function getActiveDoc() {
    return state.documents.find((d) => d.id === state.activeId) || null;
  }

  function createDocModel({
    title,
    width,
    height,
    unit = getBaseUnit(),
    svg = EMPTY_SVG,
    dirty = false,
    isStartupDefault = false,
  } = {}) {
    return {
      id: uid(),
      title: title || `Untitled-${state.autoTitleCount++}`,
      width: width || 800,
      height: height || 600,
      unit,
      svg,
      dirty,
      isStartupDefault,
    };
  }

  function saveActiveToModel() {
    const doc = getActiveDoc();
    if (!doc) return;
    const res = getResolution();
    doc.width = res.w;
    doc.height = res.h;
    doc.unit = getBaseUnit();
    doc.svg = captureSvg();
  }

  function isActiveUntouchedDefault() {
    const doc = getActiveDoc();
    if (!doc) return true;
    if (doc.dirty) return false;
    if (!doc.isStartupDefault) return false;
    if (doc.title && !/^Untitled-\d+$/i.test(doc.title)) return false;
    if (svgHasUserContent(captureSvg())) return false;
    return true;
  }

  function markDirty() {
    if (state.suppressDirty) return;
    const doc = getActiveDoc();
    if (!doc || doc.dirty) return;
    doc.dirty = true;
    doc.isStartupDefault = false;
    renderTabs();
  }

  // ----- tabs -----
  function ensureTabBar() {
    let bar = document.getElementById('vector_document_tabs');
    if (bar) return bar;
    const editorEl = document.querySelector('.svg_editor');
    bar = document.createElement('div');
    bar.id = 'vector_document_tabs';
    bar.className = 'document_tabs';
    bar.setAttribute('role', 'tablist');
    if (editorEl) {
      const toolsTop = document.getElementById('tools_top');
      if (toolsTop && toolsTop.parentNode === editorEl) {
        toolsTop.insertAdjacentElement('afterend', bar);
      } else {
        editorEl.appendChild(bar);
      }
    } else {
      document.getElementById('container')?.appendChild(bar);
    }
    bar.addEventListener('click', (e) => {
      const closeBtn = e.target.closest?.('.tab_close');
      if (closeBtn) {
        e.preventDefault();
        e.stopPropagation();
        closeDocument(closeBtn.dataset.id);
        return;
      }
      const tab = e.target.closest?.('.document_tab');
      if (tab?.dataset?.id) {
        switchDocument(tab.dataset.id);
        return;
      }
      if (e.target.closest?.('.new_tab_btn')) openNewModal();
    });
    return bar;
  }

  function renderTabs() {
    const bar = ensureTabBar();
    if (!bar) return;
    const tabsHtml = state.documents.map((doc) => {
      const active = doc.id === state.activeId;
      const dirtyMark = doc.dirty ? ' •' : '';
      return `
        <div class="document_tab${active ? ' active' : ''}${doc.dirty ? ' dirty' : ''}"
             data-id="${escapeHtml(doc.id)}" role="tab" aria-selected="${active ? 'true' : 'false'}"
             title="${escapeHtml(doc.title)} (${Math.round(doc.width)} × ${Math.round(doc.height)})${doc.dirty ? ' — unsaved' : ''}">
          <span class="tab_title">${escapeHtml(doc.title)}${dirtyMark}</span>
          <span class="tab_close" data-id="${escapeHtml(doc.id)}" title="Close">×</span>
        </div>`;
    }).join('');
    bar.innerHTML = `${tabsHtml}<button type="button" class="new_tab_btn" title="New Document">+</button>`;
  }

  function switchDocument(id) {
    if (!id || id === state.activeId) return;
    const next = state.documents.find((d) => d.id === id);
    if (!next) return;
    saveActiveToModel();
    state.activeId = id;
    setBaseUnit(next.unit || 'px');
    loadSvg(next.svg, next.width, next.height);
    renderTabs();
    updateStatusBar();
  }

  function closeDocument(id) {
    const idx = state.documents.findIndex((d) => d.id === id);
    if (idx < 0) return;
    const doc = state.documents[idx];
    if (doc.dirty) {
      const ok = window.confirm(`Close "${doc.title}"? Unsaved changes will be lost.`);
      if (!ok) return;
    }
    if (state.documents.length === 1) {
      const { w, h } = computePaddedWorkspaceSize();
      state.suppressDirty = true;
      try {
        sc.clearSvgContentElement?.();
        setResolution(w, h);
      } finally {
        setTimeout(() => { state.suppressDirty = false; }, 50);
      }
      doc.title = `Untitled-${state.autoTitleCount++}`;
      doc.width = w;
      doc.height = h;
      doc.unit = getBaseUnit();
      doc.svg = captureSvg();
      doc.dirty = false;
      doc.isStartupDefault = true;
      renderTabs();
      updateStatusBar();
      return;
    }
    const wasActive = state.activeId === id;
    state.documents.splice(idx, 1);
    if (wasActive) {
      const next = state.documents[Math.max(0, idx - 1)];
      state.activeId = next.id;
      setBaseUnit(next.unit || 'px');
      loadSvg(next.svg, next.width, next.height);
    }
    renderTabs();
    updateStatusBar();
  }

  function createDocument({ title, width, height, unit = 'px', forceNew = false } = {}) {
    const replace = !forceNew && isActiveUntouchedDefault();
    setBaseUnit(unit);

    if (replace) {
      const doc = getActiveDoc();
      state.suppressDirty = true;
      try {
        sc.clearSvgContentElement?.();
        setResolution(width, height);
      } finally {
        setTimeout(() => { state.suppressDirty = false; }, 50);
      }
      if (doc) {
        doc.title = title || `Untitled-${state.autoTitleCount++}`;
        doc.width = width;
        doc.height = height;
        doc.unit = unit;
        doc.svg = captureSvg();
        doc.dirty = false;
        doc.isStartupDefault = false;
      }
      renderTabs();
      updateStatusBar();
      return doc;
    }

    saveActiveToModel();
    const newDoc = createDocModel({
      title,
      width,
      height,
      unit,
      svg: EMPTY_SVG,
      dirty: false,
      isStartupDefault: false,
    });
    state.documents.push(newDoc);
    state.activeId = newDoc.id;
    state.suppressDirty = true;
    try {
      sc.clearSvgContentElement?.();
      setResolution(width, height);
      newDoc.svg = captureSvg();
    } finally {
      setTimeout(() => { state.suppressDirty = false; }, 50);
    }
    renderTabs();
    updateStatusBar();
    return newDoc;
  }

  // ----- status bar -----
  function ensureStatusBar() {
    const bottom = document.getElementById('tools_bottom');
    if (!bottom) return null;
    let bar = document.getElementById('vector_status_bar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'vector_status_bar';
    bar.innerHTML = `
      <div class="status_left">
        <div class="status_item" id="vector_status_zoom">Zoom <span>100%</span></div>
        <div class="status_divider"></div>
        <div class="status_item" id="vector_status_size">Artboard <span>—</span></div>
        <div class="status_divider"></div>
        <div class="status_item" id="vector_status_doc">Document <span>Untitled-1</span></div>
      </div>
      <div class="status_right">
        <div class="status_item" id="vector_status_hint">Ready</div>
        <label class="status_item" title="Document / ruler units" style="display:inline-flex;align-items:center;gap:4px;margin:0;">
          Units
          <select id="vector_status_unit" aria-label="Document units">
            ${UNITS.map((u) => `<option value="${u.id}">${u.id}</option>`).join('')}
          </select>
        </label>
      </div>
    `;
    bottom.prepend(bar);
    bar.querySelector('#vector_status_unit')?.addEventListener('change', (e) => {
      setBaseUnit(e.target.value);
      const doc = getActiveDoc();
      if (doc) doc.unit = e.target.value;
      updateStatusBar();
    });
    return bar;
  }

  function updateStatusBar() {
    ensureStatusBar();
    const zoomEl = document.querySelector('#vector_status_zoom span');
    const sizeEl = document.querySelector('#vector_status_size span');
    const docEl = document.querySelector('#vector_status_doc span');
    const unitSel = document.getElementById('vector_status_unit');
    const res = getResolution();
    const unit = getBaseUnit();
    const doc = getActiveDoc();
    if (zoomEl) zoomEl.textContent = `${getZoomPercent()}%`;
    if (sizeEl) sizeEl.textContent = formatSize(res.w, res.h, unit);
    if (docEl) docEl.textContent = doc?.title || '—';
    if (unitSel && unitSel.value !== unit) unitSel.value = unit;
  }

  // ----- New Document modal -----
  function getRecentPresets() {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch { /* ignore */ }
    return [
      DOCUMENT_PRESETS.web[3],
      DOCUMENT_PRESETS.web[0],
      DOCUMENT_PRESETS.print[0],
      DOCUMENT_PRESETS.social[0],
    ].filter(Boolean);
  }

  function saveRecentPreset(preset) {
    if (!preset?.width || !preset?.height) return;
    try {
      let recents = getRecentPresets();
      recents = recents.filter((p) => !(
        p.name === preset.name
        && p.width === preset.width
        && p.height === preset.height
        && p.unit === preset.unit
      ));
      recents.unshift({
        id: `recent_${Date.now()}`,
        name: preset.name || 'Custom',
        width: preset.width,
        height: preset.height,
        unit: preset.unit || 'px',
        category: 'recent',
        description: formatPresetDimensions(preset),
      });
      if (recents.length > 8) recents = recents.slice(0, 8);
      localStorage.setItem(RECENT_KEY, JSON.stringify(recents));
      localStorage.setItem(LAST_PRESET_KEY, JSON.stringify(recents[0]));
    } catch { /* ignore */ }
  }

  function ensureModal() {
    if (document.getElementById('vector_new_doc_modal')) return;
    const overlay = document.createElement('div');
    overlay.id = 'vector_new_doc_overlay';
    const modal = document.createElement('div');
    modal.id = 'vector_new_doc_modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'New Document');
    document.body.appendChild(overlay);
    document.body.appendChild(modal);
    overlay.addEventListener('click', closeNewModal);
  }

  function applyPresetToModal(p) {
    if (!p) return;
    state.modal.preset = p;
    state.modal.unit = p.unit || 'px';
    state.modal.width = p.width;
    state.modal.height = p.height;
    state.modal.orientation = (p.width >= p.height) ? 'landscape' : 'portrait';
  }

  function renderModal() {
    ensureModal();
    const modal = document.getElementById('vector_new_doc_modal');
    const m = state.modal;
    const cats = CATEGORIES.map((c) => (
      `<button type="button" class="new_doc_cat_btn${c.id === m.category ? ' active' : ''}" data-cat="${c.id}">${c.label}</button>`
    )).join('');

    const presets = m.category === 'recent' ? getRecentPresets() : (DOCUMENT_PRESETS[m.category] || []);
    const cards = presets.length
      ? presets.map((p, idx) => {
        const selected = m.preset && (
          m.preset.id === p.id
          || (m.preset.name === p.name && m.preset.width === p.width && m.preset.height === p.height)
        );
        return `
          <div class="new_doc_card${selected ? ' active' : ''}" data-index="${idx}">
            <div class="new_doc_card_preview_wrap">
              <div class="new_doc_card_aspect_box" style="${calcAspectStyle(p.width, p.height)}"></div>
            </div>
            <div class="new_doc_card_name">${escapeHtml(p.name)}</div>
            <div class="new_doc_card_dims">${escapeHtml(formatPresetDimensions(p))}</div>
          </div>`;
      }).join('')
      : '<div class="new_doc_empty_hint">No presets in this category yet.</div>';

    const unitOpts = UNITS.map((u) => (
      `<option value="${u.id}"${u.id === m.unit ? ' selected' : ''}>${u.label}</option>`
    )).join('');

    modal.innerHTML = `
      <div class="new_doc_container">
        <div class="new_doc_header">
          <div class="new_doc_title">New Document</div>
          <button type="button" class="new_doc_close_btn" data-action="close" title="Close">&times;</button>
        </div>
        <div class="new_doc_categories">${cats}</div>
        <div class="new_doc_body">
          <div class="new_doc_presets_container">
            <div class="new_doc_presets_grid">${cards}</div>
          </div>
          <div class="new_doc_details_sidebar">
            <div class="new_doc_details_content">
              <div class="new_doc_form_group">
                <label for="vector_new_doc_name">Name</label>
                <input type="text" id="vector_new_doc_name" class="new_doc_input" value="${escapeHtml(m.name)}" spellcheck="false" />
              </div>
              <div class="new_doc_row">
                <div class="new_doc_form_group">
                  <label for="vector_new_doc_width">Width</label>
                  <input type="number" step="any" min="1" id="vector_new_doc_width" class="new_doc_input" value="${m.width}" />
                </div>
                <div class="new_doc_form_group">
                  <label for="vector_new_doc_height">Height</label>
                  <input type="number" step="any" min="1" id="vector_new_doc_height" class="new_doc_input" value="${m.height}" />
                </div>
              </div>
              <div class="new_doc_form_group">
                <label for="vector_new_doc_unit">Units</label>
                <select id="vector_new_doc_unit" class="new_doc_select">${unitOpts}</select>
              </div>
              <div class="new_doc_form_group">
                <label>Orientation</label>
                <div class="new_doc_orient_group">
                  <button type="button" class="new_doc_orient_btn${m.orientation === 'portrait' ? ' active' : ''}" data-orient="portrait">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="3" width="12" height="18" rx="2"/></svg>
                    Portrait
                  </button>
                  <button type="button" class="new_doc_orient_btn${m.orientation === 'landscape' ? ' active' : ''}" data-orient="landscape">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="12" rx="2"/></svg>
                    Landscape
                  </button>
                </div>
              </div>
            </div>
            <div class="new_doc_actions">
              <button type="button" class="new_doc_btn_cancel" data-action="close">Cancel</button>
              <button type="button" class="new_doc_btn_create" data-action="create">Create</button>
            </div>
          </div>
        </div>
      </div>
    `;

    modal.querySelectorAll('.new_doc_cat_btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.modal.category = btn.dataset.cat;
        renderModal();
      });
    });
    modal.querySelectorAll('.new_doc_card').forEach((card) => {
      card.addEventListener('click', () => {
        const list = state.modal.category === 'recent'
          ? getRecentPresets()
          : (DOCUMENT_PRESETS[state.modal.category] || []);
        const p = list[Number(card.dataset.index)];
        if (!p) return;
        applyPresetToModal(p);
        renderModal();
      });
    });
    modal.querySelectorAll('.new_doc_orient_btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.orient;
        const wEl = modal.querySelector('#vector_new_doc_width');
        const hEl = modal.querySelector('#vector_new_doc_height');
        let w = parseFloat(wEl?.value) || 1;
        let h = parseFloat(hEl?.value) || 1;
        if (next === 'landscape' && w < h) [w, h] = [h, w];
        if (next === 'portrait' && w > h) [w, h] = [h, w];
        state.modal.orientation = next;
        state.modal.width = w;
        state.modal.height = h;
        if (wEl) wEl.value = w;
        if (hEl) hEl.value = h;
        renderModal();
      });
    });
    modal.querySelector('#vector_new_doc_unit')?.addEventListener('change', (e) => {
      const next = e.target.value;
      const prev = state.modal.unit;
      const wEl = modal.querySelector('#vector_new_doc_width');
      const hEl = modal.querySelector('#vector_new_doc_height');
      const w = convertUnits(parseFloat(wEl?.value) || 0, prev, next);
      const h = convertUnits(parseFloat(hEl?.value) || 0, prev, next);
      state.modal.unit = next;
      state.modal.width = w;
      state.modal.height = h;
      if (wEl) wEl.value = w;
      if (hEl) hEl.value = h;
    });
    modal.querySelectorAll('[data-action="close"]').forEach((b) => b.addEventListener('click', closeNewModal));
    modal.querySelector('[data-action="create"]')?.addEventListener('click', () => {
      const name = modal.querySelector('#vector_new_doc_name')?.value?.trim()
        || `Untitled-${state.autoTitleCount}`;
      const unit = modal.querySelector('#vector_new_doc_unit')?.value || 'px';
      const rawW = parseFloat(modal.querySelector('#vector_new_doc_width')?.value) || 800;
      const rawH = parseFloat(modal.querySelector('#vector_new_doc_height')?.value) || 600;
      createFromModal({ name, unit, rawW, rawH });
    });
  }

  function openNewModal() {
    ensureModal();
    state.modal.name = `Untitled-${state.autoTitleCount}`;
    state.modal.category = 'web';
    try {
      const last = JSON.parse(localStorage.getItem(LAST_PRESET_KEY) || 'null');
      if (last?.width && last?.height) {
        applyPresetToModal(last);
        state.modal.category = (last.category && last.category !== 'recent') ? last.category : 'recent';
      } else {
        applyPresetToModal(DOCUMENT_PRESETS.web[3] || DOCUMENT_PRESETS.web[0]);
      }
    } catch {
      applyPresetToModal(DOCUMENT_PRESETS.web[3] || DOCUMENT_PRESETS.web[0]);
    }
    renderModal();
    document.getElementById('vector_new_doc_overlay')?.classList.add('open');
    document.getElementById('vector_new_doc_modal')?.classList.add('open');
    state.modal.open = true;
    setTimeout(() => document.getElementById('vector_new_doc_name')?.focus(), 30);
  }

  function closeNewModal() {
    document.getElementById('vector_new_doc_overlay')?.classList.remove('open');
    document.getElementById('vector_new_doc_modal')?.classList.remove('open');
    state.modal.open = false;
  }

  function createFromModal({ name, unit, rawW, rawH }) {
    const widthPx = Math.max(1, Math.round(convertToPixels(rawW, unit, PX_PER_INCH)));
    const heightPx = Math.max(1, Math.round(convertToPixels(rawH, unit, PX_PER_INCH)));
    saveRecentPreset({ name, width: rawW, height: rawH, unit });
    closeNewModal();
    createDocument({ title: name, width: widthPx, height: heightPx, unit });
  }

  // ----- events -----
  function bindCanvasDirty() {
    ['changed', 'elementChanged', 'selectedChanged', 'pointsAdded', 'ext_added'].forEach((name) => {
      try { sc.bind?.(name, () => markDirty()); } catch { /* ignore */ }
    });
    try {
      const content = sc.getSvgContent?.() || document.getElementById('svgcontent');
      if (content && window.MutationObserver) {
        const mo = new MutationObserver(() => markDirty());
        mo.observe(content, { childList: true, subtree: true, attributes: true });
      }
    } catch { /* ignore */ }
  }

  function bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      const target = e.target;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.nodeName)) {
        if (state.modal.open && e.key === 'Escape') {
          e.preventDefault();
          closeNewModal();
        }
        return;
      }
      if (target?.isContentEditable) return;
      if (window.__visterasIsTypingDirectly) return;

      if (state.modal.open && e.key === 'Escape') {
        e.preventDefault();
        closeNewModal();
        return;
      }

      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (!isCmdOrCtrl || e.altKey) return;

      if (!e.shiftKey && (e.key === 'n' || e.key === 'N' || e.code === 'KeyN')) {
        e.preventDefault();
        e.stopPropagation();
        openNewModal();
        return;
      }
      if (!e.shiftKey && (e.key === 'w' || e.key === 'W' || e.code === 'KeyW')) {
        e.preventDefault();
        e.stopPropagation();
        if (state.activeId) closeDocument(state.activeId);
        return;
      }
      if (!e.shiftKey && (e.key === 'r' || e.key === 'R' || e.code === 'KeyR')) {
        e.preventDefault();
        e.stopPropagation();
        toggleRulers();
      }
    }, true);
  }

  function rebindMenuItem(id, handler) {
    const el = document.getElementById(id);
    if (!el) return;
    const clone = el.cloneNode(true);
    el.parentNode?.replaceChild(clone, el);
    clone.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handler();
    });
  }

  function bindMenuActions() {
    rebindMenuItem('action_new', openNewModal);
    rebindMenuItem('action_toggle_rulers', toggleRulers);
  }

  function bindResize() {
    window.addEventListener('resize', () => {
      clearTimeout(state.resizeTimer);
      state.resizeTimer = setTimeout(() => {
        const doc = getActiveDoc();
        if (doc?.isStartupDefault && !doc.dirty && !svgHasUserContent(captureSvg())) {
          fitDefaultArtboard();
        } else {
          try { svgEditor.updateCanvas?.(true); } catch { /* ignore */ }
          updateStatusBar();
        }
      }, 120);
    });
  }

  function bindZoomWatch() {
    setInterval(() => {
      const zoomEl = document.querySelector('#vector_status_zoom span');
      if (!zoomEl) return;
      const next = `${getZoomPercent()}%`;
      if (zoomEl.textContent !== next) zoomEl.textContent = next;
    }, 500);
  }

  function boot() {
    ensureTabBar();
    ensureStatusBar();
    ensureModal();

    const storedUnit = localStorage.getItem(UNIT_KEY);
    if (storedUnit && UNITS.some((u) => u.id === storedUnit)) {
      setBaseUnit(storedUnit);
    }

    const storedRulers = localStorage.getItem(RULERS_KEY);
    const show = storedRulers == null ? true : storedRulers !== '0';
    setRulersVisible(show);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const { w, h } = computePaddedWorkspaceSize();
        state.suppressDirty = true;
        try {
          setResolution(w, h);
          if (!svgHasUserContent(captureSvg())) {
            sc.clearSvgContentElement?.();
          }
        } finally {
          setTimeout(() => { state.suppressDirty = false; }, 80);
        }
        const initial = createDocModel({
          title: `Untitled-${state.autoTitleCount++}`,
          width: w,
          height: h,
          unit: getBaseUnit(),
          svg: captureSvg(),
          dirty: false,
          isStartupDefault: true,
        });
        state.documents = [initial];
        state.activeId = initial.id;
        renderTabs();
        updateStatusBar();
      });
    });

    bindCanvasDirty();
    bindKeyboard();
    bindMenuActions();
    bindResize();
    bindZoomWatch();
  }

  boot();

  const api = {
    openNewModal,
    closeNewModal,
    createDocument,
    switchDocument,
    closeDocument,
    fitDefaultArtboard,
    toggleRulers,
    setRulersVisible,
    setBaseUnit,
    getBaseUnit,
    getActiveDoc,
    isActiveUntouchedDefault,
    updateStatusBar,
  };
  window.__visterasDocumentShell = api;
  return api;
}
