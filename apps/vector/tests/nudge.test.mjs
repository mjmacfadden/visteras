import test from 'node:test';
import assert from 'node:assert/strict';
import { nudgeDelta, isTypingTarget, NUDGE_KEYS } from '../js/visteras-nudge.js';

test('nudge: arrows move 1, Shift 10, in document units', () => {
  assert.deepEqual(nudgeDelta({ key: 'ArrowRight' }), { dx: 1, dy: 0 });
  assert.deepEqual(nudgeDelta({ key: 'ArrowLeft' }), { dx: -1, dy: 0 });
  assert.deepEqual(nudgeDelta({ key: 'ArrowUp' }), { dx: 0, dy: -1 });
  assert.deepEqual(nudgeDelta({ key: 'ArrowDown', shiftKey: true }), { dx: 0, dy: 10 });
  assert.deepEqual(nudgeDelta({ key: 'ArrowLeft', shiftKey: true }), { dx: -10, dy: 0 });
  assert.deepEqual(Object.keys(NUDGE_KEYS).sort(), ['arrowdown', 'arrowleft', 'arrowright', 'arrowup']);
});
test('nudge: grid snapping uses the snapping step', () => {
  assert.deepEqual(nudgeDelta({ key: 'ArrowRight' }, 5), { dx: 5, dy: 0 });
  assert.deepEqual(nudgeDelta({ key: 'ArrowUp', shiftKey: true }, 5), { dx: 0, dy: -50 });
  assert.deepEqual(nudgeDelta({ key: 'ArrowRight' }, 0), { dx: 1, dy: 0 });
});
test('nudge: modifiers other than Shift and non-arrow keys do nothing', () => {
  for (const m of ['altKey', 'metaKey', 'ctrlKey']) assert.equal(nudgeDelta({ key: 'ArrowRight', [m]: true }), null);
  for (const key of ['a', 'Enter', 'Tab', '', undefined]) assert.equal(nudgeDelta({ key }), null);
  assert.equal(nudgeDelta(), null);
});
test('nudge: never while typing in inputs, textareas, selects or editables', () => {
  const ev = (...path) => ({ composedPath: () => path, target: path[0] });
  assert.equal(isTypingTarget(ev({ nodeName: 'INPUT' }, { nodeName: 'BODY' })), true);
  assert.equal(isTypingTarget(ev({ nodeName: 'TEXTAREA' })), true);
  assert.equal(isTypingTarget(ev({ nodeName: 'SELECT' })), true);
  assert.equal(isTypingTarget(ev({ nodeName: 'SPAN', isContentEditable: true })), true);
  // Shadow-DOM inputs (se-spin-input) are found via composedPath.
  assert.equal(isTypingTarget(ev({ nodeName: 'INPUT' }, { nodeName: 'SE-SPIN-INPUT' }, { nodeName: 'BODY' })), true);
  assert.equal(isTypingTarget({ isComposing: true, composedPath: () => [] }), true);
  assert.equal(isTypingTarget(ev({ nodeName: 'BODY' })), false);
  assert.equal(isTypingTarget({ target: { nodeName: 'DIV' } }), false);
  assert.equal(isTypingTarget(null), false);
});
