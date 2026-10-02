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
 * The dialog and the dirty/beforeunload logic are the shared @visteras/ui ones
 * (lib/visteras-ui/dialog.js + dirty.js; dialog styled by lib/visteras-ui/ui.css
 * with Vector's --visteras-accent). Vector keeps its own .vvd save code in
 * index.html: the file embeds the name chosen in the save picker, so it does
 * not map 1:1 onto the kit's saveFile() yet.
 */
import { showUnsavedChangesDialog } from '../lib/visteras-ui/dialog.js';
import {
  hasAnyDirty as sharedHasAnyDirty,
  handleBeforeUnload as sharedHandleBeforeUnload,
  confirmCloseIfDirty as sharedConfirmCloseIfDirty,
} from '../lib/visteras-ui/dirty.js';

export { showUnsavedChangesDialog };

/** Vector's document models use a `dirty` flag (visteras-document-shell). */
const isVectorDocDirty = (d) => !!(d && d.dirty);

export function hasAnyDirty(documents) {
  return sharedHasAnyDirty(documents, isVectorDocDirty);
}

/** beforeunload handler body: prompts only when a tab has unsaved changes. */
export function handleBeforeUnload(e, documents) {
  return sharedHandleBeforeUnload(e, documents, isVectorDocDirty);
}

/** True when the tab may close: clean tabs close at once, dirty ones ask first. */
export async function confirmCloseIfDirty(docModel, ask = showUnsavedChangesDialog) {
  return sharedConfirmCloseIfDirty(docModel, ask, {
    isDirty: isVectorDocDirty,
    getTitle: (d) => d.title || 'Untitled',
  });
}
