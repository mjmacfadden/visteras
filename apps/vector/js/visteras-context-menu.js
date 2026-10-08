/**
 * Visteras Vector — Illustrator-style canvas context menu.
 *
 * Cause of the old menu failing: SVG-Edit's se-cmenu_canvas dispatches change
 * events that call Editor.cutSelected()/copySelected(), which gate on
 * Editor.selectedElement / multiselected. Those flags go stale after the
 * artboard/selection refactors, so items appear to "do nothing". The menu bar
 * works because it calls svgCanvas APIs (or action_* handlers) directly.
 *
 * This menu reuses the same #action_* menu-bar commands (click) — no duplicate
 * logic. Items are omitted when they don't apply (Illustrator hide, not disable).
 */
import { formatShortcut, detectMac } from './visteras-shortcut-label.js?v=1';

const MENU_ID = 'visteras_context_menu';

function sel(sc) {
  return (sc?.getSelectedElements?.() || []).filter(Boolean);
}

function isGroup(el) {
  return el?.tagName === 'g' && !el.classList?.contains('layer') && !el.hasAttribute?.('data-visteras-clip-group');
}

function isClipGroup(el) {
  return !!(el?.hasAttribute?.('data-visteras-clip-group') || el?.querySelector?.(':scope > clipPath, :scope > defs > clipPath') || el?.getAttribute?.('clip-path'));
}

