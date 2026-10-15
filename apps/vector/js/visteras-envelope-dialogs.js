/**
 * Visteras Vector — Envelope Distort dialogs: Warp Options (Make / Reset with Warp, live Preview).
 * Session memory only: last-used values live in this module (no storage of any kind).
 * Pure helpers (clamp, icons, session) are DOM-free so they can be unit-tested.
 */
import { normalizeParams, normalizeOpts, readEnvelope } from './visteras-envelope-core.js?v=envelope-5';
import { STYLE_LABELS, warpPoint } from './visteras-envelope-warp.js?v=envelope-5';
import { makeEnvelope, revertPreviewEnvelope, updateEnvelope, restoreEnvelopeAttrs } from './visteras-envelope-model.js?v=envelope-5';

export const DEFAULT_WARP = Object.freeze({ style: 'arc', dir: 'h', bend: 50, dh: 0, dv: 0 });
export const DEFAULT_OPTS = Object.freeze(normalizeOpts({}));
let sessionWarp = { ...DEFAULT_WARP };
let sessionOpts = { ...DEFAULT_OPTS };
export const getSessionWarp = () => ({ ...sessionWarp });
export const setSessionWarp = (p) => { sessionWarp = normalizeParams({ ...sessionWarp, ...p }); return getSessionWarp(); };
export const getSessionOpts = () => ({ ...sessionOpts });
export const setSessionOpts = (o) => { sessionOpts = normalizeOpts({ ...sessionOpts, ...o }); return getSessionOpts(); };
/** Test hook: back to factory defaults. */
export const resetSession = () => { sessionWarp = { ...DEFAULT_WARP }; sessionOpts = { ...DEFAULT_OPTS }; };

