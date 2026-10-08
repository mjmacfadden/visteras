import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  browserSafeChord,
  formatBrowserSafeShortcut,
  isBrowserReservedChord,
  eventMatchesChord,
  VECTOR_DIGIT_ACTIONS,
  mappedLabel,
} from '../js/visteras-browser-shortcuts.js';

test('Mac: bare ⌘digit becomes ⌃⌘digit; Alt variants keep ⌥ and gain ⌃', () => {
  assert.deepEqual(browserSafeChord({ meta: true, key: '8', mac: true }), {
    meta: true, ctrl: true, alt: false, shift: false, key: '8', mac: true,
  });
  assert.equal(formatBrowserSafeShortcut({ meta: true, key: '8', mac: true }), '⌃⌘8');
  assert.equal(formatBrowserSafeShortcut({ meta: true, alt: true, key: '2', mac: true }), '⌃⌥⌘2');
  assert.equal(formatBrowserSafeShortcut({ meta: true, alt: true, shift: true, key: '8', mac: true }), '⌃⌥⇧⌘8');
});

test('Windows: Ctrl+digit → Ctrl+Alt+digit; already-Alt → Ctrl+Alt+Shift+digit', () => {
  assert.deepEqual(browserSafeChord({ meta: true, key: '2', mac: false }), {
    meta: false, ctrl: true, alt: true, shift: false, key: '2', mac: false,
  });
  assert.equal(formatBrowserSafeShortcut({ meta: true, key: '2', mac: false }), 'Alt+Ctrl+2');
  assert.deepEqual(browserSafeChord({ meta: true, alt: true, key: '2', mac: false }), {
    meta: false, ctrl: true, alt: true, shift: true, key: '2', mac: false,
  });
  assert.equal(formatBrowserSafeShortcut({ meta: true, alt: true, key: '2', mac: false }), 'Shift+Alt+Ctrl+2');
});

test('non-digit chords pass through unchanged', () => {
  assert.equal(formatBrowserSafeShortcut({ meta: true, key: 'D', mac: true }), '⌘D');
  assert.equal(formatBrowserSafeShortcut({ meta: true, shift: true, key: 'M', mac: true }), '⇧⌘M');
  assert.equal(isBrowserReservedChord({ meta: true, key: 'D', mac: true }), false);
});

test('bare ⌘digit / Ctrl+digit flagged reserved; remapped not reserved', () => {
  assert.equal(isBrowserReservedChord({ meta: true, key: '8', mac: true }), true);
  assert.equal(isBrowserReservedChord({ meta: true, ctrl: true, key: '8', mac: true }), false);
  assert.equal(isBrowserReservedChord({ ctrl: true, key: '2', mac: false }), true);
  assert.equal(isBrowserReservedChord({ ctrl: true, alt: true, key: '2', mac: false }), false);
});

test('VECTOR_DIGIT_ACTIONS: every mapped chord is non-reserved on Mac and Windows', () => {
  for (const row of VECTOR_DIGIT_ACTIONS) {
    for (const mac of [true, false]) {
      const mapped = browserSafeChord({ ...row.illustrator, mac });
      assert.equal(
        isBrowserReservedChord(mapped),
        false,
        `${row.id} still reserved on ${mac ? 'Mac' : 'Win'}: ${JSON.stringify(mapped)}`,
      );
      assert.ok(mappedLabel(row.illustrator, mac).length > 0);
    }
  }
});

test('eventMatchesChord respects remapped modifiers', () => {
  const macEvent = {
    key: '8', code: 'Digit8', metaKey: true, ctrlKey: true, altKey: false, shiftKey: false,
  };
  assert.equal(eventMatchesChord(macEvent, { meta: true, key: '8', mac: true }), true);
  assert.equal(eventMatchesChord({ ...macEvent, ctrlKey: false }, { meta: true, key: '8', mac: true }), false);

  const winEvent = {
    key: '2', code: 'Digit2', metaKey: false, ctrlKey: true, altKey: true, shiftKey: false,
  };
  assert.equal(eventMatchesChord(winEvent, { meta: true, key: '2', mac: false }), true);
  assert.equal(eventMatchesChord({ ...winEvent, altKey: false }, { meta: true, key: '2', mac: false }), false);
});

test('hygiene: Vector UI digit shortcuts are remapped (no bare ⌘N labels for digits 0-9)', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  // Menu labels must not show bare ⌘digit (without ⌃)
  assert.doesNotMatch(html, /menu_dropdown_shortcut">⌘[0-9]</);
  assert.match(html, /⌃⌘2/);
  assert.match(html, /⌃⌘8|Ctrl\+Meta\+8|compound/);
  const lock = fs.readFileSync(new URL('../js/visteras-object-lock.js', import.meta.url), 'utf8');
  assert.match(lock, /eventMatchesChord/);
  const compound = fs.readFileSync(new URL('../js/visteras-compound-path.js', import.meta.url), 'utf8');
  assert.match(compound, /eventMatchesChord/);
  assert.match(compound, /formatBrowserSafeShortcut/);
});
