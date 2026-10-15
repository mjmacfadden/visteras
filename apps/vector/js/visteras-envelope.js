import { canEnvelope, isEnvelope } from './visteras-envelope-core.js?v=envelope-3';
import { makeEnvelope, refreshEnvelope, setEnvelopeDeps } from './visteras-envelope-model.js?v=envelope-3';
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

function stubDialog(title, accept = null) {
  const previous = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'visteras_modal_overlay';
  overlay.id = 'visteras_envelope_dialog';
  overlay.innerHTML = `<div class="visteras_modal" role="dialog" aria-modal="true" aria-labelledby="venv_title" style="width:340px">
    <div class="visteras_modal_header"><span id="venv_title"></span></div>
    <div class="visteras_modal_body"><button type="button" class="vui-btn">Cancel</button></div></div>`;
  overlay.querySelector('#venv_title').textContent = title;
  const close = () => { overlay.remove(); window.removeEventListener('keydown', onKey, true); previous?.focus?.(); };
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    if (e.key === 'Tab') { e.preventDefault(); overlay.querySelector('button').focus(); }
  };
  overlay.querySelector('button').onclick = close;
  if (accept) {
    const ok=document.createElement('button'); ok.type='button'; ok.className='vui-btn vui-btn-primary'; ok.textContent='OK';
    ok.onclick=()=>{try {accept();close();} catch(error) {window.showStudioToast?.(error.message,'error');}};
    overlay.querySelector('.visteras_modal_body').appendChild(ok);
  }
  window.addEventListener('keydown', onKey, true);
  document.body.appendChild(overlay);
  overlay.querySelector('button').focus();
  return overlay;
}

export function mountEnvelope(editor) {
  // Same URL as index.html so the shared font cache is reused; loaded lazily (keeps tests DOM-free).
  setEnvelopeDeps({ loadTextOutlines: () => import('./visteras-text-outlines.js?v=character-styling-1').then(m => m.convertTextToOutlines) });
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
      if (id === 'options') stubDialog('Envelope Options');
    });
    list.appendChild(item);
  }
  document.getElementById('action_scale_strokes')?.after(menu);
  function sync() {
    const sel = selected(sc), isEnvelope = sel.length === 1 && envelope(sel[0]);
    for (const [id] of ENVELOPE_COMMANDS) {
      const item = document.getElementById(`action_envelope_${id}`);
      const enabled = id === 'options' || (id === 'make' ? isEnvelope || canMakeEnvelope(sel) : ['release', 'expand', 'edit'].includes(id) && isEnvelope);
      item.classList.toggle('disabled', !enabled); item.setAttribute('aria-disabled', String(!enabled));
      if (id === 'make' || id === 'mesh') item.querySelector('.envelope-command-label').textContent = `${isEnvelope ? 'Reset' : 'Make'} with ${id === 'make' ? 'Warp' : 'Mesh'}…`;
    }
  }
  function openWarp() {
    if (document.getElementById('visteras_envelope_dialog')) return;
    const sel = selected(sc);
    if (canMakeEnvelope(sel) || (sel.length === 1 && envelope(sel[0]))) stubDialog('Warp Options', () => makeEnvelope(sc, sel));
  }
  window.addEventListener('keydown', e => {
    if (['input', 'textarea', 'select'].includes(document.activeElement?.tagName?.toLowerCase()) || document.activeElement?.isContentEditable) return;
    if (window.__visterasIsTypingDirectly) return;
    if (!eventMatchesChord(e, WARP_CHORD)) return;
    e.preventDefault(); e.stopImmediatePropagation(); openWarp();
  }, true);
  const original = sc.call;
  sc.call = function(event, ...args) {
    const result = original.call(this, event, ...args);
    if (event === 'sourcechanged') for (const el of sc.getSvgContent().querySelectorAll('[data-visteras-envelope="warp"]')) refreshEnvelope(sc,el);
    if (['selected', 'changed', 'sourcechanged'].includes(event)) sync();
    return result;
  };
  sync();
  return { openWarp, sync };
}
