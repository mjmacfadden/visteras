const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

test('Studio digit shortcuts: 1 remapped, 0 kept as Fit Window', async () => {
  const mod = await import('../src/js/libs/browser_shortcuts.js');
  const { browserSafeChord, formatStudioDigitShortcut, eventMatchesDigitChord } = mod;

  assert.deepEqual(browserSafeChord({ meta: true, key: '1' }, true), {
    meta: true, ctrl: true, alt: false, shift: false, key: '1',
  });
  // Digit 0 restored — Chrome zoom reset is preventDefault-able
  assert.equal(formatStudioDigitShortcut({ meta: true, key: '0' }, true), '⌘0');
  assert.equal(formatStudioDigitShortcut({ meta: true, key: '0' }, false), 'Ctrl+0');

  assert.equal(eventMatchesDigitChord({
    key: '1', code: 'Digit1', metaKey: true, ctrlKey: true, altKey: false, shiftKey: false,
  }, { meta: true, key: '1' }, true), true);
  assert.equal(eventMatchesDigitChord({
    key: '0', code: 'Digit0', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false,
  }, { meta: true, key: '0' }, true), true);
});

test('Studio menu + handlers: Fit Window Ctrl+0; Original Size Ctrl+Alt+1; capture preventDefault', () => {
  const menu = fs.readFileSync(path.join(__dirname, '../src/js/config-menu.js'), 'utf8');
  assert.match(menu, /Ctrl \+ Alt \+ 1/);
  assert.match(menu, /name: 'Fit Window'[\s\S]*?shortcut: 'Ctrl \+ 0'/);
  assert.doesNotMatch(menu, /name: 'Fit Window'[\s\S]*?shortcut: 'Ctrl \+ Alt \+ 0'/);
  const gui = fs.readFileSync(path.join(__dirname, '../src/js/core/gui/gui-shortcuts.js'), 'utf8');
  assert.match(gui, /eventMatchesDigitChord/);
  assert.match(gui, /browser_shortcuts/);
  assert.match(gui, /fitWindowOnZero/);
  assert.match(gui, /capture: true, passive: false/);
  const helpers = fs.readFileSync(path.join(__dirname, '../src/js/libs/helpers.js'), 'utf8');
  assert.match(helpers, /Cmd \+ 0/);
  assert.match(helpers, /Ctrl \+ Cmd \+/);
});
