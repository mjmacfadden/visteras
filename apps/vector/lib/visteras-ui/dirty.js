/* @visteras/ui — generated from packages/ui/src/dirty.js by packages/ui/scripts/build-static.mjs — do not edit by hand */
/**
 * @visteras/ui — dirty-state + beforeunload tracking (Studio parity).
 *
 * Studio: base-documents.js has_any_dirty() + base-gui.js beforeunload, a
 * successful save sets is_dirty = false, closing a dirty tab asks with the
 * Unsaved Changes dialog. Apps name the flag differently (Studio `is_dirty`,
 * Inspire `isDirty`, Vector `dirty`); the default reader accepts all three and
 * every helper takes an `isDirty(doc)` override.
 */
import { showUnsavedChangesDialog } from './dialog.js';

export const defaultIsDirty = (d) => !!(d && (d.dirty || d.isDirty || d.is_dirty));

export function hasAnyDirty(documents, isDirty = defaultIsDirty) {
  return Array.isArray(documents) && documents.some((d) => isDirty(d));
}

/** beforeunload body: prompt only when some document is dirty. */
export function handleBeforeUnload(e, documents, isDirty = defaultIsDirty) {
  if (!hasAnyDirty(documents, isDirty)) return undefined;
  e.preventDefault();
  e.returnValue = '';
  return '';
}

/**
 * Installs the leave/refresh guard. `getDocuments` is read at unload time.
 * Returns an uninstall function.
 */
export function installBeforeUnloadGuard(getDocuments, {
  target = (typeof window !== 'undefined' ? window : null),
  isDirty = defaultIsDirty,
} = {}) {
  if (!target) return () => {};
  const handler = (e) => handleBeforeUnload(e, getDocuments(), isDirty);
  target.addEventListener('beforeunload', handler);
  return () => target.removeEventListener('beforeunload', handler);
}

export function markDirty(model, field = 'dirty') {
  if (model) model[field] = true;
  return model;
}

export function markClean(model, field = 'dirty') {
  if (model) model[field] = false;
  return model;
}

export const defaultDocTitle = (d) => (d && (d.fileName || d.title)) || 'Untitled';

/** True when the tab may close: clean tabs close at once, dirty ones ask first. */
export async function confirmCloseIfDirty(model, ask = showUnsavedChangesDialog, {
  isDirty = defaultIsDirty,
  getTitle = defaultDocTitle,
} = {}) {
  if (!model || !isDirty(model)) return true;
  return !!(await ask(getTitle(model)));
}