/** Clamp a typed percentage; empty/garbage falls back. */
export function clampPercent(value, min = -100, max = 100, fallback = 0) {
  const n = Math.round(Number(String(value).replace('%', '').trim()));
  if (!Number.isFinite(n) || String(value).trim() === '') return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Small inline SVG icon: a 4×3 grid warped by the style at bend 50 (stroke = currentColor). */
export function styleIcon(style, size = 22) {
  const box = [3, 5, size - 6, size - 10], params = { style, dir: 'h', bend: 50, dh: 0, dv: 0 };
  const line = (pts) => 'M' + pts.map(([x, y]) => warpPoint(x, y, box, params).map((v) => v.toFixed(1)).join(' ')).join('L');
  const d = [];
  for (let i = 0; i <= 3; i++) { const y = box[1] + box[3] * i / 3; d.push(line(Array.from({ length: 9 }, (_, k) => [box[0] + box[2] * k / 8, y]))); }
  for (let i = 0; i <= 4; i++) { const x = box[0] + box[2] * i / 4; d.push(line(Array.from({ length: 7 }, (_, k) => [x, box[1] + box[3] * k / 6]))); }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true" focusable="false"><path d="${d.join('')}" fill="none" stroke="currentColor" stroke-width="1"/></svg>`;
}

const STYLE_CSS = `
.venv_modal.visteras_modal_overlay{position:fixed;inset:0;z-index:5000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center}
.venv_modal .visteras_modal{background:#2a2a2a;border:1px solid #444;border-radius:6px;color:#ddd;box-shadow:0 12px 40px rgba(0,0,0,.5)}
.venv_modal .visteras_modal_header{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #3a3a3a;font-size:13px}
.venv_modal .vui-btn{background:#3a3a3a;border:1px solid #555;color:#ddd;border-radius:4px;padding:4px 12px;cursor:pointer;font-size:12px}
.venv_modal .vui-btn:disabled{opacity:.45;cursor:default}
.venv_modal .vui-btn-primary{background:var(--studio-orange,#fa7c1b);border-color:transparent;color:#111;font-weight:600}
.venv_modal .vui-input{background:#1e1e1e;border:1px solid #555;color:#ddd;border-radius:3px;padding:2px 4px}
#visteras_warp_dialog .vwarp_row{display:flex;align-items:center;gap:8px;color:#ccc;font-size:12px}
#visteras_warp_dialog .vwarp_row>span:first-child{width:76px}
#visteras_warp_dialog .vwarp_num{width:52px}
#visteras_warp_dialog .vwarp_range{flex:1}
#visteras_warp_dialog .vwarp_style{position:relative;flex:1}
#visteras_warp_dialog .vwarp_style_btn{display:flex;align-items:center;gap:6px;width:100%;justify-content:flex-start}
#visteras_warp_dialog .vwarp_list{position:absolute;left:0;right:0;top:100%;z-index:5;max-height:260px;overflow:auto;background:inherit;border:1px solid currentColor;margin:2px 0 0;padding:2px 0;list-style:none}
#visteras_warp_dialog .vwarp_list{background:#2a2a2a}
#visteras_warp_dialog .vwarp_list li{display:flex;align-items:center;gap:6px;padding:2px 8px;cursor:default}
#visteras_warp_dialog .vwarp_list li[aria-selected="true"],#visteras_warp_dialog .vwarp_list li:hover{outline:1px solid currentColor;outline-offset:-1px}
#visteras_warp_dialog fieldset{border:0;margin:0;padding:0;display:flex;gap:12px}
`;

export function ensureStyle() {
  if (document.getElementById('visteras_warp_css')) return;
  const s = document.createElement('style'); s.id = 'visteras_warp_css'; s.textContent = STYLE_CSS; document.head.appendChild(s);
}

const pctRow = (id, label, value) => `
  <label class="vwarp_row"><span>${label}</span>
    <input type="range" class="vwarp_range" id="${id}_range" min="-100" max="100" step="1" value="${value}" aria-label="${label}">
    <input type="number" class="vwarp_num vui-input" id="${id}" min="-100" max="100" step="1" value="${value}" aria-label="${label} %"> %</label>`;

/**
 * Open Warp Options.
 *  - targets: elements to envelope (Make), or
 *  - envelope: an existing envelope (Reset with Warp; prefilled with its params).
 * Preview changes are never recorded in history; OK commits one undo step; Cancel restores verbatim.
 */
export function openWarpOptions(sc, { targets = null, envelope = null } = {}) {
  if (document.getElementById('visteras_warp_dialog')) return null;
  ensureStyle();
  const reset = !!envelope;
  let state = reset ? normalizeParams(readEnvelope(envelope).params) : getSessionWarp();
  const previous = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'visteras_modal_overlay venv_modal'; overlay.id = 'visteras_warp_dialog';
  overlay.innerHTML = `
  <div class="visteras_modal vwarp_dialog_box" role="dialog" aria-modal="true" aria-labelledby="vwarp_title" style="width:380px">
    <div class="visteras_modal_header"><span id="vwarp_title">Warp Options</span>
      <button type="button" class="floating_panel_close" id="vwarp_close" aria-label="Close">×</button></div>
    <div class="visteras_modal_body" style="padding:12px 14px;display:flex;flex-direction:column;gap:10px">
      <div class="vwarp_row"><span id="vwarp_style_label">Style</span>
        <div class="vwarp_style">
          <button type="button" class="vui-btn vwarp_style_btn" id="vwarp_style" aria-haspopup="listbox" aria-labelledby="vwarp_style_label vwarp_style"></button>
          <ul class="vwarp_list" id="vwarp_style_list" role="listbox" aria-labelledby="vwarp_style_label" hidden tabindex="-1">
            ${STYLE_LABELS.map(([k, l]) => `<li role="option" id="vwarp_opt_${k}" data-style="${k}">${styleIcon(k)}<span>${l}</span></li>`).join('')}
          </ul></div></div>
      <fieldset class="vwarp_row" aria-label="Direction"><span></span>
        <label><input type="radio" name="vwarp_dir" value="h"> Horizontal</label>
        <label><input type="radio" name="vwarp_dir" value="v"> Vertical</label></fieldset>
      ${pctRow('vwarp_bend', 'Bend', state.bend)}
      <div style="color:#aaa;font-size:12px">Distortion</div>
      ${pctRow('vwarp_dh', 'Horizontal', state.dh)}
      ${pctRow('vwarp_dv', 'Vertical', state.dv)}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px">
        <label class="vwarp_row"><input type="checkbox" id="vwarp_preview"> Preview</label>
        <span style="display:flex;gap:8px"><button type="button" id="vwarp_cancel" class="vui-btn">Cancel</button>
        <button type="button" id="vwarp_ok" class="vui-btn vui-btn-primary">OK</button></span></div>
    </div></div>`;
  const $ = (sel) => overlay.querySelector(sel);
  const styleBtn = $('#vwarp_style'), list = $('#vwarp_style_list'), preview = $('#vwarp_preview');
  const showStyle = () => {
    const label = STYLE_LABELS.find(([k]) => k === state.style)?.[1] || 'Arc';
    styleBtn.innerHTML = `${styleIcon(state.style)}<span>${label}</span><span aria-hidden="true" style="margin-left:auto">▾</span>`;
    styleBtn.dataset.style = state.style;
    for (const li of list.children) li.setAttribute('aria-selected', String(li.dataset.style === state.style));
  };
  const syncFields = () => {
    showStyle();
    for (const r of overlay.querySelectorAll('input[name="vwarp_dir"]')) r.checked = r.value === state.dir;
    for (const k of ['bend', 'dh', 'dv']) { $(`#vwarp_${k}`).value = state[k]; $(`#vwarp_${k}_range`).value = state[k]; }
  };

  // Preview plumbing (Simplify pattern: originals captured once, restored verbatim).
  let previewGroup = null, snapshot = null, frame = 0;
  const revert = () => {
    cancelAnimationFrame(frame); frame = 0;
    if (previewGroup) { revertPreviewEnvelope(previewGroup); previewGroup = null; sc.clearSelection?.(); sc.addToSelection?.(targets, true); }
    if (snapshot) { restoreEnvelopeAttrs(sc, envelope, snapshot); snapshot = null; }
  };
  const renderPreview = () => {
    frame = 0;
    if (!preview.checked) return;
    if (reset) {
      const snap = updateEnvelope(sc, envelope, { params: state }, { history: false });
      if (!snapshot) snapshot = snap;
    } else if (previewGroup) updateEnvelope(sc, previewGroup, { params: state }, { history: false });
    else previewGroup = makeEnvelope(sc, targets, state, getSessionOpts(), { history: false });
  };
  const schedule = () => { if (!preview.checked) return; if (!frame) frame = requestAnimationFrame(renderPreview); };
  const set = (patch) => { state = normalizeParams({ ...state, ...patch }); syncFields(); schedule(); };

  // Style dropdown (button + listbox, keyboard: arrows / Enter / Escape).
  const openList = (open) => { list.hidden = !open; styleBtn.setAttribute('aria-expanded', String(open)); if (open) { list.focus(); list.setAttribute('aria-activedescendant', `vwarp_opt_${state.style}`); } };
  styleBtn.onclick = () => openList(list.hidden);
  list.onclick = (e) => { const li = e.target.closest('li[data-style]'); if (li) { set({ style: li.dataset.style }); openList(false); styleBtn.focus(); } };
  list.onkeydown = (e) => {
    const keys = STYLE_LABELS.map(([k]) => k), i = keys.indexOf(state.style);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); set({ style: keys[(i + (e.key === 'ArrowDown' ? 1 : keys.length - 1)) % keys.length] }); list.setAttribute('aria-activedescendant', `vwarp_opt_${state.style}`); }
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); openList(false); styleBtn.focus(); }
  };
  for (const r of overlay.querySelectorAll('input[name="vwarp_dir"]')) r.onchange = () => set({ dir: r.value });
  for (const k of ['bend', 'dh', 'dv']) {
    const num = $(`#vwarp_${k}`), range = $(`#vwarp_${k}_range`);
    range.oninput = () => set({ [k]: Number(range.value) });
    num.onchange = () => set({ [k]: clampPercent(num.value, -100, 100, state[k]) });
    num.oninput = () => { if (num.value.trim() !== '' && num.value !== '-') set({ [k]: clampPercent(num.value, -100, 100, state[k]) }); };
  }
  preview.onchange = () => { if (preview.checked) { document.body.style.cursor = 'progress'; renderPreview(); requestAnimationFrame(() => { document.body.style.cursor = ''; }); } else revert(); };

  const close = (commit) => {
    revert();
    window.removeEventListener('keydown', onKey, true);
    overlay.remove();
    let result = null;
    // Last-used values are remembered for the session, also after Cancel (spec smoke, stage 4).
    if (commit || !reset) setSessionWarp(state);
    if (commit) {
      try {
        result = reset ? (updateEnvelope(sc, envelope, { params: state }, { label: 'Reset with Warp' }), envelope)
          : makeEnvelope(sc, targets, state, getSessionOpts());
      } catch (error) { window.showStudioToast?.(error.message, 'error'); }
    }
    previous?.focus?.();
    return result;
  };
  // Modal keys: Esc cancels, Enter commits, undo/redo are blocked while open, focus is trapped.
  const onKey = (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && /^[zy]$/i.test(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.key === 'Escape' && list.hidden) { e.preventDefault(); e.stopImmediatePropagation(); close(false); return; }
    if (e.key === 'Enter' && list.hidden && !['BUTTON'].includes(document.activeElement?.tagName)) { e.preventDefault(); e.stopImmediatePropagation(); close(true); return; }
    if (e.key === 'Tab') {
      const f = [...overlay.querySelectorAll('button,input')].filter((n) => !n.disabled && n.offsetParent !== null);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f.at(-1).focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  };
  $('#vwarp_ok').onclick = () => close(true);
  $('#vwarp_cancel').onclick = () => close(false);
  $('#vwarp_close').onclick = () => close(false);
  window.addEventListener('keydown', onKey, true);
  document.body.appendChild(overlay);
  syncFields();
  styleBtn.focus();
  return { overlay, close, get state() { return { ...state }; } };
}
