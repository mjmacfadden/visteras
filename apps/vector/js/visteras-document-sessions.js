/** SVGEdit commands reference live nodes, including detached nodes for redo.
 * Keep each document's exact SVG tree, Drawing (layer/ID allocation), and native
 * history together. Only the active tree is attached to the shared pasteboard.
 * All SVGEdit internal field access for this swap is confined to this adapter.
 */
export function createDocumentSessions(sc) {
  const sessions = new Map();
  const historyKeys = ['undoStack', 'undoStackPointer', 'undoableChangeStack', 'undoChangeStackPointer'];
  function suspend(doc) {
    const content = sc.getSvgContent();
    sessions.set(doc.id, {
      content, drawing: sc.getCurrentDrawing(), width: sc.contentW, height: sc.contentH,
      zoom: sc.getZoom(),
      history: Object.fromEntries(historyKeys.map(key => [key, sc.undoMgr[key]])),
      removedElements: sc.removedElements, importIds: sc.importIds,
    });
    // clear()/setSvgString() must never mutate a suspended document's tree.
    const empty = content.cloneNode(false);
    content.replaceWith(empty);
    sc.setSvgContent(empty);
    Object.assign(sc.undoMgr, {undoStack: [], undoStackPointer: 0, undoableChangeStack: [], undoChangeStackPointer: -1});
    sc.removedElements = {}; sc.importIds = {};
  }
  function restore(doc) {
    const session = sessions.get(doc.id);
    if (!session) return false;
    sc.getSvgContent().replaceWith(session.content);
    sc.setSvgContent(session.content);
    sc.current_drawing_ = session.drawing;
    sc.contentW = session.width; sc.contentH = session.height;
    sc.removedElements = session.removedElements; sc.importIds = session.importIds;
    Object.assign(sc.undoMgr, session.history);
    sc.setZoom(session.zoom);
    sc.selectorManager.initGroup();
    sc.rubberBox = sc.selectorManager.getRubberBandBox();
    sessions.delete(doc.id); // active state belongs to the engine until suspended
    return true;
  }
  return { suspend, restore, discard: doc => sessions.delete(doc.id) };
}
