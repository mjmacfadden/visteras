import { canEnvelope, isEnvelope } from './visteras-envelope-core.js?v=envelope-5';
import { refreshEnvelope, setEnvelopeDeps, updateEnvelope } from './visteras-envelope-model.js?v=envelope-5';
import { openWarpOptions, openEnvelopeOptions, clampPercent } from './visteras-envelope-dialogs.js?v=envelope-5';
import { STYLE_LABELS } from './visteras-envelope-warp.js?v=envelope-5';
import { readEnvelope, EDITING } from './visteras-envelope-core.js?v=envelope-5';
import { editContents, editEnvelope, releaseEnvelope, expandEnvelope, clearEditingFlag } from './visteras-envelope-actions.js?v=envelope-5';
import { ensureEnvelopeRendered } from './visteras-envelope-model.js?v=envelope-5';
import { eventMatchesChord, formatBrowserSafeShortcut } from './visteras-browser-shortcuts.js';

export const WARP_CHORD = Object.freeze({ meta: true, alt: true, shift: true, key: 'W' });
// Reset replaces Make in-place; separators are not commands.
export const ENVELOPE_COMMANDS = Object.freeze([
  ['make', 'Make with Warp…'], ['mesh', 'Make with Mesh…'], ['top', 'Make with Top Object'],
  ['release', 'Release'], ['options', 'Envelope Options…'], ['expand', 'Expand'], ['edit', 'Edit Contents'],
]);
const selected = sc => (sc.getSelectedElements?.() || []).filter(Boolean);
const envelope = isEnvelope;
export const canMakeEnvelope = canEnvelope;


/** Why Make with Warp can't run on this selection (toast text), or '' when nothing is selected. */
export function envelopeBlockReason(sel) {
  if (!sel.length) return '';
  if (sel.some(el => el.localName === 'use' || el.querySelector?.('use'))) return 'Expand the symbol first';
  if (sel.some(el => envelope(el))) return 'Select a single envelope to reset it';
  return 'Envelope Distort needs unlocked, visible artwork';
}

/**
 * Control-bar controls for a selected envelope (Properties panel section "Envelope").
 * Every change is one undo step ('Envelope Warp').
 */
export function mountEnvelopePanel(sc, { openOptions, editContents, getCurrent } = {}) {
  const host = document.getElementById('properties_content');
  if (!host || document.getElementById('sec_envelope')) return null;
  const sec = document.createElement('div');
  sec.className = 'prop_section'; sec.id = 'sec_envelope'; sec.style.display = 'none';
  sec.innerHTML = `<div class="prop_section_header" data-target="sec_envelope_body"><span class="prop_section_arrow"></span><span class="prop_section_title">Envelope</span></div>
    <div class="prop_section_body" id="sec_envelope_body" style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:#ccc">
      <label style="display:flex;gap:6px;align-items:center">Style <select id="venv_style" class="vui-input" style="flex:1">${STYLE_LABELS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <div role="radiogroup" aria-label="Direction" style="display:flex;gap:10px"><label><input type="radio" name="venv_dir" value="h"> Horizontal</label><label><input type="radio" name="venv_dir" value="v"> Vertical</label></div>
      <label style="display:flex;gap:6px;align-items:center">Bend <input id="venv_bend" type="number" class="vui-input" min="-100" max="100" step="1" style="width:56px"> %</label>
      <label style="display:flex;gap:6px;align-items:center">H <input id="venv_dh" type="number" class="vui-input" min="-100" max="100" step="1" style="width:56px"> %
        V <input id="venv_dv" type="number" class="vui-input" min="-100" max="100" step="1" style="width:56px"> %</label>
      <div style="display:flex;gap:6px"><button type="button" class="vui-btn" id="venv_edit">Edit Contents</button><button type="button" class="vui-btn" id="venv_options">Envelope Options…</button></div>
    </div>`;
  const anchor = document.getElementById('sec_appearance');
  if (anchor) anchor.before(sec); else host.appendChild(sec);
  const $ = (id) => sec.querySelector(id);
  const current = getCurrent || (() => { const sel = selected(sc); return sel.length === 1 && envelope(sel[0]) ? sel[0] : null; });
  const commit = (patch) => { const el = current(); if (el) updateEnvelope(sc, el, { params: patch }, { label: 'Envelope Warp' }); };
  $('#venv_style').onchange = (e) => commit({ style: e.target.value });
  for (const r of sec.querySelectorAll('input[name="venv_dir"]')) r.onchange = () => commit({ dir: r.value });
  for (const k of ['bend', 'dh', 'dv']) $(`#venv_${k}`).onchange = (e) => {
    const el = current(); if (!el) return;
    const v = clampPercent(e.target.value, -100, 100, readEnvelope(el).params[k]); e.target.value = v; commit({ [k]: v });
  };
  $('#venv_edit').onclick = () => editContents?.();
  $('#venv_options').onclick = () => openOptions?.();
  return {
    sync() {
      const el = current();
      sec.style.display = el ? '' : 'none';
      if (!el) return;
      const p = readEnvelope(el).params, editing = el.hasAttribute('data-visteras-envelope-editing');
      $('#venv_style').value = p.style;
      for (const r of sec.querySelectorAll('input[name="venv_dir"]')) r.checked = r.value === p.dir;
      for (const k of ['bend', 'dh', 'dv']) if (document.activeElement !== $(`#venv_${k}`)) $(`#venv_${k}`).value = p[k];
      $('#venv_edit').textContent = editing ? 'Edit Envelope' : 'Edit Contents';
    },
  };
}

