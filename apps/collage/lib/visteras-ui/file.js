/* @visteras/ui — generated from packages/ui/src/file.js by packages/ui/scripts/build-static.mjs — do not edit by hand */
/**
 * @visteras/ui — file helper: Studio-style file names + save with the File System
 * Access picker and a download fallback.
 *
 * Name rules (Studio's behaviour, already used by Inspire): keep spaces, dots and
 * Unicode; replace only characters that are illegal in macOS/Windows/Linux file
 * names (\ / : * ? " < > | and control chars) with "_"; collapse whitespace;
 * drop leading dots and trailing dots/spaces; cap at 200 chars; empty → fallback.
 *
 * Save flow (Studio save_locally / Vector .vvd save):
 *   1. existing handle → write in place (silent ⌘S);
 *   2. else showSaveFilePicker → write, return the new handle (tab takes its name);
 *      AbortError (user cancelled) → { cancelled: true }, nothing else happens;
 *   3. picker missing or failing → download via <a download>.
 */

export const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;
export const MAX_FILE_BASE_LENGTH = 200;

function stripExt(name, exts) {
  if (!exts || !exts.length) return name;
  const re = new RegExp(`\\.(?:${exts.map((e) => String(e).replace(/^\./, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`, 'i');
  return name.replace(re, '');
}

/**
 * Download-safe base name (no extension).
 * @param {string} name
 * @param {string} [fallback='Untitled']
 * @param {{ stripExtensions?: string[] }} [opts] extensions to drop first, e.g. ['vid']
 */
export function safeFileBase(name, fallback = 'Untitled', { stripExtensions = [] } = {}) {
  let base = stripExt(String(name ?? ''), stripExtensions)
    .replace(ILLEGAL_FILENAME_CHARS, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');
  if (!base) base = fallback;
  return base.slice(0, MAX_FILE_BASE_LENGTH);
}

/** `<safe base>.<ext>`; an existing `.<ext>` on the name is not doubled. */
export function safeFileName(name, ext, fallback = 'Untitled') {
  const clean = String(ext || '').replace(/^\./, '');
  const base = safeFileBase(name, fallback, { stripExtensions: clean ? [clean] : [] });
  return clean ? `${base}.${clean}` : base;
}

/** Base name of a saved file (drops the given extensions). */
export function fileBaseFromName(fileName, exts = []) {
  return stripExt(String(fileName ?? ''), exts);
}

function toBlob(data, mimeType) {
  if (typeof Blob !== 'undefined' && data instanceof Blob) return data;
  return new Blob([data], { type: mimeType || 'application/octet-stream' });
}

/** Trigger a browser download. Returns the file name used. */
export function downloadBlob(data, fileName, {
  mimeType = 'application/octet-stream',
  doc = (typeof document !== 'undefined' ? document : null),
  urlApi = (typeof URL !== 'undefined' ? URL : null),
  revokeAfterMs = 100,
} = {}) {
  if (!doc || !urlApi) throw new Error('Download is not available in this environment');
  const blob = toBlob(data, mimeType);
  const url = urlApi.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = fileName;
  doc.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      if (typeof a.remove === 'function') a.remove();
      else doc.body.removeChild(a);
    } catch { /* already detached */ }
    urlApi.revokeObjectURL(url);
  }, revokeAfterMs);
  return fileName;
}

async function writeToHandle(handle, blob) {
  const writable = await handle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }
}

/**
 * Save data to disk.
 * @param {object} opts
 * @param {Blob|string} opts.data
 * @param {string} opts.fileName                suggested name incl. extension
 * @param {string} [opts.mimeType]
 * @param {Array}  [opts.types]                 showSaveFilePicker `types`
 * @param {FileSystemFileHandle|null} [opts.handle] write here first (plain Save)
 * @param {boolean} [opts.usePicker=true]       false → straight to download
 * @param {Window} [opts.win] @param {Document} [opts.doc] (tests)
 * @returns {Promise<{ method: 'handle'|'picker'|'download', name: string, handle: any }|{ cancelled: true }>}
 */
export async function saveFile({
  data,
  fileName,
  mimeType = 'application/octet-stream',
  types,
  handle = null,
  usePicker = true,
  win = (typeof window !== 'undefined' ? window : null),
  doc = (typeof document !== 'undefined' ? document : null),
  onWarn = (msg, err) => { if (typeof console !== 'undefined') console.warn(msg, err); },
} = {}) {
  const blob = toBlob(data, mimeType);

  if (handle && typeof handle.createWritable === 'function') {
    try {
      await writeToHandle(handle, blob);
      return { method: 'handle', name: handle.name || fileName, handle };
    } catch (err) {
      onWarn('Writing to the open file failed, asking where to save:', err);
    }
  }

  if (usePicker && win && typeof win.showSaveFilePicker === 'function') {
    try {
      const opts = { suggestedName: fileName };
      if (types) opts.types = types;
      const newHandle = await win.showSaveFilePicker(opts);
      await writeToHandle(newHandle, blob);
      return { method: 'picker', name: newHandle.name || fileName, handle: newHandle };
    } catch (err) {
      if (err && err.name === 'AbortError') return { cancelled: true };
      onWarn('Save picker failed, downloading instead:', err);
    }
  }

  downloadBlob(blob, fileName, { mimeType, doc });
  return { method: 'download', name: fileName, handle: null };
}
