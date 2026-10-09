/**
 * Visteras Vector — Window menu (Illustrator style).
 *
 * One registry of every panel: alphabetical Window menu, Type ▸ Character /
 * Paragraph submenu, checkmarks that follow the real open/closed state (menu,
 * shortcut, the panel's own ×, dock icon, Esc, Tab), and shortcut labels via the
 * shared formatShortcut. Chords stay browser-safe (see isBrowserReservedChord).
 *
 * Kinds:
 *   dock        iconic dock flyout (window.__visterasDock)
 *   floating    floating panel element (Pathfinder, Paragraph)
 *   section     a Properties section (Align, Transform, Character): opening shows
 *               Properties, expands the section and scrolls to it; closing collapses it
 *   properties  the Properties column itself
 */
import { formatShortcut } from './visteras-shortcut-label.js';

export const WINDOW_PANELS = Object.freeze([
  { id: 'align', label: 'Align', kind: 'section', section: 'sec_align', shortcut: { shift: true, key: 'F7' }, own: true },
  { id: 'appearance', label: 'Appearance', kind: 'dock', shortcut: { shift: true, key: 'F6' }, own: true },
  { id: 'artboards', label: 'Artboards', kind: 'dock' },
  { id: 'color', label: 'Color', kind: 'dock', shortcut: { key: 'F6' } },
  { id: 'effects', label: 'Effects', kind: 'dock' },
  { id: 'gradient', label: 'Gradient', kind: 'dock', shortcut: { meta: true, key: 'F9' } },
  { id: 'layers', label: 'Layers', kind: 'dock', shortcut: { key: 'F7' } },
  { id: 'pathfinder', label: 'Pathfinder', kind: 'floating', element: 'visteras_pathfinder_panel', shortcut: { shift: true, meta: true, key: 'F9' } },
  { id: 'stroke', label: 'Stroke', kind: 'dock', shortcut: { meta: true, key: 'F10' } },
  { id: 'swatches', label: 'Swatches', kind: 'dock' },
  { id: 'symbols', label: 'Symbols', kind: 'dock', shortcut: { shift: true, meta: true, key: 'F11' } },
  { id: 'transform', label: 'Transform', kind: 'section', section: 'sec_transform', shortcut: { shift: true, key: 'F8' }, own: true },
  { id: 'transparency', label: 'Transparency', kind: 'dock', shortcut: { shift: true, meta: true, key: 'F10' } },
  // Illustrator's Character shortcut ⌘T / Ctrl+T is the browser's New Tab, so it stays unbound.
  { id: 'character', label: 'Character', kind: 'section', section: 'sec_typography', group: 'type', shortcut: null, own: true,
    needs: 'Select a text object to see Character options.', unboundReason: '⌘T / Ctrl+T opens a new browser tab' },
  { id: 'paragraph', label: 'Paragraph', kind: 'floating', element: 'visteras_paragraph_panel', group: 'type', shortcut: { meta: true, alt: true, key: 'T' } },
  { id: 'properties', label: 'Properties', kind: 'properties', separatorBefore: true },
]);

export const menuItemId = (id) => `action_window_${id}`;
export const panelById = (id) => WINDOW_PANELS.find((p) => p.id === id) || null;
export const shortcutLabel = (panel, mac) => (panel?.shortcut ? formatShortcut({ ...panel.shortcut, mac }) : '');

/** Panel whose own Window-menu shortcut this keydown is (only the ones this module owns). */
export function windowShortcutPanel(e) {
  const key = e?.key || '';
  const cmd = !!(e?.metaKey || e?.ctrlKey);
  if (e?.altKey) return null;
  if (key === 'F7' && e.shiftKey && !cmd) return 'align';
  if (key === 'F8' && e.shiftKey && !cmd) return 'transform';
  if (key === 'F9' && e.shiftKey && cmd) return 'pathfinder';
  return null;
}

/** Illustrator Window menu markup (alphabetical, Type submenu, Properties last). */
export function windowMenuHtml(mac) {
  const item = (p) => {
    const sc = shortcutLabel(p, mac);
    return `<div class="menu_dropdown_item" id="${menuItemId(p.id)}" role="menuitemcheckbox" aria-checked="false">${p.label}${sc ? ` <span class="menu_dropdown_shortcut">${sc}</span>` : ''}</div>`;
  };
  const main = WINDOW_PANELS.filter((p) => !p.group && p.kind !== 'properties');
  const type = WINDOW_PANELS.filter((p) => p.group === 'type');
  const rows = [];
  const typeRow = `<div class="menu_dropdown_item menu_has_submenu" id="menu_window_type" role="menuitem" aria-haspopup="true">Type<span class="menu_submenu_arrow" aria-hidden="true">▸</span><div class="menu_dropdown_list menu_submenu_list" role="menu">${type.map(item).join('')}</div></div>`;
  let typePlaced = false;
  for (const p of main) {
    if (!typePlaced && p.label.localeCompare('Type') > 0) { rows.push(typeRow); typePlaced = true; }
    rows.push(item(p));
  }
  if (!typePlaced) rows.push(typeRow);
  for (const p of WINDOW_PANELS.filter((x) => x.kind === 'properties')) rows.push('<div class="menu_dropdown_separator"></div>', item(p));
  return rows.join('');
}

function isShown(el) {
  if (!el || !el.isConnected) return false;
  if (el.style.display === 'none') return false;
  return getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
}

