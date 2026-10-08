/**
 * Visteras Vector — Illustrator-style document grid.
 *
 * Why the old grid broke: SVG-Edit's ext-grid draws into #canvasBackground.
 * Multiple artboards (573fbb82) hide that node with
 * `#canvasBackground{display:none!important}`, so Toggle Grid still ran but
 * nothing was visible. This module draws into #svgroot (outside #svgcontent)
 * so it never exports, and stays visible with artboards.
 *
 * View ▸ Show/Hide Grid (⌘') · Snap to Grid (⇧⌘') · Grid in Back.
 * Preferences ▸ Guides & Grid: color, Lines/Dots, Gridline every N +
 * Subdivisions, Grid in Back. Snap uses SVG-Edit's gridSnapping/snappingStep
 * (works even when the grid is hidden).
 */
import { convertToPixels } from './visteras-document-presets.js';

export const GRID_STORAGE_KEY = 'visteras-vector-grid';
export const GRID_LAYER_ID = 'visteras_document_grid';

export const DEFAULT_GRID = Object.freeze({
  show: false,
  snap: false,
  inBack: true,
  color: '#000000',
  style: 'lines', // 'lines' | 'dots'
  every: 100, // in current document units
  subdivisions: 10,
});

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function normalizeGridPrefs(raw = {}) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const style = o.style === 'dots' ? 'dots' : 'lines';
  const every = Number(o.every);
  const subdivisions = Math.round(Number(o.subdivisions));
  let color = String(o.color || DEFAULT_GRID.color);
  if (/^#[0-9a-f]{3}$/i.test(color)) color = `#${[...color.slice(1)].map((c) => c + c).join('')}`;
  if (!/^#[0-9a-f]{6}$/i.test(color)) color = DEFAULT_GRID.color;
  return {
    show: !!o.show,
    snap: !!o.snap,
    inBack: o.inBack !== false,
    color: color.toLowerCase(),
    style,
    every: Number.isFinite(every) && every > 0 ? every : DEFAULT_GRID.every,
    subdivisions: Number.isFinite(subdivisions) && subdivisions >= 1 ? clamp(subdivisions, 1, 100) : DEFAULT_GRID.subdivisions,
  };
}

/** Major grid spacing in document pixels for the current base unit. */
export function majorStepPx(prefs, unit = 'px') {
  const p = normalizeGridPrefs(prefs);
  return Math.max(0.0001, convertToPixels(p.every, unit || 'px'));
}

/** Subdivision (snap) spacing in document pixels. */
export function minorStepPx(prefs, unit = 'px') {
  const p = normalizeGridPrefs(prefs);
  return majorStepPx(p, unit) / Math.max(1, p.subdivisions);
}

/** Snap one coordinate to the grid (Illustrator: subdivision lines count). */
export function snapValue(value, step) {
  const s = Number(step);
  if (!(s > 0) || !Number.isFinite(value)) return value;
  return Math.round(value / s) * s;
}

export function snapPoint(pt, step) {
  return { x: snapValue(pt.x, step), y: snapValue(pt.y, step) };
}

/**
 * Build an SVG pattern for one major cell (user units). Origin-aligned when
 * the patterned rect is placed at a multiple of majorPx.
 */
export function buildGridPatternMarkup({ majorPx, subdivisions, color, style }) {
  const maj = Math.max(1e-6, Number(majorPx) || 1);
  const sub = Math.max(1, Math.round(Number(subdivisions) || 1));
  const minor = maj / sub;
  const stroke = String(color || '#000');
  // Major lines slightly stronger; subdivisions lighter (Illustrator).
  const majorOp = 0.35;
  const minorOp = 0.14;
  if (style === 'dots') {
    const dots = [];
    for (let i = 0; i <= sub; i++) {
      for (let j = 0; j <= sub; j++) {
        if (i === sub && j === sub) continue; // next cell paints the edge
        const isMajor = i === 0 || j === 0 || i === sub || j === sub;
        // Only paint left/top edges of the cell to avoid double-drawing seams;
        // include full lattice interior.
        if (i === sub || j === sub) continue;
        const r = isMajor && (i === 0 || j === 0) ? 1.1 : 0.7;
        const op = (i === 0 || j === 0) ? majorOp : minorOp;
        dots.push(`<circle cx="${i * minor}" cy="${j * minor}" r="${r}" fill="${stroke}" fill-opacity="${op}"/>`);
      }
    }
    // Major intersections at cell corners (0,0 only — pattern tiles).
    dots.push(`<circle cx="0" cy="0" r="1.25" fill="${stroke}" fill-opacity="${majorOp}"/>`);
    return { width: maj, height: maj, body: dots.join('') };
  }
  const lines = [];
  for (let i = 1; i < sub; i++) {
    const o = i * minor;
    lines.push(`<line x1="${o}" y1="0" x2="${o}" y2="${maj}" stroke="${stroke}" stroke-opacity="${minorOp}" stroke-width="1" vector-effect="non-scaling-stroke"/>`);
    lines.push(`<line x1="0" y1="${o}" x2="${maj}" y2="${o}" stroke="${stroke}" stroke-opacity="${minorOp}" stroke-width="1" vector-effect="non-scaling-stroke"/>`);
  }
  // Major edges of the cell (left + top); right/bottom come from the next tile.
  lines.push(`<line x1="0" y1="0" x2="0" y2="${maj}" stroke="${stroke}" stroke-opacity="${majorOp}" stroke-width="1" vector-effect="non-scaling-stroke"/>`);
  lines.push(`<line x1="0" y1="0" x2="${maj}" y2="0" stroke="${stroke}" stroke-opacity="${majorOp}" stroke-width="1" vector-effect="non-scaling-stroke"/>`);
  return { width: maj, height: maj, body: lines.join('') };
}

export function loadGridPrefs(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  try {
    const raw = storage ? storage.getItem(GRID_STORAGE_KEY) : null;
    return normalizeGridPrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeGridPrefs(null);
  }
}

export function saveGridPrefs(prefs, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  const next = normalizeGridPrefs(prefs);
  try { if (storage) storage.setItem(GRID_STORAGE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}

export function mountGrid(editor) {
  const sc = editor?.svgCanvas;
  if (!sc || window.__visterasGrid) return window.__visterasGrid || null;
  const NS = 'http://www.w3.org/2000/svg';
  let prefs = loadGridPrefs();
  let layer = null;
  let pattern = null;
  let rect = null;
  let prefsDlg = null;

  const unit = () => editor.configObj?.curConfig?.baseUnit || 'px';
  const cfg = () => editor.configObj?.curConfig || {};

  function syncEditorSnap() {
    const c = cfg();
    c.gridSnapping = !!prefs.snap;
    // snappingStep is in base units (jg converts when unit ≠ px).
    const stepDoc = prefs.every / Math.max(1, prefs.subdivisions);
    c.snappingStep = stepDoc;
    c.gridColor = prefs.color;
    c.showGrid = !!prefs.show;
    try { sc.setConfig?.(c); } catch { /* ignore */ }
  }

  function ensureLayer() {
    const root = sc.getSvgRoot?.() || document.getElementById('svgroot');
    const content = sc.getSvgContent?.() || document.getElementById('svgcontent');
    if (!root || !content) return null;
    layer = document.getElementById(GRID_LAYER_ID);
    if (!layer) {
      layer = document.createElementNS(NS, 'g');
      layer.setAttribute('id', GRID_LAYER_ID);
      layer.setAttribute('class', 'visteras-document-grid');
      layer.setAttribute('pointer-events', 'none');
      layer.style.pointerEvents = 'none';
      const defs = document.createElementNS(NS, 'defs');
      pattern = document.createElementNS(NS, 'pattern');
      pattern.setAttribute('id', 'visteras_grid_pattern');
      pattern.setAttribute('patternUnits', 'userSpaceOnUse');
      pattern.setAttribute('x', '0');
      pattern.setAttribute('y', '0');
      defs.append(pattern);
      rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('fill', 'url(#visteras_grid_pattern)');
      rect.setAttribute('pointer-events', 'none');
      layer.append(defs, rect);
    } else {
      pattern = layer.querySelector('#visteras_grid_pattern') || pattern;
      rect = layer.querySelector('rect') || rect;
    }
    // Grid in Back → before artwork; otherwise after (above art, under selectors).
    if (prefs.inBack) {
      if (content.previousSibling !== layer) root.insertBefore(layer, content);
    } else {
      const sel = document.getElementById('selectorParentGroup');
      if (sel && sel.parentNode === root) {
        if (sel.previousSibling !== layer) root.insertBefore(layer, sel);
      } else if (content.nextSibling !== layer) {
        content.after(layer);
      }
    }
    return layer;
  }

  function visibleUserRect() {
    const work = document.getElementById('workarea');
    const content = sc.getSvgContent?.();
    if (!work || !content?.getScreenCTM) {
      const r = sc.getResolution?.() || { w: 800, h: 600 };
      return { x: -2000, y: -2000, width: (r.w || 800) + 4000, height: (r.h || 600) + 4000 };
    }
    try {
      const ctm = content.getScreenCTM();
      if (!ctm) throw new Error('no ctm');
      const inv = ctm.inverse();
      const tl = new DOMPoint(work.scrollLeft, work.scrollTop).matrixTransform(inv);
      const br = new DOMPoint(work.scrollLeft + work.clientWidth, work.scrollTop + work.clientHeight).matrixTransform(inv);
      const x = Math.min(tl.x, br.x), y = Math.min(tl.y, br.y);
      const pad = 200;
      return { x: x - pad, y: y - pad, width: Math.abs(br.x - tl.x) + pad * 2, height: Math.abs(br.y - tl.y) + pad * 2 };
    } catch {
      return { x: -2000, y: -2000, width: 8000, height: 8000 };
    }
  }

  function redraw() {
    syncEditorSnap();
    updateMenus();
    if (!prefs.show) {
      if (layer) layer.style.display = 'none';
      return;
    }
    ensureLayer();
    if (!layer || !pattern || !rect) return;
    layer.style.display = '';
    const maj = majorStepPx(prefs, unit());
    const built = buildGridPatternMarkup({
      majorPx: maj,
      subdivisions: prefs.subdivisions,
      color: prefs.color,
      style: prefs.style,
    });
    pattern.setAttribute('width', String(built.width));
    pattern.setAttribute('height', String(built.height));
    pattern.innerHTML = built.body;
    // Origin-aligned: pattern x/y 0; place rect on major-grid multiples covering the view.
    const view = visibleUserRect();
    const x0 = Math.floor(view.x / maj) * maj;
    const y0 = Math.floor(view.y / maj) * maj;
    const x1 = Math.ceil((view.x + view.width) / maj) * maj;
    const y1 = Math.ceil((view.y + view.height) / maj) * maj;
    rect.setAttribute('x', String(x0));
    rect.setAttribute('y', String(y0));
    rect.setAttribute('width', String(Math.max(maj, x1 - x0)));
    rect.setAttribute('height', String(Math.max(maj, y1 - y0)));
  }

  function setPrefs(patch, { persist = true } = {}) {
    prefs = normalizeGridPrefs({ ...prefs, ...patch });
    if (persist) saveGridPrefs(prefs);
    redraw();
    return prefs;
  }

  function updateMenus() {
    const showItem = document.getElementById('action_toggle_grid');
    if (showItem) {
      const shortcut = showItem.querySelector('.menu_dropdown_shortcut');
      const text = prefs.show ? 'Hide Grid' : 'Show Grid';
      showItem.innerHTML = '';
      showItem.append(document.createTextNode(text + ' '));
      if (shortcut) showItem.append(shortcut);
      else {
        const s = document.createElement('span');
        s.className = 'menu_dropdown_shortcut';
        s.textContent = "⌘'";
        showItem.append(s);
      }
      showItem.setAttribute('aria-checked', String(!!prefs.show));
    }
    const snapItem = document.getElementById('action_snap_grid');
    if (snapItem) {
      snapItem.setAttribute('aria-checked', String(!!prefs.snap));
      let chk = snapItem.querySelector('.menu_check');
      if (!chk) { chk = document.createElement('span'); chk.className = 'menu_check'; snapItem.prepend(chk); }
      chk.textContent = prefs.snap ? '✓' : '';
    }
    const backItem = document.getElementById('action_grid_in_back');
    if (backItem) {
      backItem.setAttribute('aria-checked', String(!!prefs.inBack));
      let chk = backItem.querySelector('.menu_check');
      if (!chk) { chk = document.createElement('span'); chk.className = 'menu_check'; backItem.prepend(chk); }
      chk.textContent = prefs.inBack ? '✓' : '';
    }
  }

  function openPrefs() {
    if (prefsDlg?.isConnected) { prefsDlg.querySelector('[data-act="cancel"]')?.focus(); return; }
    const u = unit();
    const overlay = document.createElement('div');
    overlay.className = 'vui-overlay vgrid_overlay';
    overlay.innerHTML = `
      <div class="vui-dialog vgrid_dialog" role="dialog" aria-label="Guides & Grid">
        <div class="vui-dialog-header"><span class="vui-dialog-title">Guides &amp; Grid</span>
          <button type="button" class="vui-dialog-close" data-act="cancel" aria-label="Close">×</button></div>
        <div class="vui-dialog-body">
          <p class="vgrid_note">Preferences for the document grid (Illustrator ▸ Guides &amp; Grid). Units follow the document (${u}).</p>
          <label class="vgrid_field"><span>Color:</span>
            <input type="color" data-key="color" value="${prefs.color}"></label>
          <label class="vgrid_field"><span>Style:</span>
            <select data-key="style">
              <option value="lines"${prefs.style === 'lines' ? ' selected' : ''}>Lines</option>
              <option value="dots"${prefs.style === 'dots' ? ' selected' : ''}>Dots</option>
            </select></label>
          <label class="vgrid_field"><span>Gridline every:</span>
            <input type="number" data-key="every" min="0.001" step="any" value="${prefs.every}">
            <em>${u}</em></label>
          <label class="vgrid_field"><span>Subdivisions:</span>
            <input type="number" data-key="subdivisions" min="1" max="100" step="1" value="${prefs.subdivisions}"></label>
          <label class="vgrid_check"><input type="checkbox" data-key="inBack"${prefs.inBack ? ' checked' : ''}> Grid in Back</label>
          <label class="vgrid_check"><input type="checkbox" data-key="show"${prefs.show ? ' checked' : ''}> Show Grid</label>
          <label class="vgrid_check"><input type="checkbox" data-key="snap"${prefs.snap ? ' checked' : ''}> Snap to Grid</label>
        </div>
        <div class="vui-dialog-actions">
          <button type="button" class="vui-btn vui-btn-secondary" data-act="cancel">Cancel</button>
          <button type="button" class="vui-btn vui-btn-accent" data-act="ok">OK</button>
        </div>
      </div>`;
    document.body.append(overlay);
    prefsDlg = overlay;
    const read = () => {
      const g = (k) => overlay.querySelector(`[data-key="${k}"]`);
      return {
        color: g('color').value,
        style: g('style').value,
        every: Number(g('every').value),
        subdivisions: Number(g('subdivisions').value),
        inBack: g('inBack').checked,
        show: g('show').checked,
        snap: g('snap').checked,
      };
    };
    const close = () => { overlay.remove(); prefsDlg = null; };
    overlay.addEventListener('click', (e) => {
      const act = e.target.closest?.('[data-act]')?.dataset?.act;
      if (act === 'cancel' || e.target === overlay) close();
      if (act === 'ok') { setPrefs(read()); close(); }
    });
    // Live preview while editing
    overlay.addEventListener('input', () => setPrefs(read(), { persist: false }));
  }

  // Menus
  document.getElementById('action_toggle_grid')?.addEventListener('click', (e) => {
    e.preventDefault();
    setPrefs({ show: !prefs.show });
  });
  document.getElementById('action_snap_grid')?.addEventListener('click', (e) => {
    e.preventDefault();
    setPrefs({ snap: !prefs.snap });
  });
  document.getElementById('action_grid_in_back')?.addEventListener('click', (e) => {
    e.preventDefault();
    setPrefs({ inBack: !prefs.inBack });
  });
  document.getElementById('action_grid_prefs')?.addEventListener('click', (e) => {
    e.preventDefault();
    openPrefs();
  });

  // Preferences… → Guides & Grid section (and still allow the old dialog via Alt-click)
  document.getElementById('action_prefs')?.addEventListener('click', (e) => {
    if (e.altKey) return; // Alt+Preferences opens the legacy SVG-Edit dialog only
    e.preventDefault();
    e.stopImmediatePropagation();
    openPrefs();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (['input', 'textarea', 'select'].includes(document.activeElement?.tagName?.toLowerCase())) return;
    // ⌘' Show/Hide Grid · ⇧⌘' Snap to Grid (Quote key)
    if (e.code === 'Quote') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.shiftKey) setPrefs({ snap: !prefs.snap });
      else setPrefs({ show: !prefs.show });
    }
  }, true);

  // Redraw on zoom / pan / canvas updates
  const work = document.getElementById('workarea');
  work?.addEventListener('scroll', () => { if (prefs.show) redraw(); }, { passive: true });
  window.addEventListener('resize', () => { if (prefs.show) redraw(); });
  const call = sc.call;
  sc.call = function (event, ...args) {
    const result = call.call(this, event, ...args);
    if (prefs.show && (event === 'zoomed' || event === 'changed' || event === 'ext_changed' || event === 'sourcechanged')) redraw();
    return result;
  };
  const origUpdate = editor.updateCanvas?.bind(editor);
  if (origUpdate) {
    editor.updateCanvas = function (...args) {
      const r = origUpdate(...args);
      if (prefs.show) redraw();
      return r;
    };
  }

  // Style for prefs dialog (once)
  if (!document.getElementById('vgrid_prefs_style')) {
    const st = document.createElement('style');
    st.id = 'vgrid_prefs_style';
    st.textContent = `
      .vgrid_dialog { width: min(420px, 92vw); }
      .vgrid_field { display: flex; align-items: center; gap: 8px; margin: 8px 0; font-size: 12px; }
      .vgrid_field > span { min-width: 110px; color: #ccc; }
      .vgrid_field input[type="number"], .vgrid_field select { flex: 1; min-width: 0; }
      .vgrid_field em { color: #888; font-style: normal; min-width: 24px; }
      .vgrid_check { display: flex; align-items: center; gap: 8px; margin: 6px 0; font-size: 12px; }
      .vgrid_note { color: #999; font-size: 11px; margin: 0 0 10px; line-height: 1.35; }
      #visteras_document_grid { pointer-events: none !important; }
    `;
    document.head.append(st);
  }

  syncEditorSnap();
  redraw();

  const api = {
    getPrefs: () => ({ ...prefs }),
    setPrefs,
    redraw,
    openPrefs,
    majorStepPx: () => majorStepPx(prefs, unit()),
    minorStepPx: () => minorStepPx(prefs, unit()),
    snapValue: (v) => snapValue(v, minorStepPx(prefs, unit())),
  };
  window.__visterasGrid = api;
  return api;
}