export function mountEnvelope(editor) {
  // Same URL as index.html so the shared font cache is reused; loaded lazily (keeps tests DOM-free).
  setEnvelopeDeps({
    loadTextOutlines: () => import('./visteras-text-outlines.js?v=character-styling-1').then(m => m.convertTextToOutlines),
    // Distort Appearance: the same Paper.js outline as Object ▸ Path ▸ Outline Stroke (same module URLs as expand.js).
    loadStrokeOutliner: async () => {
      const [{ readStrokeSpec, pathItemFromElement }, { outlineItem }] = await Promise.all([
        import('./visteras-offset-path.js'), import('./visteras-stroke-envelope.js?v=envelope-1')]);
      let scope = null;
      return (el) => {
        if (!window.paper) return null;
        const spec = readStrokeSpec(el); if (!spec) return null;
        if (!scope) { scope = new window.paper.PaperScope(); scope.setup(document.createElement('canvas')); }
        const local = el.cloneNode(false); local.removeAttribute('transform');
        const item = pathItemFromElement(scope, local);
        const outline = item && outlineItem(scope, item, spec.width, spec);
        const d = outline?.pathData || '';
        return d.trim() ? { d, color: spec.color, opacity: Number.isFinite(spec.opacity) ? spec.opacity : 1 } : null;
      };
    },
  });
  const sc = editor?.svgCanvas;
  if (!sc || document.getElementById('menu_envelope_distort')) return null;
  const menu = document.createElement('div');
  menu.id = 'menu_envelope_distort';
  menu.className = 'menu_dropdown_item menu_has_submenu';
  menu.setAttribute('role', 'menuitem'); menu.setAttribute('aria-haspopup', 'true');
  menu.innerHTML = 'Envelope Distort<span class="menu_submenu_arrow" aria-hidden="true">▸</span><div class="menu_dropdown_list menu_submenu_list" role="menu"></div>';
  const list = menu.lastElementChild;
  for (const [id, title] of ENVELOPE_COMMANDS) {
    if (id === 'release' || id === 'edit') {
      const separator = document.createElement('div'); separator.className = 'menu_dropdown_separator'; list.appendChild(separator);
    }
    const item = document.createElement('div');
    item.id = `action_envelope_${id}`; item.className = 'menu_dropdown_item'; item.setAttribute('role', 'menuitem');
    const label = document.createElement('span'); label.className = 'envelope-command-label'; label.textContent = title; item.appendChild(label);
    if (id === 'make') {
      const shortcut = document.createElement('span'); shortcut.className = 'menu_dropdown_shortcut';
      shortcut.textContent = formatBrowserSafeShortcut(WARP_CHORD); item.appendChild(shortcut);
    }
    if (id === 'mesh' || id === 'top') item.title = 'Coming later';
    item.addEventListener('click', () => {
      if (item.classList.contains('disabled')) return;
      if (id === 'make') openWarp();
      if (id === 'options') { openEnvelopeOptions(sc, { envelope: currentEnvelope() }); return; }
      const el = currentEnvelope();
      if (!el) return;
      if (id === 'release') releaseEnvelope(sc, el);
      if (id === 'expand') ensureEnvelopeRendered(sc, el).finally(() => { if (el.isConnected) expandEnvelope(sc, el); });
      if (id === 'edit') (el.hasAttribute(EDITING) ? editEnvelope : editContents)(sc, el);
    });
    list.appendChild(item);
  }
  document.getElementById('action_scale_strokes')?.after(menu);
  let editingEl = null;
  /** The selected envelope, or the envelope whose contents are being edited. */
  function currentEnvelope() {
    const sel = selected(sc);
    if (sel.length === 1 && envelope(sel[0])) return sel[0];
    if (editingEl?.isConnected && editingEl.hasAttribute(EDITING)) return editingEl;
    return sc.getSvgContent?.()?.querySelector?.(`g[${EDITING}]`) || null;
  }
  function sync() {
    const sel = selected(sc), isEnvelope = sel.length === 1 && envelope(sel[0]);
    const cur = currentEnvelope(), editing = !!cur?.hasAttribute(EDITING);
    editingEl = editing ? cur : null;
    for (const [id] of ENVELOPE_COMMANDS) {
      const item = document.getElementById(`action_envelope_${id}`);
      const enabled = id === 'options' || (id === 'make' ? isEnvelope || canMakeEnvelope(sel) : ['release', 'expand', 'edit'].includes(id) && (isEnvelope || editing));
      if (id === 'edit') item.querySelector('.envelope-command-label').textContent = editing ? 'Edit Envelope' : 'Edit Contents';
      item.classList.toggle('disabled', !enabled); item.setAttribute('aria-disabled', String(!enabled));
      if (id === 'make' || id === 'mesh') item.querySelector('.envelope-command-label').textContent = `${isEnvelope ? 'Reset' : 'Make'} with ${id === 'make' ? 'Warp' : 'Mesh'}…`;
    }
  }
  function openWarp() {
    if (document.getElementById('visteras_envelope_dialog') || document.getElementById('visteras_warp_dialog')) return;
    const sel = selected(sc);
    if (sel.length === 1 && envelope(sel[0])) return openWarpOptions(sc, { envelope: sel[0] });
    if (canMakeEnvelope(sel)) return openWarpOptions(sc, { targets: sel });
    const reason = envelopeBlockReason(sel);
    if (reason) window.showStudioToast?.(reason, 'info');
    return null;
  }
  // The Properties panel is built after extensions mount: attach lazily on the first selection change.
  let panelApi = null;
  const panel = { sync() {
    panelApi ||= mountEnvelopePanel(sc, { openOptions: () => document.getElementById('action_envelope_options')?.click(),
      editContents: () => document.getElementById('action_envelope_edit')?.click(), getCurrent: () => currentEnvelope() });
    panelApi?.sync();
  } };
  window.addEventListener('keydown', e => {
    if (['input', 'textarea', 'select'].includes(document.activeElement?.tagName?.toLowerCase()) || document.activeElement?.isContentEditable) return;
    if (window.__visterasIsTypingDirectly) return;
    if (!eventMatchesChord(e, WARP_CHORD)) return;
    e.preventDefault(); e.stopImmediatePropagation(); openWarp();
  }, true);
  if (!document.getElementById('visteras_envelope_edit_css')) {
    // Edit Contents: stylesheet rules beat the presentation attributes, so one flag swaps src/out.
    const css = document.createElement('style'); css.id = 'visteras_envelope_edit_css';
    css.textContent = `g[${EDITING}] > g[data-visteras-envelope-src]{display:inline!important}
g[${EDITING}] > g[data-visteras-envelope-out]{display:none!important}`;
    document.head.appendChild(css);
  }
  const original = sc.call;
  sc.call = function(event, ...args) {
    const result = original.call(this, event, ...args);
    if (event === 'sourcechanged') for (const el of sc.getSvgContent().querySelectorAll('[data-visteras-envelope="warp"]')) {
      if (el !== editingEl) clearEditingFlag(el); // a reopened file never starts inside Edit Contents
      refreshEnvelope(sc,el);
    }
    // Undo/redo and contents edits report 'changed': re-render any envelope whose hash moved.
    if (event === 'changed' && Array.isArray(args[0])) {
      const seen = new Set();
      for (const node of args[0]) {
        let env = null;
        for (let n = node; n && n.nodeType === 1; n = n.parentNode) if (envelope(n)) { env = n; break; }
        if (env && !seen.has(env)) { seen.add(env); refreshEnvelope(sc, env); }
      }
    }
    // Leaving the isolation (double-click outside / Esc) returns to the envelope, like Illustrator.
    if (event === 'contextset' && !args[0] && editingEl?.isConnected && editingEl.hasAttribute(EDITING)) {
      const el = editingEl; editingEl = null; queueMicrotask(() => { if (el.hasAttribute(EDITING)) editEnvelope(sc, el); });
    }
    if (['selected', 'changed', 'sourcechanged'].includes(event)) { sync(); panel.sync(); }
    return result;
  };
  sync();
  return { openWarp, sync, currentEnvelope };
}
