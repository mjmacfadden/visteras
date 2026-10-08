import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  formatShortcut, detectMac, parseShortcutChord, localizeShortcut, hasForbiddenShortcutToken,
} from '../js/visteras-shortcut-label.js';
import { rewriteShortcutLabels } from '../js/visteras-shortcut-labels-apply.js';

test('formatShortcut Mac: Illustrator symbol order ⌃⌥⇧⌘', () => {
  assert.equal(formatShortcut({ meta: true, key: 'x', mac: true }), '⌘X');
  assert.equal(formatShortcut({ meta: true, shift: true, key: 'g', mac: true }), '⇧⌘G');
  assert.equal(formatShortcut({ meta: true, alt: true, key: '2', mac: true }), '⌥⌘2');
  assert.equal(formatShortcut({ shift: true, key: 'F6', mac: true }), '⇧F6');
  assert.equal(formatShortcut({ ctrl: true, alt: true, shift: true, meta: true, key: 's', mac: true }), '⌃⌥⇧⌘S');
});

test('formatShortcut Windows/Linux: Ctrl+Alt+Shift+Key', () => {
  assert.equal(formatShortcut({ meta: true, key: 'x', mac: false }), 'Ctrl+X');
  assert.equal(formatShortcut({ meta: true, shift: true, key: 'g', mac: false }), 'Shift+Ctrl+G');
  assert.equal(formatShortcut({ meta: true, alt: true, key: '2', mac: false }), 'Alt+Ctrl+2');
  assert.equal(formatShortcut({ ctrl: true, shift: true, key: 'F10', mac: false }), 'Shift+Ctrl+F10');
});

test('parse + localize chords', () => {
  assert.equal(localizeShortcut('Meta+X', true), '⌘X');
  assert.equal(localizeShortcut('META+X', false), 'Ctrl+X');
  assert.equal(localizeShortcut('⇧⌘G', false), 'Shift+Ctrl+G');
  assert.deepEqual(parseShortcutChord('Alt+Ctrl+2'), { meta: false, ctrl: true, alt: true, shift: false, key: '2' });
});

test('forbidden META token detector', () => {
  assert.equal(hasForbiddenShortcutToken('META+X'), true);
  assert.equal(hasForbiddenShortcutToken('Meta+C'), true);
  assert.equal(hasForbiddenShortcutToken('⌘X'), false);
  assert.equal(hasForbiddenShortcutToken('Ctrl+X'), false);
});

test('hygiene: no visible Vector UI shortcut label contains META/Meta', () => {
  const roots = [
    new URL('../index.html', import.meta.url),
    new URL('../js/visteras-context-menu.js', import.meta.url),
    new URL('../js/visteras-shortcut-label.js', import.meta.url),
  ];
  for (const url of roots) {
    const text = fs.readFileSync(url, 'utf8');
    // Allow mentions inside comments about the bug / detector itself
    const lines = text.split(/\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/hasForbiddenShortcutToken|Forbidden|META\+X is|raw META|detect.*META|\\\\bMETA/.test(line)) continue;
      if (/^\s*(\*|\/\/)/.test(line) && /META|Meta/.test(line)) continue;
      if (hasForbiddenShortcutToken(line) && /shortcut|menu_dropdown_shortcut|vcm-shortcut/i.test(line)) {
        assert.fail(`${url.pathname}:${i + 1} has forbidden META in shortcut UI: ${line.trim()}`);
      }
    }
  }
  // Editor.js still embeds META in the legacy se-cmenu template — must stay replaced/hidden.
  const ctx = fs.readFileSync(new URL('../js/visteras-context-menu.js', import.meta.url), 'utf8');
  assert.match(ctx, /data-visteras-replaced|se-cmenu_canvas/);
});



test('rewriteShortcutLabels turns META chords into platform labels', () => {
  // Minimal DOM stub
  const spans = [];
  const make = (text) => {
    const el = {
      textContent: text,
      getAttribute: (k) => (k === 'data-shortcut' ? null : null),
      setAttribute() {},
      hasAttribute: () => false,
      matches: (sel) => sel.includes('menu_dropdown_shortcut') || sel.includes('vcm-shortcut') || sel.includes('data-shortcut'),
    };
    spans.push(el);
    return el;
  };
  make('META+X');
  make('Meta+Shift+G');
  const root = {
    querySelectorAll: (sel) => {
      if (sel.includes('menu_dropdown_shortcut') || sel.includes('vcm-shortcut') || sel.includes('data-shortcut')) return spans;
      return [];
    },
  };
  const n = rewriteShortcutLabels(root, { mac: true });
  assert.ok(n >= 1);
  assert.equal(spans[0].textContent, '⌘X');
  assert.equal(spans[1].textContent, '⇧⌘G');
  assert.equal(hasForbiddenShortcutToken(spans[0].textContent), false);
});
