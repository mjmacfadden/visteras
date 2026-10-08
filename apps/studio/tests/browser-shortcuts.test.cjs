const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Studio digit shortcuts use the Vector browser-safe rule', async () => {
  const mod = await import('../src/js/libs/browser_shortcuts.js');
  const { browserSafeChord, formatStudioDigitShortcut, eventMatchesDigitChord } = mod;

  assert.deepEqual(browserSafeChord({ meta: true, key: '1' }, true), {
    meta: true, ctrl: true, alt: false, shift: false, key: '1',
  });
  assert.equal(formatStudioDigitShortcut({ meta: true, key: '0' }, true), '⌃⌘0');
  assert.equal(formatStudioDigitShortcut({ meta: true, key: '0' }, false), 'Alt+Ctrl+0');

  assert.equal(eventMatchesDigitChord({
    key: '1', code: 'Digit1', metaKey: true, ctrlKey: true, altKey: false, shiftKey: false,
  }, { meta: true, key: '1' }, true), true);
  assert.equal(eventMatchesDigitChord({
    key: '1', code: 'Digit1', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false,
  }, { meta: true, key: '1' }, true), false);
});

test('Studio menu + handlers reference remapped zoom chords', () => {
  const menu = fs.readFileSync(path.join(__dirname, '../src/js/config-menu.js'), 'utf8');
  assert.match(menu, /Ctrl \+ Alt \+ 1/);
  assert.match(menu, /Ctrl \+ Alt \+ 0/);
  const gui = fs.readFileSync(path.join(__dirname, '../src/js/core/gui/gui-shortcuts.js'), 'utf8');
  assert.match(gui, /eventMatchesDigitChord/);
  assert.match(gui, /browser_shortcuts/);
  const helpers = fs.readFileSync(path.join(__dirname, '../src/js/libs/helpers.js'), 'utf8');
  assert.match(helpers, /Ctrl \+ Cmd \+/);
});
