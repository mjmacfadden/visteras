import test from 'node:test';
import assert from 'node:assert/strict';
import { mountPenDrawingHistory } from '../js/visteras-pen-history.js';
function setup() {
  let drawn = null, result = {}, pointer = 0, grips = [], selected = [];
  const stack = [], objects = new Set();
  const parent = { append(path) { objects.add(path); path.isConnected = true; } };
  globalThis.document = { getElementById: () => null };
  const sc = {
    getMode: () => 'path', setMode() { sc.pathActions.clear(); },
    setDrawnPath(path) { drawn = path; }, clearSelection() { selected = []; }, selectOnly(elements) { selected = elements; }, call() {},
    getStyle: () => ({ opacity: 1 }),
    undoMgr: {
      getUndoStackSize: () => pointer, getRedoStackSize: () => stack.length - pointer,
      undo() { if (pointer) stack[--pointer].unapply(); },
      redo() { if (pointer < stack.length) stack[pointer++].apply(); },
    },
    addCommandToHistory(cmd) { stack.splice(pointer); stack.push(cmd); pointer++; },
    pathActions: {
      mouseUp: () => result,
      getDrawingState: () => drawn && ({ path: drawn, parent, d: drawn.d, control: drawn.control }),
      restoreDrawingState(state) {
        drawn = state?.path || null; grips = drawn ? [drawn] : [];
        if (state) { parent.append(drawn); drawn.d = state.d; drawn.control = state.control; }
      },
      clear() { drawn?.remove(); drawn = null; grips = []; },
    },
  };
  mountPenDrawingHistory(sc);
  return { sc, objects, get selected() { return selected; }, get drawn() { return drawn; }, get grips() { return grips; },
    make() { return { d: '', control: null, isConnected: false,
      getAttribute(name) { return this[name]; }, setAttribute(name, value) { this[name] = value; },
      remove() { objects.delete(this); this.isConnected = false; },
    }; },
    place(path, d, control = null) { parent.append(path); drawn = path; path.d = d; path.control = control; result = {}; sc.pathActions.mouseUp(); },
    close(path) { path.d += ' Z'; drawn = null; result = { element: path }; return sc.pathActions.mouseUp(); },
  };
}
test('two objects retain every anchor and closure in document undo/redo order', () => {
  const h = setup(), a = h.make(), b = h.make(), m = h.sc.undoMgr;
  h.place(a, 'M0 0', [10, 20]); h.place(a, 'M0 0 L50 50', [10, 20]); h.close(a);
  h.place(b, 'M100 100'); h.place(b, 'M100 100 L150 150'); h.close(b);
  assert.equal(m.getUndoStackSize(), 6);
  m.undo(); assert.equal(h.drawn, b); assert.equal(b.d, 'M100 100 L150 150');
  m.undo(); assert.equal(b.d, 'M100 100');
  m.undo(); assert.equal(h.objects.has(b), false); assert.deepEqual(h.grips, []);
  m.undo(); assert.equal(h.drawn, a); assert.equal(a.d, 'M0 0 L50 50');
  m.undo(); assert.equal(a.d, 'M0 0'); assert.deepEqual(a.control, [10, 20]);
  m.undo(); assert.equal(h.objects.size, 0); assert.deepEqual(h.grips, []);
  for (let i = 0; i < 6; i++) m.redo();
  assert.equal(h.objects.size, 2); assert.equal(a.d, 'M0 0 L50 50 Z');
  assert.equal(b.d, 'M100 100 L150 150 Z'); assert.deepEqual(h.grips, []);
  assert.equal(m.getUndoStackSize(), 6);
});
test('new anchor after undo truncates document redo without losing older object', () => {
  const h = setup(), a = h.make(), b = h.make(), m = h.sc.undoMgr;
  h.place(a, 'M0 0'); h.place(a, 'M0 0 L50 50'); h.close(a);
  h.place(b, 'M100 100'); h.place(b, 'M100 100 L150 150');
  m.undo(); h.place(b, 'M100 100 L200 200');
  assert.equal(m.getRedoStackSize(), 0);
  m.undo(); m.undo(); m.undo();
  assert.equal(a.d, 'M0 0 L50 50'); assert.equal(h.drawn, a);
});
test('finishing an open path or switching tools preserves its anchor history', () => {
  for (const finish of [h => h.sc.pathActions.finishDrawingHistory(h.drawn), h => h.sc.pathActions.clear()]) {
    const h = setup(), a = h.make(), m = h.sc.undoMgr;
    h.place(a, 'M0 0'); h.place(a, 'M0 0 C10 20 30 40 50 60', [10, 20]);
    finish(h); assert.equal(h.objects.has(a), true); assert.deepEqual(h.grips, []);
    m.undo(); assert.equal(h.drawn, a); assert.deepEqual(a.control, [10, 20]);
    m.undo(); assert.equal(a.d, 'M0 0');
    m.undo(); assert.equal(h.objects.size, 0);
  }
});


test('closing selects the finished object; undo reopens it and redo selects it again', () => {
  const h = setup(), path = h.make();
  h.place(path, 'M0 0'); h.place(path, 'M0 0 L50 50');
  h.close(path);
  assert.deepEqual(h.selected, [path]);
  assert.equal(h.drawn, null);
  assert.deepEqual(h.grips, []);
  h.sc.undoMgr.undo();
  assert.equal(h.drawn, path);
  assert.deepEqual(h.selected, []);
  h.sc.undoMgr.redo();
  assert.deepEqual(h.selected, [path]);
  assert.equal(h.drawn, null);
});
