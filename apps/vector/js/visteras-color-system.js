/**
 * Visteras Vector — Color System
 *
 * Shared fill/stroke targeting, Color panel, Swatches panel, and a usable
 * spectrum picker modal. Replaces jGraduate as the primary UX while leaving
 * SVG-Edit color pickers in the DOM for internal sync.
 *
 * APIs: svgCanvas.getColor / setColor / getPaintOpacity / setPaintOpacity
 *       svgEditor.bottomPanel.updateColorpickers
 */

const STORAGE_SWATCHES = 'visteras-vector-swatches';
const STORAGE_RECENT = 'visteras-vector-recent-colors';
const MAX_RECENT = 12;
const ACCENT = '#fa7c1b';

const STARTER_SWATCHES = [
  { id: 's_black', name: 'Black', hex: '#000000' },
  { id: 's_white', name: 'White', hex: '#ffffff' },
  { id: 's_gray1', name: 'Gray 20%', hex: '#333333' },
  { id: 's_gray2', name: 'Gray 40%', hex: '#666666' },
  { id: 's_gray3', name: 'Gray 60%', hex: '#999999' },
  { id: 's_gray4', name: 'Gray 80%', hex: '#cccccc' },
  { id: 's_red', name: 'Red', hex: '#e74c3c' },
  { id: 's_orange', name: 'Vector Orange', hex: '#fa7c1b' },
  { id: 's_yellow', name: 'Yellow', hex: '#f1c40f' },
  { id: 's_green', name: 'Green', hex: '#2ecc71' },
  { id: 's_teal', name: 'Teal', hex: '#1abc9c' },
  { id: 's_blue', name: 'Blue', hex: '#3498db' },
  { id: 's_indigo', name: 'Indigo', hex: '#5b6ee1' },
  { id: 's_purple', name: 'Purple', hex: '#9b59b6' },
  { id: 's_pink', name: 'Pink', hex: '#e84393' },
  { id: 's_brown', name: 'Brown', hex: '#8d6e63' },
];

// ---------------------------------------------------------------------------
// Color math
// ---------------------------------------------------------------------------

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function normalizeHex(input) {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s || s === 'none' || s === 'transparent') return 'none';
  if (s.startsWith('url(') || s.startsWith('rgb')) return null;
  if (s[0] !== '#') s = `#${s}`;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) return null;
  return s.toLowerCase();
}

