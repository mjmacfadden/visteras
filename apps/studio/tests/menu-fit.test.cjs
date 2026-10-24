// Menus are as tall as their content; a cap appears only when they would run off screen.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = (f) => fs.readFileSync(require.resolve('../src/' + f), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(read('js/libs/menu-fit.js').replace(/^export /gm, '') + '\nthis.fit = fit_menu_vertically;', ctx);
const fit = (o) => ({ ...ctx.fit(o) });

test('top-level menu that fits: no cap, opens under the opener', () => {
	assert.deepEqual(fit({ anchor: 28, height: 373, viewport: 900, margin: 15 }), { top: 28, maxHeight: null });
	assert.deepEqual(fit({ anchor: 28, height: 757, viewport: 800, margin: 15 }), { top: 28, maxHeight: null }, 'exactly fills the space left');
});

test('top-level menu taller than the space left is capped to that space', () => {
	assert.deepEqual(fit({ anchor: 28, height: 500, viewport: 420, margin: 15 }), { top: 28, maxHeight: 377 });
	assert.deepEqual(fit({ anchor: 28, height: 366, viewport: 360, margin: 15 }), { top: 28, maxHeight: 317 });
});

test('submenu that would run off the bottom shifts up instead of scrolling', () => {
	assert.deepEqual(fit({ anchor: 600, height: 530, viewport: 900, margin: 15, submenu: true }), { top: 355, maxHeight: null });
	assert.deepEqual(fit({ anchor: 100, height: 530, viewport: 900, margin: 15, submenu: true }), { top: 100, maxHeight: null });
});

test('submenu taller than the whole viewport pins to the top margin and scrolls', () => {
	assert.deepEqual(fit({ anchor: 300, height: 530, viewport: 420, margin: 15, submenu: true }), { top: 15, maxHeight: 390 });
});

test('menu CSS has no fixed scroll; the submenu arrow cannot overflow its row', () => {
	const css = read('css/menu.css').replace(/\/\*[\s\S]*?\*\//g, '');
	const block = css.slice(css.indexOf('.main_menu > ul.menu_dropdown {'), css.indexOf('}', css.indexOf('.main_menu > ul.menu_dropdown {')));
	assert.doesNotMatch(block, /overflow-y:\s*auto|max-height/);
	assert.match(block, /overflow:\s*visible/);
	const arrow = css.slice(css.indexOf('a[aria-haspopup="true"]::after {'), css.indexOf('}', css.indexOf('a[aria-haspopup="true"]::after {')));
	assert.match(arrow, /top: 50%/); assert.match(arrow, /line-height: 12px/);
	const gui = read('js/core/gui/gui-menu.js');
	assert.match(gui, /fit_menu_vertically\(/);
	assert.doesNotMatch(gui, /vh - topNavHeight - this\.dropdownMaxHeightMargin/, 'old always-on max-height is gone');
});
