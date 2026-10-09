/** gravit-gap-5 item 2: Symbols panel, New Symbol (F8), Place, Break Link, commands. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const html = read('../index.html');
const dock = read('../js/visteras-panel-dock.js');
const src = read('../js/visteras-symbols.js');

test('⇧⌘F11 / Ctrl+Shift+F11 opens Symbols; other F11 chords do not', async () => {
  const { panelForShortcut } = await import('../js/visteras-panel-dock.js');
  assert.equal(panelForShortcut({ key: 'F11', code: 'F11', metaKey: true, shiftKey: true }), 'symbols');
  assert.equal(panelForShortcut({ key: 'F11', code: 'F11', ctrlKey: true, shiftKey: true }), 'symbols');
  assert.equal(panelForShortcut({ key: 'F11', code: 'F11' }), null);
  assert.equal(panelForShortcut({ key: 'F11', code: 'F11', metaKey: true }), null);
  assert.equal(panelForShortcut({ key: 'F11', code: 'F11', metaKey: true, shiftKey: true, altKey: true }), null);
});

test('F8 = New Symbol only without modifiers', async () => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const S = await import('../js/visteras-symbols.js');
  assert.equal(S.isNewSymbolShortcut({ key: 'F8', code: 'F8' }), true);
  assert.equal(S.isNewSymbolShortcut({ key: 'F8', code: 'F8', metaKey: true }), false);
  assert.equal(S.isNewSymbolShortcut({ key: 'F8', code: 'F8', shiftKey: true }), false);
  assert.equal(S.readView(), 'thumbnails');
});

test('Window ▸ Symbols menu item, dock icon, pane and flyout wiring', () => {
  assert.match(html, /id="action_window_symbols">Symbols <span class="menu_dropdown_shortcut">⇧⌘F11<\/span>/);
  assert.match(dock, /data-panel="symbols" title="Symbols \(⇧⌘F11 \/ Shift\+Ctrl\+F11\)"/);
  assert.match(dock, /symbolsPane\.id = 'vdock_symbols_panel';/);
  assert.match(dock, /symbols: symbolsPane,/);
  assert.match(dock, /symbols: 'Symbols',/);
  assert.match(dock, /'transparency', 'symbols', 'layers'/);
});

test('Object ▸ New Symbol… (F8); hidden Edit/Break Link actions for the context menu', () => {
  assert.match(html, /id="action_symbol_new"[^>]*>New Symbol… <span class="menu_dropdown_shortcut">F8<\/span>/);
  assert.match(html, /id="action_symbol_edit" hidden>Edit Symbol</);
  assert.match(html, /id="action_symbol_break_link" hidden>Break Link to Symbol</);
  assert.match(html, /import \{ mountSymbols \} from '\.\/js\/visteras-symbols\.js\?v=gap5-1';/);
  assert.match(html, /mountSymbols\(svgEditor\);/);
  assert.match(html, /css\/visteras-symbols\.css\?v=gap5-\d+/);
});

test('Panel has Illustrator buttons + panel menu', () => {
  for (const id of ['vsym_place', 'vsym_break', 'vsym_options', 'vsym_new', 'vsym_delete', 'vsym_menu_btn', 'vsym_list']) assert.match(src, new RegExp(`id="${id}"`));
  for (const cmd of ['redefine', 'duplicate', 'replace', 'selectInstances', 'selectUnused', 'options']) assert.match(src, new RegExp(`data-cmd="${cmd}"`));
  assert.match(src, /Expand Instances/);
  assert.match(src, /Delete Instances/);
  assert.match(src, /Dynamic Symbol/);
  assert.match(src, /Static Symbol/);
  assert.match(src, /Movie Clip/);
  assert.match(src, /api\.newSymbol\(\{ skipDialog: e\.altKey \}\)/, '⌥-click New skips the dialog');
});

test('Ungroup and Object ▸ Expand on an instance route to Break Link', () => {
  assert.match(src, /sc\.ungroupSelectedElement = function/);
  assert.match(src, /sel\.every\(\(el\) => el\.localName === 'use'\)\) \{ api\.breakLink\(sel\); return undefined; \}/);
  assert.match(src, /getElementById\('action_expand'\)\?\.addEventListener\('click'/);
});

test('Layers label shows symbol name; context menu offers Edit Symbol / Break Link', () => {
  const ws = read('../js/visteras-workspace.js');
  assert.match(ws, /sym\?\.getAttribute\('data-v-symbol-name'\)/);
  const cm = read('../js/visteras-context-menu.js');
  assert.match(cm, /id: 'symbol_edit', label: 'Edit Symbol', actionId: 'action_symbol_edit'/);
  assert.match(cm, /id: 'symbol_break_link', label: 'Break Link to Symbol', actionId: 'action_symbol_break_link'/);
});

test('Icons + storage allowlist', () => {
  for (const f of ['symbols.svg', 'symbol-place.svg', 'symbol-break-link.svg']) {
    const a = fs.readFileSync(new URL(`../../../packages/icons/tools/${f}`, import.meta.url), 'utf8');
    const b = fs.readFileSync(new URL(`../images/tools/${f}`, import.meta.url), 'utf8');
    assert.equal(a, b, `${f} copy is current`);
    assert.match(a, /viewBox="0 0 24 24"/);
    assert.match(a, /currentColor/);
    assert.doesNotMatch(a, /<\?xml/);
  }
  const guard = fs.readFileSync(new URL('../../../scripts/check-no-doc-localstorage.mjs', import.meta.url), 'utf8');
  assert.match(guard, /visteras-symbols\.js', key: 'VIEW_KEY'/);
  assert.match(src, /export const VIEW_KEY = 'visteras-vector-symbols-view';/);
});
