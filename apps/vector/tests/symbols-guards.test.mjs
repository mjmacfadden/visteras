/** gravit-gap-5 item 5: path-op guards (Break Link & Continue) + stroke-link exclusion. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GUARDED_ACTIONS, GUARD_MESSAGE, selectionInstances, mergeHistorySince, labelOf } from '../js/visteras-symbol-guards.js';

test('every path-op entry point from the spec is guarded', () => {
  for (const id of ['action_offset_path', 'action_outline_stroke', 'action_create_outlines', 'action_compound_make', 'action_image_trace',
    'btn_pathfinder_unite', 'btn_pathfinder_minus_front', 'btn_pathfinder_intersect', 'btn_pathfinder_exclude', 'btn_pathfinder_divide',
    'popup_pathfinder_unite', 'popup_pathfinder_divide']) assert.ok(GUARDED_ACTIONS.includes(id), id);
  assert.equal(GUARD_MESSAGE, 'Break link to symbol first');
});

test('selectionInstances picks only <use> elements', () => {
  assert.deepEqual(selectionInstances([{ localName: 'rect' }, { localName: 'use', id: 'u' }, null]).map((e) => e.id), ['u']);
  assert.deepEqual(selectionInstances(null), []);
});

test('mergeHistorySince folds Break Link + the command into one undo step', () => {
  class Batch { constructor(t) { this.text = t; this.subs = []; } addSubCommand(c) { this.subs.push(c); } }
  const mgr = { undoStack: ['a', 'b', 'c', 'redo-junk'], undoStackPointer: 3 };
  assert.equal(mergeHistorySince(mgr, 1, Batch, 'Break Link & Unite'), true);
  assert.equal(mgr.undoStackPointer, 2);
  assert.equal(mgr.undoStack.length, 2);
  assert.equal(mgr.undoStack[1].text, 'Break Link & Unite');
  assert.deepEqual(mgr.undoStack[1].subs, ['b', 'c']);
  const one = { undoStack: ['a', 'b'], undoStackPointer: 2 };
  assert.equal(mergeHistorySince(one, 1, Batch, 'x'), false, 'a lone Break Link stays as is');
});

test('labelOf names the continued command (titles, menu text with shortcuts)', () => {
  assert.equal(labelOf({ getAttribute: () => 'Unite (Merge selected shapes into one outline)', textContent: '' }), 'Unite');
  assert.equal(labelOf({ getAttribute: () => null, textContent: 'Offset Path… ⌥⌘O' }), 'Offset Path');
});

test('guards are mounted in capture phase and the toast offers Break Link & Continue', () => {
  const src = fs.readFileSync(new URL('../js/visteras-symbol-guards.js', import.meta.url), 'utf8');
  assert.match(src, /document\.addEventListener\('click', \(e\) => \{[\s\S]*stopImmediatePropagation\(\)[\s\S]*\}, true\);/);
  assert.match(src, /Break Link &amp; Continue/);
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /import \{ mountSymbolGuards \} from '\.\/js\/visteras-symbol-guards\.js\?v=gap5-1';/);
  assert.match(html, /mountSymbolGuards\(svgEditor\);/);
});

test('stroke-link never treats a symbol instance as a leaf', () => {
  const src = fs.readFileSync(new URL('../js/visteras-stroke-link.js', import.meta.url), 'utf8');
  const m = src.match(/const LEAF_TAGS = new Set\(\[([^\]]*)\]\)/);
  assert.ok(m);
  assert.doesNotMatch(m[1], /'use'/);
  assert.match(m[1], /'path'/);
});
