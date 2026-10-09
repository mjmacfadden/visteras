// Zoom Tool: 'z': 'zoom' keymap, config.TOOLS registration, Help ▸ Keyboard Shortcuts, and zoom step math.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const read = (f) => fs.readFileSync(require.resolve('../src/js/' + f), 'utf8');

test('Zoom tool is registered in config.TOOLS with title "Zoom Tool"', () => {
	const src = read('config.js');
	assert.match(src, /name:\s*'zoom',\n\s*title:\s*'Zoom Tool',/);
});

test("gui-shortcuts.js binds 'z' to 'zoom'", () => {
	const src = read('core/gui/gui-shortcuts.js');
	assert.match(src, /'z':\s*'zoom'/);
});

test('Help Keyboard Shortcuts lists Z for Zoom Tool', () => {
	const src = read('modules/help/shortcuts.js');
	assert.match(src, /\{title:\s*"Z",\s*value:\s*'Zoom Tool'\}/);
});

test('Zoom tool icon exists and is styled in layout.css', () => {
	const css = fs.readFileSync(require.resolve('../src/css/layout.css'), 'utf8');
	assert.match(css, /\.sidebar_left \.zoom:after/);
	assert.match(css, /body\.tool-zoom[\s\S]*cursor:\s*zoom-in/);
	assert.match(css, /body\.tool-zoom\.zoom-out[\s\S]*cursor:\s*zoom-out/);
	assert.ok(fs.existsSync(require.resolve('../images/icons/zoom.svg')));
});

// Test calc_zoom_step pure math
const zoomSrc = read('tools/zoom.js');
const ctx = vm.createContext({ Base_tools_class: class {} });
vm.runInContext(zoomSrc.replace(/^import .*;$/gm, '').replace(/^export default .*;$/gm, '').replace(/\bexport /g, '') + '\nthis.api = { calc_zoom_step };', ctx);
const { calc_zoom_step } = ctx.api;

test('calc_zoom_step zooms in and out across thresholds', () => {
	// Zoom in
	assert.equal(calc_zoom_step(1, 1), 1.5);
	assert.equal(calc_zoom_step(1.5, 1), 2);
	assert.equal(calc_zoom_step(3, 1), 4);
	assert.equal(calc_zoom_step(0.5, 1), 0.6);

	// Zoom out
	assert.equal(calc_zoom_step(4, -1), 3);
	assert.equal(calc_zoom_step(1.5, -1), 1);
	assert.equal(calc_zoom_step(0.5, -1), 0.4);
	assert.equal(calc_zoom_step(0.05, -1), 0.04);
});
