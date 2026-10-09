// Audit fix #10: Photoshop naming and tool-letter cleanup.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (f) => fs.readFileSync(require.resolve('../src/js/' + f), 'utf8');
const menu = read('config-menu.js');

test('menu uses Photoshop-recognisable names', () => {
	for (const n of ['Threshold (B/W)', 'Extend Canvas Fill', 'Snapshot to Browser', 'Restore Browser Snapshot', 'Image Size', 'Layer via Copy']) {
		assert.ok(menu.includes(`name: '${n}'`), n);
	}
	for (const old of ['Black and White', 'Content Fill', 'Quick Save', 'Quick Load', "name: 'Resize'", 'Copy Selection to Layer']) {
		assert.ok(!menu.includes(old), old);
	}
	assert.match(read('modules/effects/black_and_white.js'), /title: 'Threshold \(B\/W\)'/);
	assert.match(read('modules/tools/content_fill.js'), /title: 'Extend Canvas Fill'/);
	assert.match(read('modules/image/resize.js'), /title: 'Image Size'/);
});

test('Ctrl+J is listed once (Layer via Copy; duplicates the layer when nothing is selected)', () => {
	assert.equal(menu.match(/shortcut: 'Ctrl \+ J'/g).length, 1);
	assert.match(menu, /name: 'Layer via Copy',\n\t+shortcut: 'Ctrl \+ J'/);
	const dup = read('modules/layer/duplicate.js');
	assert.match(dup, /duplicate\(\) \{\n\t+if \(this\.Base_layers\.Base_selection != null[\s\S]{0,120}new_selection\(\)/);
});

test('tool letters: J Spot Healing, H Hand', () => {
	const keys = read('core/gui/gui-shortcuts.js');
	assert.match(keys, /'j': 'spot_heal'/);
	assert.match(keys, /'h': 'pan'/);
	assert.doesNotMatch(keys, /'j': 'desaturate'/);
	assert.match(read('config.js'), /name: 'pan',\n\t+title: 'Hand Tool'/);
	const help = read('modules/help/shortcuts.js');
	assert.match(help, /title: "J", value: 'Spot Healing Brush'/);
	assert.match(help, /title: "H", value: 'Hand Tool'/);
});
