/** Every anchor and completion belongs to the document's shared undo stack. */
export function mountPenDrawingHistory(sc) {
  const actions = sc.pathActions;
  const snapshots = new WeakMap();
  let replaying = false;
  function refresh() {
    for (const [id, size] of [['tool_undo', sc.undoMgr.getUndoStackSize()], ['tool_redo', sc.undoMgr.getRedoStackSize()]]) {
      const button = document.getElementById(id);
      if (button) button.disabled = size === 0;
    }
  }
  function restore(path, state) {
    replaying = true;
    try {
      // Clear drawing UI without deleting a different object in the document.
      sc.setDrawnPath(null);
      actions.restoreDrawingState(null);
      sc.clearSelection();
      if (!state) path.remove();
      else {
        if (!path.isConnected) state.parent.append(path);
        path.setAttribute('d', state.d);
        path.setAttribute('opacity', state.finished ? state.opacity : state.opacity / 2);
        path.setAttribute('style', 'pointer-events:inherit');
        if (!state.finished) {
          sc.setMode('path');
          actions.restoreDrawingState(state);
        }
      }
      snapshots.set(path, state);
      sc.call('changed', [path]);
      if (state?.finished) sc.selectOnly([path], true);
      refresh();
    } finally { replaying = false; }
  }
  function record(state, text) {
    const path = state.path, before = snapshots.get(path) || null;
    const after = { ...state, opacity: state.opacity ?? sc.getStyle().opacity };
    if (before && before.d === after.d && before.finished === after.finished &&
        JSON.stringify(before.control) === JSON.stringify(after.control)) return;
    snapshots.set(path, after);
    sc.addCommandToHistory({
      getText: () => text,
      type: () => 'PenDrawingCommand',
      elements: () => [path],
      apply: () => restore(path, after),
      unapply: () => restore(path, before),
    });
    refresh();
  }
  actions.finishDrawingHistory = path => {
    const before = snapshots.get(path);
    if (!before) return false;
    const state = { ...before, d: path.getAttribute('d'), finished: true };
    record(state, 'Finish path');
    restore(path, state);
    return true;
  };
  const mouseUp = actions.mouseUp;
  actions.mouseUp = function (...args) {
    const result = mouseUp.apply(this, args);
    const state = sc.getMode() === 'path' ? actions.getDrawingState() : null;
    if (state) record(state, 'Add anchor point');
    else if (result?.element && snapshots.has(result.element)) {
      actions.finishDrawingHistory(result.element);
      // Avoid SVG-Edit's delayed whole-object insertion and stale grip cleanup.
      return { ...result, element: null };
    }
    return result;
  };
  const clear = actions.clear;
  actions.clear = function (...args) {
    const state = !replaying && actions.getDrawingState();
    if (state && snapshots.has(state.path)) actions.finishDrawingHistory(state.path);
    return clear.apply(this, args);
  };
}