function hexToRgb(hex) {
  const h = normalizeHex(hex);
  if (!h || h === 'none') return null;
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

function rgbToHex(r, g, b) {
  const to = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function uid(prefix = 'sw') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function loadUserSwatches() {
  try {
    const raw = localStorage.getItem(STORAGE_SWATCHES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((s) => ({
        id: s.id || uid(),
        name: String(s.name || s.hex || 'Swatch'),
        hex: normalizeHex(s.hex),
      }))
      .filter((s) => s.hex && s.hex !== 'none');
  } catch {
    return [];
  }
}

function saveUserSwatches(list) {
  try {
    localStorage.setItem(STORAGE_SWATCHES, JSON.stringify(list));
  } catch { /* ignore */ }
}

function loadRecent() {
  try {
    const raw = localStorage.getItem(STORAGE_RECENT);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeHex).filter((h) => h && h !== 'none').slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function saveRecent(list) {
  try {
    localStorage.setItem(STORAGE_RECENT, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Shared color controller
// ---------------------------------------------------------------------------

function createColorController(svgEditor) {
  const state = {
    activeTarget: 'fill', // 'fill' | 'stroke'
    workingHex: '#cccccc',
    workingNone: false,
    opacity: 1,
    userSwatches: loadUserSwatches(),
    recent: loadRecent(),
    listeners: new Set(),
    suppressSync: false,
  };

  const api = {
    getState: () => state,
    getActiveTarget: () => state.activeTarget,
    getWorkingHex: () => (state.workingNone ? 'none' : state.workingHex),

    subscribe(fn) {
      state.listeners.add(fn);
      return () => state.listeners.delete(fn);
    },

    emit() {
      window.__visterasColorTarget = state.activeTarget;
      for (const fn of state.listeners) {
        try { fn(state); } catch { /* ignore */ }
      }
      window.dispatchEvent(new CustomEvent('visteras:color-changed', {
        detail: {
          target: state.activeTarget,
          color: state.workingNone ? 'none' : state.workingHex,
          opacity: state.opacity,
        },
      }));
    },

    setActiveTarget(target, { syncColor = true } = {}) {
      if (target !== 'fill' && target !== 'stroke') return;
      state.activeTarget = target;
      window.__visterasColorTarget = target;
      if (syncColor) api.syncFromCanvas();
      else api.emit();
    },

    toggleTarget() {
      api.setActiveTarget(state.activeTarget === 'fill' ? 'stroke' : 'fill');
    },

    setWorkingColor(hexOrNone, { apply = true, recordRecent = true, noUndo = false } = {}) {
      const sc = svgEditor.svgCanvas;
      if (!hexOrNone || hexOrNone === 'none' || hexOrNone === 'transparent') {
        state.workingNone = true;
        if (apply && sc) {
          state.suppressSync = true;
          sc.setColor(state.activeTarget, 'none', noUndo);
          if (!noUndo) svgEditor.bottomPanel?.updateColorpickers?.(true);
          state.suppressSync = false;
        }
        api.emit();
        window.__visterasUpdateSwatches?.();
        return;
      }
      const hex = normalizeHex(hexOrNone);
      if (!hex) return;
      state.workingNone = false;
      state.workingHex = hex;
      if (apply && sc) {
        state.suppressSync = true;
        sc.setColor(state.activeTarget, hex, noUndo);
        if (!noUndo) svgEditor.bottomPanel?.updateColorpickers?.(true);
        state.suppressSync = false;
      }
      if (recordRecent && apply && !noUndo) api.pushRecent(hex);
      api.emit();
      window.__visterasUpdateSwatches?.();
    },

    setOpacity(value, { apply = true, noUndo = false } = {}) {
      const sc = svgEditor.svgCanvas;
      const op = clamp(Number(value), 0, 1);
      state.opacity = op;
      if (apply && sc && typeof sc.setPaintOpacity === 'function') {
        state.suppressSync = true;
        sc.setPaintOpacity(state.activeTarget, op, noUndo);
        state.suppressSync = false;
      }
      api.emit();
    },

    syncFromCanvas() {
      if (state.suppressSync) return;
      const sc = svgEditor.svgCanvas;
      if (!sc) return;
      const raw = (typeof sc.getColor === 'function')
        ? sc.getColor(state.activeTarget)
        : null;
      if (!raw || raw === 'none' || raw === 'transparent') {
        state.workingNone = true;
      } else {
        const hex = normalizeHex(raw);
        if (hex) {
          state.workingNone = false;
          state.workingHex = hex;
        } else {
          // gradients / paints — keep previous solid working color
          state.workingNone = false;
        }
      }
      if (typeof sc.getPaintOpacity === 'function') {
        const op = sc.getPaintOpacity(state.activeTarget);
        if (typeof op === 'number' && !Number.isNaN(op)) state.opacity = op;
      }
      api.emit();
    },

    pushRecent(hex) {
      const n = normalizeHex(hex);
      if (!n || n === 'none') return;
      state.recent = [n, ...state.recent.filter((c) => c !== n)].slice(0, MAX_RECENT);
      saveRecent(state.recent);
    },

    addUserSwatch(hex, name) {
      const n = normalizeHex(hex);
      if (!n || n === 'none') return null;
      const sw = { id: uid(), name: name || n.toUpperCase(), hex: n };
      state.userSwatches = [...state.userSwatches, sw];
      saveUserSwatches(state.userSwatches);
      api.emit();
      return sw;
    },

    renameUserSwatch(id, name) {
      const sw = state.userSwatches.find((s) => s.id === id);
      if (!sw) return;
      sw.name = String(name || sw.hex).trim() || sw.hex;
      saveUserSwatches(state.userSwatches);
      api.emit();
    },

    deleteUserSwatch(id) {
      state.userSwatches = state.userSwatches.filter((s) => s.id !== id);
      saveUserSwatches(state.userSwatches);
      api.emit();
    },

    swapFillStroke() {
      const sc = svgEditor.svgCanvas;
      if (!sc) return;
      const curFill = sc.getColor('fill') || '#cccccc';
      const curStroke = sc.getColor('stroke') || '#000000';
      state.suppressSync = true;
      sc.setColor('fill', curStroke);
      sc.setColor('stroke', curFill);
      svgEditor.bottomPanel?.updateColorpickers?.(true);
      state.suppressSync = false;
      api.syncFromCanvas();
      window.__visterasUpdateSwatches?.();
    },

    applyDefaults() {
      const sc = svgEditor.svgCanvas;
      if (!sc) return;
      state.suppressSync = true;
      sc.setColor('fill', '#cccccc');
      sc.setColor('stroke', '#000000');
      if (typeof sc.setStrokeWidth === 'function') sc.setStrokeWidth(1);
      const strokeWidthInput = document.getElementById('stroke_width');
      if (strokeWidthInput) strokeWidthInput.value = '1';
      svgEditor.bottomPanel?.updateColorpickers?.(true);
      state.suppressSync = false;
      api.setActiveTarget('fill', { syncColor: true });
      window.__visterasUpdateSwatches?.();
    },

    openPicker(target) {
      if (target) api.setActiveTarget(target, { syncColor: true });
      window.__visterasOpenColorPicker?.(state.activeTarget);
    },
  };

  window.__visterasColorTarget = state.activeTarget;
  window.__visterasColorSystem = api;
  return api;
}

// ---------------------------------------------------------------------------
// Spectrum widget (SV square + hue strip)
// ---------------------------------------------------------------------------

function createSpectrumWidget({ size = 160, hueHeight = 14, onChange, onCommit } = {}) {
  const root = document.createElement('div');
  root.className = 'vcs-spectrum';

  const svWrap = document.createElement('div');
  svWrap.className = 'vcs-sv-wrap';
  const svCanvas = document.createElement('canvas');
  svCanvas.className = 'vcs-sv-canvas';
  svCanvas.width = size;
  svCanvas.height = size;
  const svCursor = document.createElement('div');
  svCursor.className = 'vcs-sv-cursor';
  svWrap.append(svCanvas, svCursor);

  const hueWrap = document.createElement('div');
  hueWrap.className = 'vcs-hue-wrap';
  const hueCanvas = document.createElement('canvas');
  hueCanvas.className = 'vcs-hue-canvas';
  hueCanvas.width = size;
  hueCanvas.height = hueHeight;
  const hueCursor = document.createElement('div');
  hueCursor.className = 'vcs-hue-cursor';
  hueWrap.append(hueCanvas, hueCursor);

  root.append(svWrap, hueWrap);

  let h = 30;
  let s = 80;
  let l = 55;
  let dragging = null;

  function drawHue() {
    const ctx = hueCanvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, size, 0);
    for (let i = 0; i <= 6; i++) {
      const rgb = hslToRgb(i * 60, 100, 50);
      grad.addColorStop(i / 6, `rgb(${rgb.r},${rgb.g},${rgb.b})`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, hueHeight);
  }

  function drawSV() {
    const ctx = svCanvas.getContext('2d');
    // Base hue at full sat/light mid via HSL→ but classic SV: use HSL square approximation
    // Horizontal: saturation 0→100 at L=50 against white/hue, then vertical black overlay.
    const hueRgb = hslToRgb(h, 100, 50);
    // white → hue
    const gradX = ctx.createLinearGradient(0, 0, size, 0);
    gradX.addColorStop(0, '#ffffff');
    gradX.addColorStop(1, `rgb(${hueRgb.r},${hueRgb.g},${hueRgb.b})`);
    ctx.fillStyle = gradX;
    ctx.fillRect(0, 0, size, size);
    // transparent → black
    const gradY = ctx.createLinearGradient(0, 0, 0, size);
    gradY.addColorStop(0, 'rgba(0,0,0,0)');
    gradY.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = gradY;
    ctx.fillRect(0, 0, size, size);
  }

  // Convert HSV-like cursor (x=sat, y=value) to HSL for fields
  function svToHsl(sat, val) {
    // sat,val in 0..100 (val = brightness)
    const sHsv = sat / 100;
    const v = val / 100;
    const lHsl = v * (1 - sHsv / 2);
    let sHsl = 0;
    if (lHsl > 0 && lHsl < 1) {
      sHsl = (v - lHsl) / Math.min(lHsl, 1 - lHsl);
    }
    return { h, s: sHsl * 100, l: lHsl * 100 };
  }

  function hslToSv(hh, ss, ll) {
    const sHsl = ss / 100;
    const lHsl = ll / 100;
    const v = lHsl + sHsl * Math.min(lHsl, 1 - lHsl);
    const sHsv = v === 0 ? 0 : 2 * (1 - lHsl / v);
    return { s: clamp(sHsv * 100, 0, 100), v: clamp(v * 100, 0, 100) };
  }

  function updateCursors() {
    const sv = hslToSv(h, s, l);
    svCursor.style.left = `${(sv.s / 100) * size}px`;
    svCursor.style.top = `${(1 - sv.v / 100) * size}px`;
    hueCursor.style.left = `${(h / 360) * size}px`;
  }

  function emit(commit) {
    const rgb = hslToRgb(h, s, l);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    onChange?.({ hex, rgb, hsl: { h, s, l } });
    if (commit) onCommit?.({ hex, rgb, hsl: { h, s, l } });
  }

  function setFromHex(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return;
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    h = hsl.h; s = hsl.s; l = hsl.l;
    drawSV();
    updateCursors();
  }

  function pointerSV(clientX, clientY, commit) {
    const rect = svCanvas.getBoundingClientRect();
    const x = clamp((clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((clientY - rect.top) / rect.height, 0, 1);
    const hsl = svToHsl(x * 100, (1 - y) * 100);
    s = hsl.s; l = hsl.l;
    updateCursors();
    emit(commit);
  }

  function pointerHue(clientX, commit) {
    const rect = hueCanvas.getBoundingClientRect();
    const x = clamp((clientX - rect.left) / rect.width, 0, 1);
    h = x * 360;
    drawSV();
    updateCursors();
    emit(commit);
  }

  function onPointerDown(e, kind) {
    e.preventDefault();
    dragging = kind;
    const pt = e.touches ? e.touches[0] : e;
    if (kind === 'sv') pointerSV(pt.clientX, pt.clientY, false);
    else pointerHue(pt.clientX, false);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const pt = e.touches ? e.touches[0] : e;
    if (dragging === 'sv') pointerSV(pt.clientX, pt.clientY, false);
    else pointerHue(pt.clientX, false);
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = null;
    emit(true);
  }

  svCanvas.addEventListener('mousedown', (e) => onPointerDown(e, 'sv'));
  hueCanvas.addEventListener('mousedown', (e) => onPointerDown(e, 'hue'));
  svCanvas.addEventListener('touchstart', (e) => onPointerDown(e, 'sv'), { passive: false });
  hueCanvas.addEventListener('touchstart', (e) => onPointerDown(e, 'hue'), { passive: false });
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('touchmove', onPointerMove, { passive: false });
  window.addEventListener('mouseup', onPointerUp);
  window.addEventListener('touchend', onPointerUp);

  drawHue();
  drawSV();
  updateCursors();

  return {
    el: root,
    setFromHex,
    getHsl: () => ({ h, s, l }),
    destroy() {
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchend', onPointerUp);
    },
  };
}

// ---------------------------------------------------------------------------
// Toolbar fill/stroke swatches (extracted from type-on-path)
// ---------------------------------------------------------------------------

function mountToolbarColorSwatches(svgEditor, ctrl) {
  const toolsLeft = document.getElementById('tools_left');
  if (!toolsLeft) return false;

  if (!document.getElementById('tools_left_swatches')) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="tool_sep" id="tools_swatch_sep"></div>
      <div id="tools_left_swatches" class="tools-left-swatches" title="Fill & Stroke (X to toggle focus, Shift+X to swap, D for default, / for none)">
        <button id="swatch_swap_btn" class="swatch-swap-btn" title="Swap Fill and Stroke (Shift+X)" type="button">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
            <path d="M 3.5,3 A 5.5,5.5 0 0,1 9,8.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            <polygon points="3.5,0.8 0.5,3 3.5,5.2"/>
            <polygon points="6.8,8.5 9,11.5 11.2,8.5"/>
          </svg>
        </button>
        <div class="swatches-cluster">
          <div id="swatch_fill_box" class="swatch-box swatch-fill active" title="Fill Color (Click to focus / double-click for picker)">
            <div id="swatch_fill_indicator" class="swatch-color-indicator"></div>
          </div>
          <div id="swatch_stroke_box" class="swatch-box swatch-stroke" title="Stroke Color (Click to focus / double-click for picker)">
            <div id="swatch_stroke_indicator" class="swatch-color-indicator">
              <div class="swatch-stroke-hole"></div>
            </div>
          </div>
        </div>
        <button id="swatch_default_btn" class="swatch-default-btn" title="Default Fill and Stroke (D)" type="button">
          <svg viewBox="0 0 16 16" width="12" height="12">
            <rect x="1" y="1" width="8" height="8" fill="#cccccc" stroke="#111111" stroke-width="1"/>
            <rect x="6" y="6" width="8" height="8" fill="#2b2b36" stroke="#000000" stroke-width="1.8"/>
          </svg>
        </button>
      </div>
    `;
    while (wrapper.firstChild) toolsLeft.appendChild(wrapper.firstChild);
  }

  if (toolsLeft.dataset.vcsToolbarBound === '1') {
    // Still refresh paint indicators
    updateToolbarFromCanvas();
    return true;
  }
  toolsLeft.dataset.vcsToolbarBound = '1';

  const updateSwatches = () => {
    updateToolbarFromCanvas();
  };

  function updateToolbarFromCanvas() {
    const sc = svgEditor.svgCanvas;
    if (!sc) return;
    let fill = (typeof sc.getColor === 'function') ? (sc.getColor('fill') || '#cccccc') : '#cccccc';
    let stroke = (typeof sc.getColor === 'function') ? (sc.getColor('stroke') || '#000000') : '#000000';
    const fillInd = document.getElementById('swatch_fill_indicator');
    const strokeInd = document.getElementById('swatch_stroke_indicator');
    const fillBox = document.getElementById('swatch_fill_box');
    const strokeBox = document.getElementById('swatch_stroke_box');

    if (fillInd) {
      if (!fill || fill === 'none' || fill === 'transparent') {
        fillInd.classList.add('is-none');
        fillInd.style.backgroundColor = '';
      } else {
        fillInd.classList.remove('is-none');
        fillInd.style.backgroundColor = fill;
      }
    }
    if (strokeInd) {
      if (!stroke || stroke === 'none' || stroke === 'transparent') {
        strokeInd.classList.add('is-none');
        strokeInd.style.backgroundColor = '';
      } else {
        strokeInd.classList.remove('is-none');
        strokeInd.style.backgroundColor = stroke;
      }
    }
    const active = ctrl.getActiveTarget();
    if (fillBox && strokeBox) {
      fillBox.classList.toggle('active', active === 'fill');
      strokeBox.classList.toggle('active', active === 'stroke');
    }
  }

  const fillBox = document.getElementById('swatch_fill_box');
  const strokeBox = document.getElementById('swatch_stroke_box');
  const swapBtn = document.getElementById('swatch_swap_btn');
  const defaultBtn = document.getElementById('swatch_default_btn');

  fillBox?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (ctrl.getActiveTarget() === 'fill') ctrl.openPicker('fill');
    else ctrl.setActiveTarget('fill');
  });
  fillBox?.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    ctrl.openPicker('fill');
  });
  strokeBox?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (ctrl.getActiveTarget() === 'stroke') ctrl.openPicker('stroke');
    else ctrl.setActiveTarget('stroke');
  });
  strokeBox?.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    ctrl.openPicker('stroke');
  });
  swapBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    ctrl.swapFillStroke();
  });
  defaultBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    ctrl.applyDefaults();
  });

  document.addEventListener('keydown', (e) => {
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.nodeName)) return;
    if (e.target?.isContentEditable) return;
    if (e.target?.shadowRoot?.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.shadowRoot.activeElement.nodeName)) return;
    if (window.__visterasIsTypingDirectly) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.getElementById('vcs_picker_modal')?.classList.contains('open')) return;

    if (e.key === 'x' || e.key === 'X') {
      if (e.shiftKey) ctrl.swapFillStroke();
      else ctrl.toggleTarget();
      e.preventDefault();
    } else if ((e.key === 'd' || e.key === 'D') && !e.shiftKey) {
      ctrl.applyDefaults();
      e.preventDefault();
    } else if (e.key === '/') {
      ctrl.setWorkingColor('none');
      e.preventDefault();
    }
  });

  const sc = svgEditor.svgCanvas;
  if (sc && typeof sc.bind === 'function') {
    sc.bind('selectedChanged', () => { ctrl.syncFromCanvas(); updateSwatches(); });
    sc.bind('elementChanged', () => { ctrl.syncFromCanvas(); updateSwatches(); });
    sc.bind('changed', () => { ctrl.syncFromCanvas(); updateSwatches(); });
    sc.bind('transition', updateSwatches);
  }
  document.getElementById('fill_color')?.addEventListener('change', () => { ctrl.syncFromCanvas(); updateSwatches(); });
  document.getElementById('stroke_color')?.addEventListener('change', () => { ctrl.syncFromCanvas(); updateSwatches(); });
  document.getElementById('palette')?.addEventListener('change', () => { ctrl.syncFromCanvas(); updateSwatches(); });

  window.__visterasUpdateSwatches = updateSwatches;
  ctrl.subscribe(() => updateSwatches());
  updateSwatches();
  setTimeout(updateSwatches, 200);
  setTimeout(updateSwatches, 800);
  return true;
}

// ---------------------------------------------------------------------------
// Side panels: Color + Swatches
// ---------------------------------------------------------------------------

function makeCollapsibleBlock(id, title) {
  const block = document.createElement('div');
  block.id = id;
  block.className = 'sidebar_block vcs-block';
  block.innerHTML = `
    <div class="sidebar_block_header vcs-block-header" title="Toggle ${escapeHtml(title)} panel">
      <span class="sidebar_block_title">${escapeHtml(title)}</span>
      <span class="sidebar_block_arrow"></span>
    </div>
    <div class="sidebar_block_content vcs-block-content"></div>
  `;
  const header = block.querySelector('.vcs-block-header');
  const content = block.querySelector('.vcs-block-content');
  header.addEventListener('click', () => {
    block.classList.toggle('collapsed');
  });
  return { block, content, header };
}

function mountColorPanel(ctrl, svgEditor) {
  if (document.getElementById('vcs_color_panel')) return document.getElementById('vcs_color_panel');

  const sidepanelContent = document.getElementById('sidepanel_content');
  const layerPanel = document.getElementById('layerpanel');
  const propPanel = document.getElementById('properties_panel');
  if (!sidepanelContent) return null;

  const { block, content } = makeCollapsibleBlock('vcs_color_panel', 'Color');

  content.innerHTML = `
    <div class="vcs-target-row" role="group" aria-label="Paint target">
      <button type="button" class="vcs-target-btn" data-target="fill" id="vcs_target_fill">Fill</button>
      <button type="button" class="vcs-target-btn" data-target="stroke" id="vcs_target_stroke">Stroke</button>
    </div>
    <div class="vcs-spectrum-slot" id="vcs_color_spectrum_slot"></div>
    <div class="vcs-preview-row">
      <div class="vcs-preview" id="vcs_color_preview" title="Current color"></div>
      <button type="button" class="vcs-btn-ghost" id="vcs_open_picker_btn" title="Open large color picker">⋯</button>
      <button type="button" class="vcs-btn-ghost" id="vcs_none_btn" title="No color (/)">⌀</button>
    </div>
    <div class="vcs-fields">
      <label class="vcs-field"><span>Hex</span><input id="vcs_hex" type="text" spellcheck="false" maxlength="7" /></label>
      <div class="vcs-field-row">
        <label class="vcs-field"><span>R</span><input id="vcs_r" type="number" min="0" max="255" /></label>
        <label class="vcs-field"><span>G</span><input id="vcs_g" type="number" min="0" max="255" /></label>
        <label class="vcs-field"><span>B</span><input id="vcs_b" type="number" min="0" max="255" /></label>
      </div>
      <div class="vcs-field-row">
        <label class="vcs-field"><span>H</span><input id="vcs_h" type="number" min="0" max="360" /></label>
        <label class="vcs-field"><span>S</span><input id="vcs_s" type="number" min="0" max="100" /></label>
        <label class="vcs-field"><span>L</span><input id="vcs_l" type="number" min="0" max="100" /></label>
      </div>
      <label class="vcs-field vcs-opacity-field">
        <span>Opacity</span>
        <input id="vcs_opacity" type="range" min="0" max="100" value="100" />
        <span class="vcs-opacity-val" id="vcs_opacity_val">100%</span>
      </label>
    </div>
  `;

  // Insert after properties, before layers (or at end of sidepanel)
  if (propPanel && propPanel.parentNode === sidepanelContent) {
    if (layerPanel && layerPanel.parentNode === sidepanelContent) {
      sidepanelContent.insertBefore(block, layerPanel);
    } else {
      propPanel.after(block);
    }
  } else if (layerPanel && layerPanel.parentNode === sidepanelContent) {
    sidepanelContent.insertBefore(block, layerPanel);
  } else {
    sidepanelContent.appendChild(block);
  }

  let applying = false;
  const spectrum = createSpectrumWidget({
    size: 200,
    hueHeight: 14,
    onChange: ({ hex }) => {
      if (applying) return;
      applying = true;
      ctrl.setWorkingColor(hex, { apply: true, recordRecent: false, noUndo: true });
      applying = false;
    },
    onCommit: ({ hex }) => {
      ctrl.setWorkingColor(hex, { apply: true, recordRecent: true, noUndo: false });
    },
  });
  // Scale spectrum to panel width via CSS; canvas stays 200 for quality
  content.querySelector('#vcs_color_spectrum_slot').appendChild(spectrum.el);

  const hexInput = content.querySelector('#vcs_hex');
  const rInput = content.querySelector('#vcs_r');
  const gInput = content.querySelector('#vcs_g');
  const bInput = content.querySelector('#vcs_b');
  const hInput = content.querySelector('#vcs_h');
  const sInput = content.querySelector('#vcs_s');
  const lInput = content.querySelector('#vcs_l');
  const opInput = content.querySelector('#vcs_opacity');
  const opVal = content.querySelector('#vcs_opacity_val');
  const preview = content.querySelector('#vcs_color_preview');
  const fillBtn = content.querySelector('#vcs_target_fill');
  const strokeBtn = content.querySelector('#vcs_target_stroke');

  function refreshFields(state) {
    applying = true;
    const active = state.activeTarget;
    fillBtn.classList.toggle('active', active === 'fill');
    strokeBtn.classList.toggle('active', active === 'stroke');
    block.dataset.target = active;

    if (state.workingNone) {
      preview.classList.add('is-none');
      preview.style.backgroundColor = '';
      hexInput.value = 'none';
      rInput.value = '';
      gInput.value = '';
      bInput.value = '';
      hInput.value = '';
      sInput.value = '';
      lInput.value = '';
    } else {
      preview.classList.remove('is-none');
      preview.style.backgroundColor = state.workingHex;
      hexInput.value = state.workingHex.toUpperCase();
      const rgb = hexToRgb(state.workingHex);
      if (rgb) {
        rInput.value = rgb.r;
        gInput.value = rgb.g;
        bInput.value = rgb.b;
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        hInput.value = Math.round(hsl.h);
        sInput.value = Math.round(hsl.s);
        lInput.value = Math.round(hsl.l);
        spectrum.setFromHex(state.workingHex);
      }
    }
    const pct = Math.round((state.opacity ?? 1) * 100);
    opInput.value = String(pct);
    opVal.textContent = `${pct}%`;
    applying = false;
  }

  fillBtn.addEventListener('click', () => ctrl.setActiveTarget('fill'));
  strokeBtn.addEventListener('click', () => ctrl.setActiveTarget('stroke'));
  content.querySelector('#vcs_open_picker_btn').addEventListener('click', () => ctrl.openPicker());
  content.querySelector('#vcs_none_btn').addEventListener('click', () => ctrl.setWorkingColor('none'));

  hexInput.addEventListener('change', () => {
    if (applying) return;
    const v = hexInput.value.trim();
    if (v.toLowerCase() === 'none') ctrl.setWorkingColor('none');
    else {
      const hex = normalizeHex(v);
      if (hex) ctrl.setWorkingColor(hex);
      else refreshFields(ctrl.getState());
    }
  });
  hexInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') hexInput.dispatchEvent(new Event('change'));
  });

  const applyRgb = (noUndo) => {
    if (applying) return;
    const hex = rgbToHex(+rInput.value || 0, +gInput.value || 0, +bInput.value || 0);
    ctrl.setWorkingColor(hex, { noUndo: !!noUndo, recordRecent: !noUndo });
  };
  const applyHsl = (noUndo) => {
    if (applying) return;
    const rgb = hslToRgb(+hInput.value || 0, +sInput.value || 0, +lInput.value || 0);
    ctrl.setWorkingColor(rgbToHex(rgb.r, rgb.g, rgb.b), { noUndo: !!noUndo, recordRecent: !noUndo });
  };
  for (const el of [rInput, gInput, bInput]) {
    el.addEventListener('input', () => applyRgb(true));
    el.addEventListener('change', () => applyRgb(false));
  }
  for (const el of [hInput, sInput, lInput]) {
    el.addEventListener('input', () => applyHsl(true));
    el.addEventListener('change', () => applyHsl(false));
  }
  opInput.addEventListener('input', () => {
    if (applying) return;
    ctrl.setOpacity((+opInput.value || 0) / 100, { apply: true, noUndo: true });
  });
  opInput.addEventListener('change', () => {
    if (applying) return;
    ctrl.setOpacity((+opInput.value || 0) / 100, { apply: true, noUndo: false });
  });

  ctrl.subscribe(refreshFields);
  refreshFields(ctrl.getState());
  return block;
}

function mountSwatchesPanel(ctrl) {
  if (document.getElementById('vcs_swatches_panel')) return document.getElementById('vcs_swatches_panel');

  const colorPanel = document.getElementById('vcs_color_panel');
  const sidepanelContent = document.getElementById('sidepanel_content');
  const layerPanel = document.getElementById('layerpanel');
  if (!sidepanelContent) return null;

  const { block, content } = makeCollapsibleBlock('vcs_swatches_panel', 'Swatches');
  content.innerHTML = `
    <div class="vcs-swatch-toolbar">
      <button type="button" class="vcs-btn" id="vcs_add_swatch" title="Add current color to swatches">+</button>
      <span class="vcs-swatch-hint">Click applies to active Fill/Stroke</span>
    </div>
    <div class="vcs-section-label">Recent</div>
    <div class="vcs-swatch-grid" id="vcs_recent_grid"></div>
    <div class="vcs-section-label">Library</div>
    <div class="vcs-swatch-grid" id="vcs_library_grid"></div>
    <div class="vcs-section-label">User</div>
    <div class="vcs-swatch-grid" id="vcs_user_grid"></div>
  `;

  if (colorPanel && colorPanel.parentNode === sidepanelContent) {
    colorPanel.after(block);
  } else if (layerPanel && layerPanel.parentNode === sidepanelContent) {
    sidepanelContent.insertBefore(block, layerPanel);
  } else {
    sidepanelContent.appendChild(block);
  }

  const recentGrid = content.querySelector('#vcs_recent_grid');
  const libraryGrid = content.querySelector('#vcs_library_grid');
  const userGrid = content.querySelector('#vcs_user_grid');

  function swatchEl(hex, name, { userId = null } = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vcs-swatch';
    btn.style.backgroundColor = hex;
    btn.title = userId
      ? `${name}\n${hex.toUpperCase()}\nClick: apply · Right-click: rename · Shift+click: delete`
      : `${name}\n${hex.toUpperCase()}`;
    btn.dataset.hex = hex;
    if (userId) btn.dataset.userId = userId;
    if (hex.toLowerCase() === '#ffffff') btn.classList.add('is-light');
    btn.addEventListener('click', (e) => {
      if (e.shiftKey && userId) {
        ctrl.deleteUserSwatch(userId);
        return;
      }
      ctrl.setWorkingColor(hex);
    });
    if (userId) {
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const next = window.prompt('Rename swatch', name);
        if (next != null && next.trim()) ctrl.renameUserSwatch(userId, next.trim());
      });
    }
    return btn;
  }

  function render(state) {
    recentGrid.innerHTML = '';
    const recent = state.recent.length ? state.recent : STARTER_SWATCHES.slice(0, 8).map((s) => s.hex);
    for (const hex of recent) {
      recentGrid.appendChild(swatchEl(hex, hex.toUpperCase()));
    }

    libraryGrid.innerHTML = '';
    for (const s of STARTER_SWATCHES) {
      libraryGrid.appendChild(swatchEl(s.hex, s.name));
    }

    userGrid.innerHTML = '';
    if (!state.userSwatches.length) {
      const empty = document.createElement('div');
      empty.className = 'vcs-empty';
      empty.textContent = 'No saved swatches yet';
      userGrid.appendChild(empty);
    } else {
      for (const s of state.userSwatches) {
        userGrid.appendChild(swatchEl(s.hex, s.name, { userId: s.id }));
      }
    }

    // Highlight active color
    const active = state.workingNone ? null : state.workingHex?.toLowerCase();
    content.querySelectorAll('.vcs-swatch').forEach((el) => {
      el.classList.toggle('active', active && el.dataset.hex?.toLowerCase() === active);
    });
  }

  content.querySelector('#vcs_add_swatch').addEventListener('click', () => {
    const st = ctrl.getState();
    if (st.workingNone) return;
    const name = window.prompt('Swatch name', st.workingHex.toUpperCase());
    if (name == null) return;
    ctrl.addUserSwatch(st.workingHex, name.trim() || st.workingHex.toUpperCase());
  });

  ctrl.subscribe(render);
  render(ctrl.getState());
  return block;
}

// ---------------------------------------------------------------------------
// Picker modal
// ---------------------------------------------------------------------------

function mountPickerModal(ctrl) {
  if (document.getElementById('vcs_picker_modal')) return;

  const overlay = document.createElement('div');
  overlay.id = 'vcs_picker_overlay';
  overlay.className = 'vcs-picker-overlay';

  const modal = document.createElement('div');
  modal.id = 'vcs_picker_modal';
  modal.className = 'vcs-picker-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="vcs-picker-header">
      <span class="vcs-picker-title">Color Picker</span>
      <span class="vcs-picker-target-label" id="vcs_picker_target_label">Fill</span>
      <button type="button" class="vcs-picker-close" id="vcs_picker_close" title="Close">×</button>
    </div>
    <div class="vcs-picker-body">
      <div class="vcs-picker-spectrum" id="vcs_picker_spectrum_slot"></div>
      <div class="vcs-picker-side">
        <div class="vcs-target-row">
          <button type="button" class="vcs-target-btn" data-target="fill" id="vcs_picker_fill">Fill</button>
          <button type="button" class="vcs-target-btn" data-target="stroke" id="vcs_picker_stroke">Stroke</button>
        </div>
        <div class="vcs-preview-row">
          <div class="vcs-preview vcs-preview-lg" id="vcs_picker_preview"></div>
          <button type="button" class="vcs-btn-ghost" id="vcs_picker_none" title="No color">⌀ None</button>
        </div>
        <div class="vcs-fields">
          <label class="vcs-field"><span>Hex</span><input id="vcs_picker_hex" type="text" spellcheck="false" maxlength="7" /></label>
          <div class="vcs-field-row">
            <label class="vcs-field"><span>R</span><input id="vcs_picker_r" type="number" min="0" max="255" /></label>
            <label class="vcs-field"><span>G</span><input id="vcs_picker_g" type="number" min="0" max="255" /></label>
            <label class="vcs-field"><span>B</span><input id="vcs_picker_b" type="number" min="0" max="255" /></label>
          </div>
          <div class="vcs-field-row">
            <label class="vcs-field"><span>H</span><input id="vcs_picker_h" type="number" min="0" max="360" /></label>
            <label class="vcs-field"><span>S</span><input id="vcs_picker_s" type="number" min="0" max="100" /></label>
            <label class="vcs-field"><span>L</span><input id="vcs_picker_l" type="number" min="0" max="100" /></label>
          </div>
        </div>
        <div class="vcs-picker-actions">
          <button type="button" class="vcs-btn" id="vcs_picker_apply">OK</button>
          <button type="button" class="vcs-btn vcs-btn-secondary" id="vcs_picker_cancel">Cancel</button>
        </div>
      </div>
    </div>
  `;

  document.body.append(overlay, modal);

  let draftHex = '#cccccc';
  let draftNone = false;
  let openSnapshot = { hex: '#cccccc', none: false, target: 'fill' };
  let applying = false;
  let liveApply = true; // live apply while dragging; Cancel restores snapshot

  const spectrum = createSpectrumWidget({
    size: 260,
    hueHeight: 16,
    onChange: ({ hex }) => {
      draftNone = false;
      draftHex = hex;
      refreshDraft();
      if (liveApply) ctrl.setWorkingColor(hex, { apply: true, recordRecent: false, noUndo: true });
    },
    onCommit: ({ hex }) => {
      draftHex = hex;
      if (liveApply) {
        ctrl.setWorkingColor(hex, { apply: true, recordRecent: true, noUndo: false });
      }
    },
  });
  modal.querySelector('#vcs_picker_spectrum_slot').appendChild(spectrum.el);

  const hexInput = modal.querySelector('#vcs_picker_hex');
  const rInput = modal.querySelector('#vcs_picker_r');
  const gInput = modal.querySelector('#vcs_picker_g');
  const bInput = modal.querySelector('#vcs_picker_b');
  const hInput = modal.querySelector('#vcs_picker_h');
  const sInput = modal.querySelector('#vcs_picker_s');
  const lInput = modal.querySelector('#vcs_picker_l');
  const preview = modal.querySelector('#vcs_picker_preview');
  const targetLabel = modal.querySelector('#vcs_picker_target_label');
  const fillBtn = modal.querySelector('#vcs_picker_fill');
  const strokeBtn = modal.querySelector('#vcs_picker_stroke');

  function refreshDraft() {
    applying = true;
    const target = ctrl.getActiveTarget();
    fillBtn.classList.toggle('active', target === 'fill');
    strokeBtn.classList.toggle('active', target === 'stroke');
    targetLabel.textContent = target === 'fill' ? 'Fill' : 'Stroke';
    if (draftNone) {
      preview.classList.add('is-none');
      preview.style.backgroundColor = '';
      hexInput.value = 'none';
      rInput.value = gInput.value = bInput.value = '';
      hInput.value = sInput.value = lInput.value = '';
    } else {
      preview.classList.remove('is-none');
      preview.style.backgroundColor = draftHex;
      hexInput.value = draftHex.toUpperCase();
      const rgb = hexToRgb(draftHex);
      if (rgb) {
        rInput.value = rgb.r; gInput.value = rgb.g; bInput.value = rgb.b;
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        hInput.value = Math.round(hsl.h);
        sInput.value = Math.round(hsl.s);
        lInput.value = Math.round(hsl.l);
        spectrum.setFromHex(draftHex);
      }
    }
    applying = false;
  }

  function close() {
    overlay.classList.remove('open');
    modal.classList.remove('open');
  }

  function open(target) {
    if (target) ctrl.setActiveTarget(target, { syncColor: true });
    const st = ctrl.getState();
    openSnapshot = {
      hex: st.workingHex,
      none: st.workingNone,
      target: st.activeTarget,
    };
    draftHex = st.workingHex;
    draftNone = st.workingNone;
    refreshDraft();
    overlay.classList.add('open');
    modal.classList.add('open');
    hexInput.focus();
    hexInput.select();
  }

  function cancel() {
    // Restore snapshot
    ctrl.setActiveTarget(openSnapshot.target, { syncColor: false });
    if (openSnapshot.none) ctrl.setWorkingColor('none', { recordRecent: false });
    else ctrl.setWorkingColor(openSnapshot.hex, { recordRecent: false });
    close();
  }

  function applyAndClose() {
    if (draftNone) ctrl.setWorkingColor('none');
    else ctrl.setWorkingColor(draftHex, { recordRecent: true });
    close();
  }

  fillBtn.addEventListener('click', () => {
    ctrl.setActiveTarget('fill');
    const st = ctrl.getState();
    draftHex = st.workingHex;
    draftNone = st.workingNone;
    refreshDraft();
  });
  strokeBtn.addEventListener('click', () => {
    ctrl.setActiveTarget('stroke');
    const st = ctrl.getState();
    draftHex = st.workingHex;
    draftNone = st.workingNone;
    refreshDraft();
  });

  modal.querySelector('#vcs_picker_none').addEventListener('click', () => {
    draftNone = true;
    refreshDraft();
    if (liveApply) ctrl.setWorkingColor('none');
  });
  modal.querySelector('#vcs_picker_close').addEventListener('click', applyAndClose);
  modal.querySelector('#vcs_picker_apply').addEventListener('click', applyAndClose);
  modal.querySelector('#vcs_picker_cancel').addEventListener('click', cancel);
  overlay.addEventListener('click', cancel);

  hexInput.addEventListener('change', () => {
    if (applying) return;
    const v = hexInput.value.trim();
    if (v.toLowerCase() === 'none') {
      draftNone = true;
    } else {
      const hex = normalizeHex(v);
      if (!hex) { refreshDraft(); return; }
      draftNone = false;
      draftHex = hex;
    }
    refreshDraft();
    if (liveApply) ctrl.setWorkingColor(draftNone ? 'none' : draftHex, { recordRecent: false });
  });

  const applyRgb = () => {
    if (applying) return;
    draftNone = false;
    draftHex = rgbToHex(+rInput.value || 0, +gInput.value || 0, +bInput.value || 0);
    refreshDraft();
    if (liveApply) ctrl.setWorkingColor(draftHex, { recordRecent: false });
  };
  const applyHsl = () => {
    if (applying) return;
    const rgb = hslToRgb(+hInput.value || 0, +sInput.value || 0, +lInput.value || 0);
    draftNone = false;
    draftHex = rgbToHex(rgb.r, rgb.g, rgb.b);
    refreshDraft();
    if (liveApply) ctrl.setWorkingColor(draftHex, { recordRecent: false });
  };
  for (const el of [rInput, gInput, bInput]) el.addEventListener('input', applyRgb);
  for (const el of [hInput, sInput, lInput]) el.addEventListener('input', applyHsl);

  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('open')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Enter' && e.target?.id?.startsWith('vcs_picker_')) {
      e.preventDefault();
      applyAndClose();
    }
  });

  window.__visterasOpenColorPicker = open;
  ctrl.subscribe(() => {
    if (!modal.classList.contains('open')) return;
    // Keep target chrome in sync if changed externally
    targetLabel.textContent = ctrl.getActiveTarget() === 'fill' ? 'Fill' : 'Stroke';
    fillBtn.classList.toggle('active', ctrl.getActiveTarget() === 'fill');
    strokeBtn.classList.toggle('active', ctrl.getActiveTarget() === 'stroke');
  });
}

// ---------------------------------------------------------------------------
// Public mount
// ---------------------------------------------------------------------------

/**
 * @param {{ svgEditor: any }} opts
 */
export function mountVisterasColorSystem({ svgEditor } = {}) {
  if (!svgEditor?.svgCanvas) {
    console.warn('[visteras-color-system] svgEditor not ready');
    return null;
  }
  if (window.__visterasColorSystemMounted) {
    return window.__visterasColorSystem;
  }

  const ctrl = createColorController(svgEditor);

  const tryMount = () => {
    mountToolbarColorSwatches(svgEditor, ctrl);
    mountColorPanel(ctrl, svgEditor);
    mountSwatchesPanel(ctrl);
    mountPickerModal(ctrl);
  };

  tryMount();
  setTimeout(tryMount, 100);
  setTimeout(tryMount, 500);
  setTimeout(() => {
    ctrl.syncFromCanvas();
  }, 600);

  window.__visterasColorSystemMounted = true;
  console.info('[visteras-color-system] mounted');
  return ctrl;
}

export default mountVisterasColorSystem;
