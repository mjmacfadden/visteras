/**
 * Visteras Inspire — Unsaved-changes protection (mirrors Studio).
 *
 * Studio reference (apps/studio/src/js/core):
 *   - base-documents.js render_tabs(): `document_tab dirty` class + " •" after the title
 *   - base-documents.js close_document(): "Unsaved Changes" confirm, Close / Cancel, Cancel focused
 *   - base-documents.js has_any_dirty() + base-gui.js beforeunload handler
 *   - modules/file/save.js: a successful save sets is_dirty = false
 *
 * Inspire saves documents only as .vid files. Nothing is written to browser storage.
 */

/** Keys older Inspire builds used to persist whole documents. Cleared on every load. */
export const STALE_DOCUMENT_STORAGE_KEYS = Object.freeze({
  local: Object.freeze(['visteras_inspire_current_doc', 'visteras_inspire_open_docs']),
  session: Object.freeze(['visteras_inspire_session_state'])
});

/**
 * Removes stale document snapshots left by the old autosave. Non-document keys are untouched.
 * Returns the keys that were actually present and removed.
 */
export function clearStaleDocumentStorage(local, session) {
  const cleared = [];
  const sweep = (store, keys, label) => {
    if (!store) return;
    for (const key of keys) {
      try {
        if (store.getItem(key) !== null) cleared.push(`${label}:${key}`);
        store.removeItem(key);
      } catch (_) {
        // Storage can throw (private mode, disabled cookies); never block startup.
      }
    }
  };
  sweep(local, STALE_DOCUMENT_STORAGE_KEYS.local, 'localStorage');
  sweep(session, STALE_DOCUMENT_STORAGE_KEYS.session, 'sessionStorage');
  return cleared;
}

/**
 * Board events that change document content. Selection changes alone are not edits, and
 * neither is the 'Initial state' history snapshot taken when a board is created or attached.
 */
const NON_EDIT_BOARD_EVENTS = new Set(['selection']);
const NON_EDIT_HISTORY_LABELS = new Set(['Initial state']);

export function isEditEvent(evt) {
  if (!evt) return true;
  if (NON_EDIT_BOARD_EVENTS.has(evt.type)) return false;
  if (evt.type === 'history' && NON_EDIT_HISTORY_LABELS.has(evt.label)) return false;
  return true;
}

/**
 * Wires a document model's board + swipe file so real edits mark it dirty.
 * `onChange(model)` runs after the flag flips (re-render tabs etc).
 */
export function trackDirty(model, { onChange } = {}) {
  const mark = () => {
    model.isDirty = true;
    if (onChange) onChange(model);
  };
  const unsubs = [];
  if (model.board?.subscribe) {
    unsubs.push(model.board.subscribe((evt) => {
      if (isEditEvent(evt)) mark();
    }));
  }
  if (model.swipeFile?.subscribe) {
    unsubs.push(model.swipeFile.subscribe(() => mark()));
  }
  return () => unsubs.forEach((u) => u && u());
}

export function markSaved(model) {
  if (model) model.isDirty = false;
  return model;
}

export function hasAnyDirty(documents) {
  return Array.isArray(documents) && documents.some((d) => d && d.isDirty);
}

/** Same contract as Studio's beforeunload handler: only prompt when a document is dirty. */
export function handleBeforeUnload(e, documents) {
  if (!hasAnyDirty(documents)) return undefined;
  e.preventDefault();
  e.returnValue = '';
  return '';
}

// Dialog + escaping come from the shared kit (packages/ui → lib/visteras-ui).
export { escapeHtml, showUnsavedChangesDialog } from '../lib/visteras-ui/dialog.js';
import { showUnsavedChangesDialog } from '../lib/visteras-ui/dialog.js';

/** Returns true when the tab may close: clean tabs close immediately, dirty ones ask first. */
export async function confirmCloseIfDirty(model, ask = showUnsavedChangesDialog) {
  if (!model || !model.isDirty) return true;
  return !!(await ask(model.fileName || model.title || 'Untitled'));
}
