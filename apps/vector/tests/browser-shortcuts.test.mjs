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

test('Mac: bare ⌘digit 1–9 becomes ⌃⌘digit; Alt variants keep ⌥ and gain ⌃', () => {
  assert.deepEqual(browserSafeChord({ meta: true, key: '8', mac: true }), {
    meta: true, ctrl: true, alt: false, shift: false, key: '8', mac: true,
  });
  assert.equal(formatBrowserSafeShortcut({ meta: true, key: '8', mac: true }), '⌃⌘8');
  assert.equal(formatBrowserSafeShortcut({ meta: true, alt: true, key: '2', mac: true }), '⌃⌥⌘2');
  assert.equal(formatBrowserSafeShortcut({ meta: true, alt: true, shift: true, key: '8', mac: true }), '⌃⌥⇧⌘8');
});

test('digit 0 keeps Illustrator chords (⌘0 / ⌥⌘0; Win Ctrl+0 / Ctrl+Alt+0)', () => {
  // Chrome zoom-reset on ⌘0/Ctrl+0 is preventDefault-able (unlike ⌘1–9 tabs).
  assert.deepEqual(browserSafeChord({ meta: true, key: '0', mac: true }), {
    meta: true, ctrl: false, alt: false, shift: false, key: '0', mac: true,
  });
  assert.equal(formatBrowserSafeShortcut({ meta: true, key: '0', mac: true }), '⌘0');
  assert.equal(formatBrowserSafeShortcut({ meta: true, alt: true, key: '0', mac: true }), '⌥⌘0');
  assert.deepEqual(browserSafeChord({ meta: true, key: '0', mac: false }), {
    meta: false, ctrl: true, alt: false, shift: false, key: '0', mac: false,
  });
  assert.equal(formatBrowserSafeShortcut({ meta: true, key: '0', mac: false }), 'Ctrl+0');
  assert.equal(formatBrowserSafeShortcut({ meta: true, alt: true, key: '0', mac: false }), 'Alt+Ctrl+0');
  // Explicitly allowed — not flagged reserved (handlers must preventDefault)
  assert.equal(isBrowserReservedChord({ meta: true, key: '0', mac: true }), false);
  assert.equal(isBrowserReservedChord({ ctrl: true, key: '0', mac: false }), false);
});

test('Windows: Ctrl+digit 1–9 → Ctrl+Alt+digit; already-Alt → Ctrl+Alt+Shift+digit', () => {
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

test('bare ⌘digit 1–9 / Ctrl+digit flagged reserved; remapped not reserved', () => {
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
  assert.equal(mappedLabel({ meta: true, key: '0' }, true), '⌘0');
  assert.equal(mappedLabel({ meta: true, key: '1' }, true), '⌃⌘1');
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

  // ⌘0 matches without Control
  assert.equal(eventMatchesChord({
    key: '0', code: 'Digit0', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false,
  }, { meta: true, key: '0', mac: true }), true);
});

test('hygiene: Vector digit 1–9 labels remapped; ⌘0 / ⌥⌘0 allowed for Fit', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  // Digits 1–9 must not appear as bare ⌘N in menu shortcuts
  assert.doesNotMatch(html, /menu_dropdown_shortcut">⌘[1-9]</);
  assert.match(html, /menu_dropdown_shortcut">⌘0</);
  assert.match(html, /menu_dropdown_shortcut">⌥⌘0</);
  assert.match(html, /⌃⌘1/);
  assert.match(html, /⌃⌘2/);
  assert.match(html, /⌃⌘8/);
  const lock = fs.readFileSync(new URL('../js/visteras-object-lock.js', import.meta.url), 'utf8');
  assert.match(lock, /eventMatchesChord/);
  const compound = fs.readFileSync(new URL('../js/visteras-compound-path.js', import.meta.url), 'utf8');
  assert.match(compound, /eventMatchesChord/);
  assert.match(compound, /formatBrowserSafeShortcut/);
});
