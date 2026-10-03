/**
 * @visteras/ui — shared UI kit for the Visteras apps.
 * Studio imports it through the webpack alias '@visteras/ui'; the static apps
 * (Vector, Inspire, Collage) load the generated copy under lib/visteras-ui/.
 */
export { escapeHtml } from './escape.js';
export { showToast, TOAST_TYPES } from './toast.js';
export { showConfirmDialog, showUnsavedChangesDialog } from './dialog.js';
export {
  ILLEGAL_FILENAME_CHARS, MAX_FILE_BASE_LENGTH, safeFileBase, safeFileName, fileBaseFromName, downloadBlob, saveFile,
  openFile, ensureWritePermission, isSameFileHandle, findBySameHandle,
} from './file.js';
export {
  defaultIsDirty, hasAnyDirty, handleBeforeUnload, installBeforeUnloadGuard, markDirty, markClean, defaultDocTitle, confirmCloseIfDirty,
} from './dirty.js';
