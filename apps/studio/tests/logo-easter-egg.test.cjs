const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '../../..');

test('logo easter egg: requires Ctrl+Shift+4 and does not toggle on click', () => {
	const guiShortcutsSource = fs.readFileSync(path.join(rootDir, 'apps/studio/src/js/core/gui/gui-shortcuts.js'), 'utf8');

	// Verify Ctrl+Shift+4 requirement in keydown listener
	assert.ok(guiShortcutsSource.includes('hasShift'), 'gui-shortcuts.js must check for Shift key');
	assert.ok(guiShortcutsSource.includes('hasCmdCtrlSuper && hasShift && isDigit4'), 'gui-shortcuts.js must require Cmd/Ctrl + Shift + 4');

	// Verify click handler that previously toggled on click has been removed
	assert.ok(!guiShortcutsSource.includes('logoAnchor.addEventListener(\'click\''), 'clicking logo anchor must not toggle easter egg');

	// Verify blue accent CSS class assignment
	assert.ok(guiShortcutsSource.includes('logo-omarchy-active'), 'must toggle logo-omarchy-active class');
});

test('logo easter egg: packages/ui easter-egg module and CSS rules exist', () => {
  const easterEggSource = fs.readFileSync(path.join(rootDir, 'packages/ui/src/easter-egg.js'), 'utf8');
  assert.ok(easterEggSource.includes('initLogoEasterEgg'), 'packages/ui must export initLogoEasterEgg');
  assert.ok(easterEggSource.includes('isCtrlShift4'), 'easter-egg module must check isCtrlShift4');

  const uiCss = fs.readFileSync(path.join(rootDir, 'packages/ui/src/ui.css'), 'utf8');
  assert.ok(uiCss.includes('.logo-omarchy-active'), 'ui.css must define .logo-omarchy-active rule');
  assert.ok(uiCss.includes('filter: brightness(0) saturate(100%) invert'), 'ui.css must apply blue accent color filter');
});
