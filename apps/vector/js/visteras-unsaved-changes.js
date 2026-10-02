/**
 * Visteras Vector — unsaved-changes protection (Studio parity).
 *
 * Documents live only in memory and in the .vvd/.svg files the user saves;
 * nothing is autosaved to browser storage. So:
 *   - leaving/refreshing warns only when at least one tab is dirty;
 *   - closing a dirty tab asks first, with Studio's "Unsaved Changes" dialog
 *     (title, "Close <b>name</b>? Unsaved changes will be lost.", Cancel/Close,
 *     Cancel focused);
 *   - saving a .vvd clears the tab's dirty flag (visteras-document-shell
 *     clearActiveDirty), which also silences the leave warning.
 *
 * SVG-Edit's own beforeunload (undo-stack based) is turned off with
 * no_save_warning: true in index.html: it cannot see the per-tab dirty state
 * and kept warning after a successful save.
 *
 * The dialog itself is the shared @visteras/ui one (lib/visteras-ui/dialog.js,
 * styled by lib/visteras-ui/ui.css with Vector's --visteras-accent).
 */
import { showUnsavedChangesDialog } from '../lib/visteras-ui/dialog.js';

export { showUnsavedChangesDialog };

export function hasAnyDirty(documents) {
  return Array.isArray(documents) && documents.some((d) => !!(d && d.dirty));
}

/** beforeunload handler body: prompts only when a tab has unsaved changes. */
export function handleBeforeUnload(e, documents) {
  if (!hasAnyDirty(documents)) return undefined;
  e.preventDefault();
  e.returnValue = '';
  return '';
}

/** True when the tab may close: clean tabs close at once, dirty ones ask first. */
export async function confirmCloseIfDirty(docModel, ask = showUnsavedChangesDialog) {
  if (!docModel || !docModel.dirty) return true;
  return !!(await ask(docModel.title || 'Untitled'));
}
