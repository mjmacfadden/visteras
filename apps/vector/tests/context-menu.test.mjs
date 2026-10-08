import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { contextMenuItems } from '../js/visteras-context-menu.js';
import { formatShortcut } from '../js/visteras-shortcut-label.js';

function fakeEl(tag, attrs = {}) {
  const el = { tagName: tag, attrs: { ...attrs }, classList: { contains: (c) => String(attrs.class || '').split(/\s+/).includes(c) } };
  el.getAttribute = (k) => (k in el.attrs ? el.attrs[k] : null);
  el.hasAttribute = (k) => k in el.attrs;
  el.querySelector = () => null;
  return el;
}

function fakeSc(elements = [], { undo = 0, redo = 0 } = {}) {
  return {
    getSelectedElements: () => elements,
    undoMgr: { getUndoStackSize: () => undo, getRedoStackSize: () => redo },
    getClipboardID: () => 'svgedit_clipboard',
  };
}

test('contextMenuItems: empty selection shows Paste / Select All / Unlock|Show when present', () => {
  // stub clipboard empty + no locked/hidden in jsdom-less env (document may be undefined in node)
  const items = contextMenuItems(fakeSc([], { undo: 1, redo: 0 }), { mac: true });
  const ids = items.filter((i) => !i.separator).map((i) => i.id);
  assert.ok(ids.includes('undo'));
  assert.ok(ids.includes('paste'));
  assert.ok(ids.includes('select_all'));
  assert.ok(!ids.includes('cut'));
  assert.ok(!ids.includes('group'));
  assert.equal(items.find((i) => i.id === 'undo').shortcut, '⌘Z');
});

test('contextMenuItems: single shape shows Cut/Copy/Lock/Arrange, not Group', () => {
  const el = fakeEl('rect', { id: 'r1' });
  const items = contextMenuItems(fakeSc([el], { undo: 0 }), { mac: true });
  const ids = items.filter((i) => !i.separator).map((i) => i.id);
  assert.ok(ids.includes('cut') && ids.includes('copy') && ids.includes('delete'));
  assert.ok(ids.includes('lock') && ids.includes('hide'));
  assert.ok(ids.includes('front') && ids.includes('back'));
  assert.ok(!ids.includes('group'));
  assert.equal(items.find((i) => i.id === 'cut').shortcut, formatShortcut({ meta: true, key: 'X', mac: true }));
});

test('contextMenuItems: multi-select offers Group; group element offers Ungroup', () => {
  const a = fakeEl('rect', { id: 'a' });
  const b = fakeEl('rect', { id: 'b' });
  const idsMulti = contextMenuItems(fakeSc([a, b]), { mac: false }).filter((i) => !i.separator).map((i) => i.id);
  assert.ok(idsMulti.includes('group'));
  const g = fakeEl('g', { id: 'g1', class: '' });
  const idsG = contextMenuItems(fakeSc([g]), { mac: false }).filter((i) => !i.separator).map((i) => i.id);
  assert.ok(idsG.includes('ungroup'));
  assert.equal(contextMenuItems(fakeSc([a, b]), { mac: false }).find((i) => i.id === 'group').shortcut, 'Ctrl+G');
});

test('context menu reuses menu-bar actions (no duplicate cut/copy logic) and replaces legacy cmenu', () => {
  const src = fs.readFileSync(new URL('../js/visteras-context-menu.js', import.meta.url), 'utf8');
  assert.match(src, /action_cut/);
  assert.match(src, /runAction/);
  assert.match(src, /selectedElement|multiselected/); // documents root cause
  assert.match(src, /se-cmenu_canvas/);
  assert.match(src, /data-visteras-replaced/);
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /mountContextMenu/);
  assert.match(html, /visteras-context-menu\.js\?v=cmenu-1/);
});
