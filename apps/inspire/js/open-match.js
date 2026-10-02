/**
 * Visteras Inspire — decide what "Open" does when a tab with the same name/title/id is already open.
 *
 * Studio always opens a file into a new tab (unless the active tab is pristine). Inspire keeps
 * one convenience: if the open tab already holds exactly the same content, just switch to it.
 * Anything else (different file with the same name, newer copy of the same board, or an open
 * tab with edits) opens as a new tab, so nothing on disk is ever hidden behind a stale tab.
 */
import { InspireDocument } from './document.js';
import { BoardComposer } from './board-composer.js';
import { SwipeFileManager } from './swipe-file.js';

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Content fingerprint of serialized board + swipe file (meta/timestamps ignored). */
function fingerprintSerialized(serialized) {
  return stableStringify({ board: serialized.board, swipeFile: serialized.swipeFile });
}

/** Fingerprint of an open document model (its current, possibly edited, content). */
export function modelContentFingerprint(model) {
  return fingerprintSerialized(model.doc.serialize(model.board, model.swipeFile));
}

/** Fingerprint of .vid data, normalized through the same classes an open tab uses. */
export function vidContentFingerprint(docData) {
  const doc = new InspireDocument(docData.board || {});
  const board = new BoardComposer(docData.board?.elements || [], docData.board?.customLayoutSnapshot || null, doc);
  const swipe = new SwipeFileManager(docData.swipeFile || null);
  return fingerprintSerialized(doc.serialize(board, swipe));
}

/**
 * Returns { action: 'switch', model } when an open tab with a matching name/title/id has
 * identical content, otherwise { action: 'new', sameNameOpen }.
 */
export function resolveOpenTarget(documents, docData, { fileName, title } = {}) {
  const candidates = (documents || []).filter((d) =>
    (fileName && d.fileName === fileName) || (title && d.title === title) || (docData?.meta?.id && d.id === docData.meta.id));
  if (!candidates.length) return { action: 'new', sameNameOpen: false };
  const incoming = vidContentFingerprint(docData);
  const same = candidates.find((d) => modelContentFingerprint(d) === incoming);
  return same ? { action: 'switch', model: same } : { action: 'new', sameNameOpen: true };
}