function runAction(id) {
  const el = document.getElementById(id);
  if (!el || el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true') return false;
  el.click();
  return true;
}

function canUndo(sc) {
  return (sc?.undoMgr?.getUndoStackSize?.() || 0) > 0;
}
function canRedo(sc) {
  return (sc?.undoMgr?.getRedoStackSize?.() || 0) > 0;
}
function hasLocked() {
  try { return !!document.querySelector('#svgcontent [data-visteras-locked="1"]'); } catch { return false; }
}
function hasHidden() {
  try { return !!document.querySelector('#svgcontent [data-visteras-hidden="1"]'); } catch { return false; }
}
function actionEnabled(id) {
  try {
    const el = document.getElementById(id);
    return !!(el && !el.classList.contains('disabled') && el.getAttribute('aria-disabled') !== 'true');
  } catch { return false; }
}
function hasClipboard(sc) {
  try {
    const clipId = sc?.getClipboardID?.() || 'svgedit_clipboard';
    const raw = sessionStorage.getItem(clipId);
    if (!raw) return true; // still show Paste (system clipboard may have content)
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.length > 0 : !!raw;
  } catch {
    return true;
  }
}

/**
 * Build the list of visible items for the current selection (pure).
 * Each item: { id, label, actionId, shortcut?, separatorBefore? }
 */
export function contextMenuItems(sc, { mac = detectMac() } = {}) {
  const elements = sel(sc);
  const n = elements.length;
  const items = [];
  const add = (item) => items.push(item);
  const sep = () => { if (items.length && !items[items.length - 1].separator) items.push({ separator: true }); };

  if (canUndo(sc)) add({ id: 'undo', label: 'Undo', actionId: 'action_undo', shortcut: formatShortcut({ meta: true, key: 'Z', mac }) });
  if (canRedo(sc)) add({ id: 'redo', label: 'Redo', actionId: 'action_redo', shortcut: formatShortcut({ meta: true, shift: true, key: 'Z', mac }) });
  sep();

  if (n >= 1) {
    add({ id: 'cut', label: 'Cut', actionId: 'action_cut', shortcut: formatShortcut({ meta: true, key: 'X', mac }) });
    add({ id: 'copy', label: 'Copy', actionId: 'action_copy', shortcut: formatShortcut({ meta: true, key: 'C', mac }) });
  }
  add({ id: 'paste', label: 'Paste', actionId: 'action_paste', shortcut: formatShortcut({ meta: true, key: 'V', mac }) });
  if (n >= 1) add({ id: 'delete', label: 'Delete', actionId: 'action_delete', shortcut: formatShortcut({ key: 'Backspace', mac }) });
  sep();

  if (n >= 2) add({ id: 'group', label: 'Group', actionId: 'action_group', shortcut: formatShortcut({ meta: true, key: 'G', mac }) });
  if (n === 1 && isGroup(elements[0])) add({ id: 'ungroup', label: 'Ungroup', actionId: 'action_ungroup', shortcut: formatShortcut({ meta: true, shift: true, key: 'G', mac }) });
  sep();

  if (n >= 1) {
    add({ id: 'lock', label: 'Lock Selection', actionId: 'action_lock_selection', shortcut: formatShortcut({ meta: true, key: '2', mac }) });
    add({ id: 'hide', label: 'Hide Selection', actionId: 'action_hide_selection', shortcut: formatShortcut({ meta: true, key: '3', mac }) });
  }
  if (hasLocked()) add({ id: 'unlock_all', label: 'Unlock All', actionId: 'action_unlock_all', shortcut: formatShortcut({ meta: true, alt: true, key: '2', mac }) });
  if (hasHidden()) add({ id: 'show_all', label: 'Show All', actionId: 'action_show_all', shortcut: formatShortcut({ meta: true, alt: true, key: '3', mac }) });
  sep();

  if (n >= 1) {
    add({ id: 'front', label: 'Bring to Front', actionId: 'action_bring_front', shortcut: formatShortcut({ meta: true, shift: true, key: ']', mac }) });
    add({ id: 'forward', label: 'Bring Forward', actionId: 'action_bring_forward', shortcut: formatShortcut({ meta: true, key: ']', mac }) });
    add({ id: 'backward', label: 'Send Backward', actionId: 'action_send_backward', shortcut: formatShortcut({ meta: true, key: '[', mac }) });
    add({ id: 'back', label: 'Send to Back', actionId: 'action_send_back', shortcut: formatShortcut({ meta: true, shift: true, key: '[', mac }) });
    sep();
    add({ id: 'flip_h', label: 'Flip Horizontal', actionId: 'action_flip_h' });
    add({ id: 'flip_v', label: 'Flip Vertical', actionId: 'action_flip_v' });
  }
  sep();

  // Clipping mask — reuse Object menu actions when present
  if (n >= 2 && actionEnabled('action_make_clipping_mask')) {
    add({ id: 'make_clip', label: 'Make Clipping Mask', actionId: 'action_make_clipping_mask', shortcut: formatShortcut({ meta: true, key: '7', mac }) });
  }
  if (n >= 1 && (isClipGroup(elements[0]) || elements.some(isClipGroup)) && actionEnabled('action_release_clipping_mask')) {
    add({ id: 'release_clip', label: 'Release Clipping Mask', actionId: 'action_release_clipping_mask', shortcut: formatShortcut({ meta: true, alt: true, key: '7', mac }) });
  }
  sep();

  add({ id: 'select_all', label: 'Select All', actionId: 'action_select_all', shortcut: formatShortcut({ meta: true, key: 'A', mac }) });
  if (n >= 1) add({ id: 'deselect', label: 'Deselect', actionId: 'action_deselect_all', shortcut: formatShortcut({ meta: true, shift: true, key: 'A', mac }) });

  // Drop trailing separators / collapse doubles
  const cleaned = [];
  for (const it of items) {
    if (it.separator) {
      if (!cleaned.length || cleaned[cleaned.length - 1].separator) continue;
      cleaned.push(it);
    } else cleaned.push(it);
  }
  while (cleaned.length && cleaned[cleaned.length - 1].separator) cleaned.pop();
  return cleaned;
}

export function mountContextMenu(editor) {
  const sc = editor?.svgCanvas;
  if (!sc || window.__visterasContextMenu) return window.__visterasContextMenu || null;

  // Hide the broken SVG-Edit canvas context menu (keep in DOM for any legacy refs).
  const legacy = document.getElementById('se-cmenu_canvas');
  if (legacy) {
    legacy.style.display = 'none';
    legacy.setAttribute('data-visteras-replaced', '1');
    // Stop it from opening
    const work = document.getElementById('workarea');
    work?.addEventListener('contextmenu', (e) => {
      // Our handler below also listens; prevent legacy from winning via capture later.
    }, true);
  }

  let menu = document.getElementById(MENU_ID);
  if (!menu) {
    menu = document.createElement('div');
    menu.id = MENU_ID;
    menu.className = 'visteras-context-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    document.body.append(menu);
  }

  if (!document.getElementById('visteras_context_menu_style')) {
    const st = document.createElement('style');
    st.id = 'visteras_context_menu_style';
    st.textContent = `
      .visteras-context-menu {
        position: fixed; z-index: 100000; min-width: 220px; max-width: 320px;
        background: #2b2b2b; color: #eee; border: 1px solid #111;
        border-radius: 6px; box-shadow: 0 8px 28px rgba(0,0,0,.45);
        padding: 4px 0; font: 12px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .visteras-context-menu[hidden] { display: none !important; }
      .visteras-context-menu .vcm-item {
        display: flex; align-items: center; justify-content: space-between; gap: 24px;
        padding: 6px 14px; cursor: default; border: 0; background: transparent; color: inherit;
        width: 100%; text-align: left; font: inherit;
      }
      .visteras-context-menu .vcm-item:hover, .visteras-context-menu .vcm-item:focus {
        background: #fa7c1b; color: #111; outline: none;
      }
      .visteras-context-menu .vcm-shortcut { color: #999; font-size: 11px; }
      .visteras-context-menu .vcm-item:hover .vcm-shortcut { color: #333; }
      .visteras-context-menu .vcm-sep { height: 1px; background: #444; margin: 4px 8px; }
      se-cmenu_canvas-dialog[data-visteras-replaced="1"] { display: none !important; }
    `;
    document.head.append(st);
  }

  const hide = () => { menu.hidden = true; menu.innerHTML = ''; };
  const showAt = (x, y) => {
    const items = contextMenuItems(sc);
    if (!items.length) { hide(); return; }
    menu.innerHTML = items.map((it) => {
      if (it.separator) return '<div class="vcm-sep" role="separator"></div>';
      const scLabel = it.shortcut ? `<span class="vcm-shortcut">${it.shortcut}</span>` : '';
      return `<button type="button" class="vcm-item" role="menuitem" data-action="${it.actionId}" data-id="${it.id}">
        <span class="vcm-label">${it.label}</span>${scLabel}</button>`;
    }).join('');
    menu.hidden = false;
    // Position, keep on-screen
    const pad = 8;
    menu.style.left = '0px'; menu.style.top = '0px';
    const rect = menu.getBoundingClientRect();
    let left = x, top = y;
    if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad;
    if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad;
    menu.style.left = `${Math.max(pad, left)}px`;
    menu.style.top = `${Math.max(pad, top)}px`;
  };

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('.vcm-item');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const actionId = btn.dataset.action;
    hide();
    runAction(actionId);
  });

  const work = document.getElementById('workarea') || document.getElementById('svgcanvas') || document.body;
  work.addEventListener('contextmenu', (e) => {
    // Don't steal from inputs / panels
    if (e.target.closest?.('input,textarea,select,[contenteditable="true"],#sidepanels,#vdock,.vui-dialog,.vui-overlay')) return;
    e.preventDefault();
    e.stopPropagation();
    // Suppress legacy menu
    const leg = document.getElementById('se-cmenu_canvas');
    if (leg?.shadowRoot) {
      const dlg = leg.shadowRoot.querySelector('#cmenu_canvas');
      if (dlg) dlg.style.display = 'none';
    }
    showAt(e.clientX, e.clientY);
  }, true);

  document.addEventListener('mousedown', (e) => {
    if (!menu.hidden && !menu.contains(e.target)) hide();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) { hide(); e.preventDefault(); }
  }, true);
  window.addEventListener('blur', hide);
  window.addEventListener('resize', hide);

  const api = { showAt, hide, contextMenuItems: () => contextMenuItems(sc), runAction };
  window.__visterasContextMenu = api;
  return api;
}