export function isPanelOpen(id) {
  const p = panelById(id);
  if (!p || typeof document === 'undefined') return false;
  const dock = window.__visterasDock;
  const st = dock?.getState?.() || {};
  if (p.kind === 'dock') return !!dock?.isOpen?.(id) && !st.hidden;
  if (p.kind === 'floating') return isShown(document.getElementById(p.element));
  if (p.kind === 'properties') return !st.propertiesHidden && !st.hidden && isShown(document.getElementById('sidepanels'));
  const sec = document.getElementById(p.section);
  return !st.propertiesHidden && !!sec && !sec.classList.contains('collapsed') && isShown(sec);
}

export function updateWindowChecks() {
  if (typeof document === 'undefined') return;
  for (const p of WINDOW_PANELS) {
    const item = document.getElementById(menuItemId(p.id));
    if (!item) continue;
    let chk = item.querySelector('.menu_check');
    if (!chk) { chk = document.createElement('span'); chk.className = 'menu_check'; chk.setAttribute('aria-hidden', 'true'); item.prepend(chk); }
    const open = isPanelOpen(p.id);
    if (chk.textContent !== (open ? '✓' : '')) chk.textContent = open ? '✓' : '';
    item.classList.toggle('checked', open);
    item.setAttribute('aria-checked', open ? 'true' : 'false');
  }
}

export function togglePanel(id, force) {
  const p = panelById(id);
  if (!p) return false;
  const dock = window.__visterasDock;
  const open = isPanelOpen(id);
  const want = force != null ? !!force : !open;
  if (want === open) { updateWindowChecks(); return open; }
  if (p.kind === 'dock') {
    if (want && dock?.getState?.().hidden) dock.togglePanels?.();
    if (want) dock?.open?.(id); else dock?.close?.();
  } else if (p.id === 'paragraph') {
    window.__visterasParagraphPanel?.toggle?.(want);
  } else if (p.id === 'pathfinder') {
    window.__visterasPathfinderPanel?.toggle?.(want);
  } else if (p.kind === 'properties') {
    if (want && dock?.getState?.().hidden) dock.togglePanels?.();
    else dock?.toggleProperties?.();
  } else if (p.kind === 'section') {
    const sec = document.getElementById(p.section);
    if (!want) sec?.classList.add('collapsed');
    else {
      const st = dock?.getState?.() || {};
      if (st.hidden) dock.togglePanels?.();
      if (dock?.getState?.().propertiesHidden) dock.toggleProperties?.();
      if (sec) {
        sec.classList.remove('collapsed');
        if (isShown(sec)) {
          sec.scrollIntoView?.({ block: 'nearest' });
          sec.classList.add('vwin-flash');
          setTimeout(() => sec.classList.remove('vwin-flash'), 700);
        } else {
          (window.__visterasToast || (() => {}))(p.needs || `${p.label} options appear in Properties when an object is selected.`);
        }
      }
    }
  }
  updateWindowChecks();
  return isPanelOpen(id);
}

/** Wire the Window menu. Call after the dock, Paragraph and Pathfinder panels exist. */
export function mountWindowMenu() {
  if (typeof document === 'undefined') return null;
  if (window.__visterasWindowMenu) return window.__visterasWindowMenu;
  const mac = /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgentData?.platform || '');
  // Shortcut labels from the registry (Mac symbols / Windows words).
  for (const p of WINDOW_PANELS) {
    const item = document.getElementById(menuItemId(p.id));
    const span = item?.querySelector('.menu_dropdown_shortcut');
    if (span && p.shortcut) span.textContent = shortcutLabel(p, mac);
    if (item && p.unboundReason) item.title = `No shortcut: ${p.unboundReason}`;
    if (item && p.own) item.addEventListener('click', () => togglePanel(p.id));
  }
  window.addEventListener('keydown', (e) => {
    const id = windowShortcutPanel(e);
    if (!id) return;
    if (['input', 'textarea', 'select'].includes(document.activeElement?.tagName?.toLowerCase())) return;
    e.preventDefault();
    e.stopPropagation();
    togglePanel(id);
  }, true);

  // Checkmarks follow every open/close path: observe the panels themselves.
  let queued = false;
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; updateWindowChecks(); }); } };
  const watch = new MutationObserver(schedule);
  const targets = [
    document.getElementById('vdock_flyout'), document.getElementById('vdock'),
    document.querySelector('#container .svg_editor') || document.querySelector('.svg_editor'),
    document.getElementById('sidepanels'),
    ...WINDOW_PANELS.map((p) => document.getElementById(p.element || p.section || '')),
  ].filter(Boolean);
  for (const t of new Set(targets)) watch.observe(t, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  document.querySelector('#menu_window .menu_entry_title')?.addEventListener('pointerenter', updateWindowChecks);
  document.querySelector('#menu_window .menu_entry_title')?.addEventListener('mousedown', updateWindowChecks);
  const dock = window.__visterasDock;
  if (dock && !dock.__windowMenuHooked) {
    const prev = dock.updateWindowMenuCheckmarks;
    dock.updateWindowMenuCheckmarks = function (...a) { const r = prev?.apply(this, a); updateWindowChecks(); return r; };
    dock.__windowMenuHooked = true;
  }
  updateWindowChecks();
  window.__visterasWindowMenu = { panels: WINDOW_PANELS, isOpen: isPanelOpen, toggle: togglePanel, update: updateWindowChecks };
  return window.__visterasWindowMenu;
}
