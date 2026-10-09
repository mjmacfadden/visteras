// Item 4 (broken): stray legacy hotkeys. Plain R / Alt+R opened Resize,
// Ctrl/⌘/Alt+L rotated the active layer, Alt/Ctrl+T trimmed the canvas,
// Alt+G toggled the grid. Photoshop: R Rotate View, Ctrl+L Levels,
// Ctrl+T Free Transform, Ctrl+' Grid.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (f) => fs.readFileSync(require.resolve('../src/js/' + f), 'utf8');

for (const [file, what] of [['modules/image/resize.js', 'Resize'], ['modules/image/rotate.js', 'Rotate'], ['modules/image/trim.js', 'Trim'], ['modules/image/information.js', 'Information']]) {
	test(`${what}: no keydown hotkey any more (menu only)`, () => {
		const src = read(file);
		assert.doesNotMatch(src, /addEventListener\('keydown'/);
		assert.doesNotMatch(src, /code == (82|76|84)/);
	});
}

test("Ruler toggles with Ctrl/⌘+R (not Alt+U / KeyU)", () => {
	const src = read('modules/view/ruler.js');
	assert.doesNotMatch(src, /KeyU/);
});

test("Grid toggles with Ctrl/⌘+' (not Alt+G / G)", () => {
	const src = read('modules/view/grid.js');
	assert.doesNotMatch(src, /code == 71/);
	assert.match(src, /\(event\.ctrlKey \|\| event\.metaKey\) && !event\.altKey && !event\.shiftKey\n\t+&& \(event\.code === 'Quote' \|\| event\.key === "'"\)/);
});

test('menu labels match: no R / T / G / I single-key labels for Resize, Trim, Grid, Information', () => {
	const menu = read('config-menu.js');
	assert.match(menu, /name: 'Grid',\n\t+shortcut: "Ctrl \+ '",/);
	assert.doesNotMatch(menu, /name: 'Trim',\n\t+ellipsis: true,\n\t+shortcut:/);
	assert.doesNotMatch(menu, /name: 'Image Size',\n\t+ellipsis: true,\n\t+shortcut:/);
	assert.doesNotMatch(menu, /name: 'Information',\n\t+shortcut:/);
});

test('no Studio keydown handler binds a Chrome-reserved chord (Ctrl/⌘+T/N/W, ⌥⌘I/J/C)', () => {
	const files = ['modules/image/resize.js', 'modules/image/rotate.js', 'modules/image/trim.js', 'modules/image/information.js', 'modules/view/grid.js', 'modules/view/ruler.js', 'modules/layer/merge.js'];
	for (const f of files) {
		const src = read(f);
		assert.doesNotMatch(src, /'Key(T|N|W)'/, f);
	}
});
