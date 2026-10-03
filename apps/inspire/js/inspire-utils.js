/**
 * Visteras Inspire — small pure helpers shared by the app (kept DOM-free so they are unit-testable).
 */

import { safeFileBase as sharedSafeFileBase } from '../lib/visteras-ui/file.js';

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
 * Shared rule from @visteras/ui (lib/visteras-ui/file.js), minus a trailing .vid.
 */
export function safeFileBase(name, fallback = 'Untitled') {
  return sharedSafeFileBase(name, fallback, { stripExtensions: ['vid'] });
}

/** The exact .vid file name a save will download. The tab shows this same name. */
export function safeVidFileName(name, fallback = 'Untitled') {
  return `${safeFileBase(name, fallback)}.vid`;
}

const GEOMETRY_KEYS = ['x', 'y', 'width', 'height', 'rotation'];

/**
 * True when a transform actually changed something. `before` are the snapshots
 * taken in startTransform (shallow copies, data copied one level), `after` the live
 * elements. A click with no movement returns false, so it records no history.
 */
export function transformChanged(before = [], after = []) {
  if (before.length !== after.length) return true;
  const byId = new Map(after.map((el) => [el.id, el]));
  for (const init of before) {
    const cur = byId.get(init.id);
    if (!cur) return true;
    for (const k of GEOMETRY_KEYS) {
      if ((init[k] ?? 0) !== (cur[k] ?? 0)) return true;
    }
    const a = init.data || {};
    const b = cur.data || {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (a[k] !== b[k]) return true;
    }
  }
  return false;
}
