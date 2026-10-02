/**
 * Visteras Inspire — small pure helpers shared by the app (kept DOM-free so they are unit-testable).
 */

/** Status-bar zoom % that never touches a canvas that hasn't been created yet. */
export function zoomPercent(extra = {}, canvas = null) {
  if (extra && Number.isFinite(extra.zoom)) return extra.zoom;
  if (canvas && Number.isFinite(canvas.zoom)) return Math.round(canvas.zoom * 100);
  return 100;
}

const isValidDate = (v) => typeof v === 'string' && v.length > 0 && !Number.isNaN(Date.parse(v));

/**
 * Carries a .vid file's original timestamps onto the in-memory document so that
 * re-saving keeps the board's real `created` date (serialize() refreshes `modified`).
 */
export function applyFileMeta(docInstance, meta) {
  if (!docInstance || !meta) return docInstance;
  if (isValidDate(meta.created)) docInstance.created = meta.created;
  if (isValidDate(meta.modified)) docInstance.modified = meta.modified;
  return docInstance;
}

/**
 * Download-safe base name: keeps spaces, dots and Unicode like Studio does, and only
 * replaces characters that are illegal in macOS/Windows/Linux file names.
 */
export function safeFileBase(name, fallback = 'Untitled') {
  let base = String(name ?? '')
    .replace(/\.vid$/i, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');
  if (!base) base = fallback;
  return base.slice(0, 200);
}

/** The exact .vid file name a save will download. The tab shows this same name. */
export function safeVidFileName(name, fallback = 'Untitled') {
  return `${safeFileBase(name, fallback)}.vid`;
}
