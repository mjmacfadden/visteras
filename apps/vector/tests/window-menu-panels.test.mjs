import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  WINDOW_PANELS, menuItemId, panelById, shortcutLabel, windowShortcutPanel, windowMenuHtml,
} from '../js/visteras-window-menu.js';
import { panelForShortcut } from '../js/visteras-panel-dock.js';
import { isBrowserReservedChord } from '../js/visteras-browser-shortcuts.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dockSrc = fs.readFileSync(new URL('../js/visteras-panel-dock.js', import.meta.url), 'utf8');
const paraSrc = fs.readFileSync(new URL('../js/visteras-paragraph.js', import.meta.url), 'utf8');
const windowMenu = html.match(/<div class="menu_entry" id="menu_window">([\s\S]*?)<\/div>\s*<!-- Help Menu -->/)[1];

// Every panel the app registers, discovered from source (not from the registry).
const dockPanels = [...new Set([
  ...[...dockSrc.matchAll(/data-panel="([a-z]+)"/g)].map((m) => m[1]),
  ...[...dockSrc.match(/const paneMap = \{([\s\S]*?)\};/)[1].matchAll(/^\s*([a-z]+):/gm)].map((m) => m[1]),
])];
const floatingPanels = [
  ...[...html.matchAll(/id="([a-z_]+)" class="visteras_floating_panel/g)].map((m) => m[1]),
  ...[...paraSrc.matchAll(/panel\.id = '([a-z_]+)';\s*panel\.className = 'visteras_floating_panel'/g)].map((m) => m[1]),
];
const sections = [...html.matchAll(/class="prop_section(?: [a-z_]+)?" id="([a-z_]+)"/g)].map((m) => m[1]);
// Properties sections that mirror a panel reachable elsewhere, or are contextual Properties-only controls.
const SECTION_ALIASES = { sec_appearance: 'appearance', sec_effects: 'effects', sec_pathfinder: 'pathfinder' };
const CONTEXTUAL_SECTIONS = ['sec_type_on_path', 'sec_path_node', 'sec_actions'];

test('every registered panel (dock, floating, Properties panel section) has a Window menu entry', () => {
  assert.ok(dockPanels.length >= 10, `found dock panels: ${dockPanels}`);
  assert.ok(floatingPanels.includes('visteras_pathfinder_panel') && floatingPanels.includes('visteras_paragraph_panel'), String(floatingPanels));
  const found = [];
  for (const id of dockPanels) found.push(WINDOW_PANELS.find((p) => p.kind === 'dock' && p.id === id) || `dock:${id}`);
  for (const el of floatingPanels) found.push(WINDOW_PANELS.find((p) => p.kind === 'floating' && p.element === el) || `floating:${el}`);
  for (const sec of sections) {
    if (CONTEXTUAL_SECTIONS.includes(sec)) continue;
    found.push(panelById(SECTION_ALIASES[sec]) || WINDOW_PANELS.find((p) => p.kind === 'section' && p.section === sec) || `section:${sec}`);
  }
  const missing = found.filter((x) => typeof x === 'string');
  assert.deepEqual(missing, [], 'panels without a registry entry');
  for (const p of found) assert.match(windowMenu, new RegExp(`id="${menuItemId(p.id)}"[^>]*>${p.label}[ <]`), `${p.label} in Window menu`);
});

test('Illustrator panel set is in the Window menu, alphabetical, Type ▸ Character / Paragraph, Properties last', () => {
  for (const name of ['Align', 'Appearance', 'Artboards', 'Character', 'Color', 'Gradient', 'Layers', 'Paragraph', 'Pathfinder', 'Stroke', 'Swatches', 'Symbols', 'Transform', 'Transparency']) {
    assert.ok(WINDOW_PANELS.some((p) => p.label === name), name);
  }
  const top = [...windowMenu.replace(/<div class="menu_dropdown_list menu_submenu_list"[\s\S]*?<\/div><\/div>/, '').matchAll(/id="(?:action_window_|menu_window_)([a-z]+)"[^>]*>([A-Z][a-z]+)/g)].map((m) => m[2]);
  const main = top.slice(0, -1);
  assert.deepEqual(main, [...main].sort((a, b) => a.localeCompare(b)), 'alphabetical');
  assert.equal(top.at(-1), 'Properties');
  const typeMenu = windowMenu.match(/id="menu_window_type"[\s\S]*?<\/div><\/div><\/div>/)[0];
  assert.match(typeMenu, /id="action_window_character"[^>]*>Character</);
  assert.match(typeMenu, /id="action_window_paragraph"[^>]*>Paragraph <span class="menu_dropdown_shortcut">⌥⌘T</);
  const list = windowMenu.match(/<div class="menu_dropdown_list">([\s\S]*)<\/div>\s*$/)[1];
  assert.equal(windowMenuHtml(true).replace(/\s+/g, ''), list.replace(/\s+/g, ''), 'static HTML matches the registry');
});

test('shortcuts: shared formatShortcut labels, browser-safe on Mac and Windows, Character left unbound', () => {
  for (const p of WINDOW_PANELS.filter((x) => x.shortcut)) {
    for (const mac of [true, false]) {
      const spec = { ...p.shortcut, mac, ctrl: !mac && p.shortcut.meta, meta: mac && p.shortcut.meta };
      assert.equal(isBrowserReservedChord(spec), false, `${p.label} reserved on ${mac ? 'Mac' : 'Win'}`);
    }
    assert.match(windowMenu, new RegExp(`id="${menuItemId(p.id)}"[^>]*>${p.label} <span class="menu_dropdown_shortcut">${shortcutLabel(p, true)}<`));
  }
  assert.equal(shortcutLabel(panelById('pathfinder'), false), 'Shift+Ctrl+F9');
  assert.equal(shortcutLabel(panelById('paragraph'), false), 'Alt+Ctrl+T');
  assert.equal(panelById('character').shortcut, null);
  assert.ok(isBrowserReservedChord({ meta: true, key: 't', mac: true }), 'Illustrator ⌘T really is reserved');
});

test('menu shortcuts reach the same panels as the key handlers', () => {
  const ev = (s, mac = true) => ({ key: s.key, code: s.key, shiftKey: !!s.shift, altKey: !!s.alt, metaKey: mac && !!s.meta, ctrlKey: !mac && !!s.meta });
  for (const p of WINDOW_PANELS.filter((x) => x.shortcut && x.kind === 'dock')) {
    for (const mac of [true, false]) assert.equal(panelForShortcut(ev(p.shortcut, mac)), p.id, `${p.label} dock handler`);
  }
  for (const id of ['align', 'transform', 'pathfinder']) {
    for (const mac of [true, false]) assert.equal(windowShortcutPanel(ev(panelById(id).shortcut, mac)), id);
  }
  assert.equal(windowShortcutPanel({ key: 'F8' }), null, 'bare F8 stays New Symbol');
  assert.equal(windowShortcutPanel({ key: 'F7' }), null, 'bare F7 stays Layers');
});
