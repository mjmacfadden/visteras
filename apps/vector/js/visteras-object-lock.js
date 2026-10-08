/**
 * Visteras Vector — Object ▸ Lock / Unlock All (⌃⌘2 / ⌃⌥⌘2) and Hide / Show All
 * (⌃⌘3 / ⌃⌥⌘3). Browser-safe (bare ⌘2/3 switch Chrome tabs). Reuses data-visteras-locked (Layers panel
 * lock icon) so canvas picking already ignores locked objects. Unlock All
 * unlocks every locked object and selects them. Undoable.
 */

import { eventMatchesChord } from './visteras-browser-shortcuts.js';

export const LOCK_ATTR = 'data-visteras-locked';
export const HIDE_ATTR = 'data-visteras-hidden';
export const POINTER_SAVE = 'data-visteras-pointer-events';

export const isLocked = (el) => el?.getAttribute?.(LOCK_ATTR) === '1';
export const isHidden = (el) => el?.getAttribute?.(HIDE_ATTR) === '1' || el?.getAttribute?.('display') === 'none';

export function hasLockedAncestor(el, root) {
  for (let n = el; n && n !== root; n = n.parentNode) if (isLocked(n)) return true;
  return false;
}

/** Artwork candidates under #svgcontent (skip defs / guides / helper layers). */
export function artworkElements(content) {
  if (!content) return [];
  const out = [];
  for (const layer of content.querySelectorAll(':scope > g.layer')) {
    if (layer.getAttribute('display') === 'none') continue;
    for (const el of layer.querySelectorAll(':scope > *')) {
      if (['title', 'defs', 'desc', 'metadata'].includes(el.localName)) continue;
      if (el.id === 'visteras_ruler_guides' || el.classList?.contains?.('visteras-guides-layer')) continue;
      out.push(el);
    }
  }
  return out;
}

/** Snapshot attrs before a lock/hide write (for ChangeElementCommand). */
export function lockSnapshot(el) {
  return {
    [LOCK_ATTR]: el.getAttribute(LOCK_ATTR),
    'pointer-events': el.getAttribute('pointer-events'),
    [POINTER_SAVE]: el.getAttribute(POINTER_SAVE),
  };
}

export function hideSnapshot(el) {
  return {
    [HIDE_ATTR]: el.getAttribute(HIDE_ATTR),
    display: el.getAttribute('display'),
  };
}

/** Apply lock=true/false; returns the "before" attrs if something changed. */
export function writeLock(el, locked) {
  const before = lockSnapshot(el);
  if (locked) {
    if (before[LOCK_ATTR] !== '1') {
      if (before['pointer-events'] != null && before[POINTER_SAVE] == null) {
        el.setAttribute(POINTER_SAVE, before['pointer-events']);
      }
      el.setAttribute(LOCK_ATTR, '1');
      el.setAttribute('pointer-events', 'none');
    }
  } else {
    el.removeAttribute(LOCK_ATTR);
    const saved = el.getAttribute(POINTER_SAVE);
    if (saved == null) el.removeAttribute('pointer-events');
    else el.setAttribute('pointer-events', saved);
    el.removeAttribute(POINTER_SAVE);
  }
  const after = lockSnapshot(el);
  if (Object.keys(before).every((k) => before[k] === after[k])) return null;
  return before;
}

export function writeHide(el, hidden) {
  const before = hideSnapshot(el);
  if (hidden) {
    el.setAttribute(HIDE_ATTR, '1');
    el.setAttribute('display', 'none');
  } else {
    el.removeAttribute(HIDE_ATTR);
    // Only clear display when we hid it; don't reveal layers the user hid elsewhere.
    if (before[HIDE_ATTR] === '1' || before.display === 'none') el.removeAttribute('display');
  }
  const after = hideSnapshot(el);
  if (Object.keys(before).every((k) => before[k] === after[k])) return null;
  return before;
}

function batch(sc, elements, write, label) {
  const { BatchCommand, ChangeElementCommand } = sc?.history || {};
  const batchCmd = BatchCommand ? new BatchCommand(label) : null;
  const changed = [];
  for (const el of elements || []) {
    if (!el?.getAttribute) continue;
    const before = write(el);
    if (!before) continue;
    if (batchCmd && ChangeElementCommand) batchCmd.addSubCommand(new ChangeElementCommand(el, before));
    changed.push(el);
  }
  if (batchCmd && changed.length) sc.addCommandToHistory?.(batchCmd);
  if (changed.length) sc.call?.('changed', changed);
  return changed;
}

export function lockSelection(sc, elements) {
  const targets = (elements || []).filter((el) => el && !isLocked(el));
  const changed = batch(sc, targets, (el) => writeLock(el, true), 'Lock Selection');
  if (changed.length) sc.clearSelection?.();
  return changed;
}

/** Unlock every locked object in the document and select them (Illustrator). */
export function unlockAll(sc, content = sc?.getSvgContent?.()) {
  const locked = artworkElements(content).filter(isLocked);
  const changed = batch(sc, locked, (el) => writeLock(el, false), 'Unlock All');
  if (changed.length) {
    sc.clearSelection?.();
    sc.addToSelection?.(changed);
  }
  return changed;
}

export function hideSelection(sc, elements) {
  const targets = (elements || []).filter((el) => el && !isHidden(el));
  const changed = batch(sc, targets, (el) => writeHide(el, true), 'Hide Selection');
  if (changed.length) sc.clearSelection?.();
  return changed;
}

export function showAll(sc, content = sc?.getSvgContent?.()) {
  const hidden = artworkElements(content).filter((el) => el.getAttribute(HIDE_ATTR) === '1');
  const changed = batch(sc, hidden, (el) => writeHide(el, false), 'Show All');
  if (changed.length) {
    sc.clearSelection?.();
    sc.addToSelection?.(changed);
  }
  return changed;
}

export function mountObjectLock(editor) {
  const sc = editor?.svgCanvas;
  if (!sc || window.__visterasObjectLock) return window.__visterasObjectLock || null;

  const selected = () => (sc.getSelectedElements?.() || []).filter(Boolean);

  const onLock = () => lockSelection(sc, selected());
  const onUnlock = () => unlockAll(sc);
  const onHide = () => hideSelection(sc, selected());
  const onShow = () => showAll(sc);

  document.getElementById('action_lock_selection')?.addEventListener('click', onLock);
  document.getElementById('action_unlock_all')?.addEventListener('click', onUnlock);
  document.getElementById('action_hide_selection')?.addEventListener('click', onHide);
  document.getElementById('action_show_all')?.addEventListener('click', onShow);

  document.addEventListener('keydown', (e) => {
    if (['input', 'textarea', 'select'].includes(document.activeElement?.tagName?.toLowerCase())) return;
    if (eventMatchesChord(e, { meta: true, key: '2' })) {
      e.preventDefault(); e.stopImmediatePropagation();
      onLock();
      return;
    }
    if (eventMatchesChord(e, { meta: true, alt: true, key: '2' })) {
      e.preventDefault(); e.stopImmediatePropagation();
      onUnlock();
      return;
    }
    if (eventMatchesChord(e, { meta: true, key: '3' })) {
      e.preventDefault(); e.stopImmediatePropagation();
      onHide();
      return;
    }
    if (eventMatchesChord(e, { meta: true, alt: true, key: '3' })) {
      e.preventDefault(); e.stopImmediatePropagation();
      onShow();
    }
  }, true);

  window.__visterasObjectLock = { lockSelection, unlockAll, hideSelection, showAll, isLocked, LOCK_ATTR };
  return window.__visterasObjectLock;
}
