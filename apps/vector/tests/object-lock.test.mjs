import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  LOCK_ATTR, HIDE_ATTR, isLocked, writeLock, writeHide, lockSelection, unlockAll,
  hideSelection, showAll, artworkElements,
} from '../js/visteras-object-lock.js';
import { fakeEl } from './helpers/fake-svg.mjs';

function el(id, attrs = {}) {
  const e = fakeEl('rect', { id, ...attrs });
  e.localName = 'rect';
  e.removeAttribute = (k) => { delete e.attrs[k]; };
  e.classList = { contains: () => false };
  return e;
}
function layerWith(...kids) {
  const layer = fakeEl('g', { class: 'layer' });
  layer.localName = 'g';
  layer.children = kids;
  for (const k of kids) k.parentNode = layer;
  layer.querySelectorAll = (sel) => sel === ':scope > *' ? kids.slice() : [];
  return layer;
}
function content(layers) {
  const root = fakeEl('svg', { id: 'svgcontent' });
  root.children = layers;
  root.querySelectorAll = (sel) => sel === ':scope > g.layer' ? layers.filter((l) => (l.getAttribute('class') || '').includes('layer')) : [];
  return root;
}
function fakeSc(selected = []) {
  const history = [];
  return {
    history: {
      BatchCommand: class { constructor(t) { this.text = t; this.stack = []; } addSubCommand(c) { this.stack.push(c); } },
      ChangeElementCommand: class { constructor(el, before) { this.el = el; this.before = before; } },
    },
    addCommandToHistory(c) { history.push(c); },
    call() {},
    clearSelection() { this._sel = []; },
    addToSelection(els) { this._sel = els.slice(); },
    getSelectedElements: () => selected,
    _history: history,
  };
}

test('writeLock / writeHide toggle attrs and are undo-friendly snapshots', () => {
  const a = el('a');
  const before = writeLock(a, true);
  assert.equal(isLocked(a), true);
  assert.equal(a.getAttribute('pointer-events'), 'none');
  assert.ok(before);
  assert.equal(writeLock(a, true), null, 'already locked → no-op');
  writeLock(a, false);
  assert.equal(isLocked(a), false);
  const h = writeHide(a, true);
  assert.equal(a.getAttribute(HIDE_ATTR), '1');
  assert.equal(a.getAttribute('display'), 'none');
  assert.ok(h);
  writeHide(a, false);
  assert.equal(a.getAttribute(HIDE_ATTR), null);
});

test('lockSelection clears selection; unlockAll unlocks and selects (Illustrator)', () => {
  const a = el('a'), b = el('b');
  const sc = fakeSc([a, b]);
  const changed = lockSelection(sc, [a, b]);
  assert.equal(changed.length, 2);
  assert.equal(isLocked(a) && isLocked(b), true);
  assert.deepEqual(sc._sel, []);
  assert.equal(sc._history[0].text, 'Lock Selection');
  const root = content([layerWith(a, b)]);
  const unlocked = unlockAll(sc, root);
  assert.equal(unlocked.length, 2);
  assert.equal(isLocked(a) || isLocked(b), false);
  assert.deepEqual(sc._sel.map((e) => e.id).sort(), ['a', 'b']);
});

test('hideSelection / showAll round-trip via data-visteras-hidden', () => {
  const a = el('a'), b = el('b');
  const sc = fakeSc([a]);
  hideSelection(sc, [a]);
  assert.equal(a.getAttribute(HIDE_ATTR), '1');
  assert.deepEqual(sc._sel, []);
  const root = content([layerWith(a, b)]);
  const shown = showAll(sc, root);
  assert.equal(shown.length, 1);
  assert.equal(a.getAttribute(HIDE_ATTR), null);
  assert.deepEqual(sc._sel.map((e) => e.id), ['a']);
});

test('Object menu + shortcuts wired (⌘2 / ⌥⌘2 / ⌘3 / ⌥⌘3)', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const src = fs.readFileSync(new URL('../js/visteras-object-lock.js', import.meta.url), 'utf8');
  assert.match(html, /id="action_lock_selection"/);
  assert.match(html, /id="action_unlock_all"/);
  assert.match(html, /id="action_hide_selection"/);
  assert.match(html, /id="action_show_all"/);
  assert.match(html, /mountObjectLock/);
  assert.match(src, /Digit2/);
  assert.match(src, /Digit3/);
  assert.equal(LOCK_ATTR, 'data-visteras-locked', 'same attr as Layers panel lock');
});
