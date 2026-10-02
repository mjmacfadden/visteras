/**
 * @visteras/ui — shared UI kit for the Visteras apps.
 * Studio imports it through the webpack alias '@visteras/ui'; the static apps
 * (Vector, Inspire, Collage) load the generated copy under lib/visteras-ui/.
 */
export { escapeHtml } from './escape.js';
export { showToast, TOAST_TYPES } from './toast.js';
export { showConfirmDialog, showUnsavedChangesDialog } from './dialog.js';
