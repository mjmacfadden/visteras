/** Native-file snapshots and asynchronous save completion, independent of the UI.
 * Revision and generation are session-only; neither belongs in the VVD format.
 */
export function recordDocumentChange(doc) {
  doc.revision = (doc.revision || 0) + 1;
  doc.dirty = true;
  doc.isStartupDefault = false;
}

/** Invalidate pending saves when an existing tab is reused for a new document. */
export function replaceDocumentSession(doc) {
  doc.saveGeneration = (doc.saveGeneration || 0) + 1;
  doc.revision = 0;
}

export function captureDocumentSnapshot(doc, { svg, width, height, unit }) {
  // Copy nested metadata now, before a picker, thumbnail or disk write can yield.
  const payload = JSON.parse(JSON.stringify({
    $schema: 'visteras-vector-document-v1', version: 1, app: 'visteras-vector',
    exportedAt: new Date().toISOString(), title: doc.title,
    width, height, unit, svg,
    rasterEffects: doc.rasterEffects || undefined,
    artboards: doc.artboards, activeArtboardId: doc.activeArtboardId,
  }));
  return { documentId: doc.id, generation: doc.saveGeneration || 0,
    revision: doc.revision || 0, payload };
}

export function serializeDocumentSnapshot(snapshot, title, thumbnail) {
  return JSON.stringify({ ...snapshot.payload, title, thumbnail }, null, 2);
}

export function applyDocumentSave(documents, snapshot, result, title) {
  if (result.cancelled) return null;
  const doc = documents.find(d => d.id === snapshot.documentId);
  if (!doc || (doc.saveGeneration || 0) !== snapshot.generation) return null;
  doc.title = title;
  doc.fileHandle = result.handle || null;
  // A successful older save still provides a handle, but newer edits stay dirty.
  if ((doc.revision || 0) === snapshot.revision) doc.dirty = false;
  return doc;
}

/** One pending write per document prevents overlapping saves completing out of
 * order. Different documents remain independently saveable. Invoke write before
 * awaiting anything to preserve the browser's file-picker user activation.
 */
export function createDocumentSaveQueue() {
  const pending = new WeakSet();
  return {
    async run(doc, write) {
      if (pending.has(doc)) return { busy: true };
      pending.add(doc);
      try { return await write(); } finally { pending.delete(doc); }
    },
  };
}
