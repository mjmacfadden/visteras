// Audit fix #9: Select ▸ Modify ▸ Border / Smooth / Contract / Feather (Shift+F6).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const ctx = vm.createContext({ Uint8ClampedArray, Float32Array, Uint32Array, Math, Number });
vm.runInContext(fs.readFileSync(require.resolve('../src/js/libs/selection-modify.js'), 'utf8').replace(/\bexport /g, '')
	+ '\nthis.api = { rgba_to_alpha, alpha_to_rgba, feather_alpha, smooth_alpha, border_split, border_alpha };', ctx);
const api = ctx.api;
const src = (p) => fs.readFileSync(require.resolve(p), 'utf8');

const W = 40, H = 40;
function square(x0, y0, x1, y1) {
	const a = new Uint8ClampedArray(W * H);
	for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) a[y * W + x] = 255;
	return a;
}

test('feather softens the edge, keeps the centre and total coverage', () => {
	const a = square(10, 10, 30, 30);
	const f = api.feather_alpha(a, W, H, 3);
	assert.equal(f[20 * W + 20], 255);
	assert.ok(f[20 * W + 10] > 60 && f[20 * W + 10] < 200, 'edge pixel is partial');
	assert.ok(f[20 * W + 7] > 0, 'feather reaches outside');
	const sum = (x) => x.reduce((s, v) => s + v, 0);
	assert.ok(Math.abs(sum(f) - sum(a)) / sum(a) < 0.02);
	assert.deepEqual([...api.feather_alpha(a, W, H, 0)], [...a]);
});

test('feather keeps a select-all solid at the canvas edge', () => {
	const f = api.feather_alpha(square(0, 0, W, H), W, H, 8);
	assert.ok(f.every((v) => v === 255));
});

test('smooth removes specks and fills pinholes, keeps big shapes', () => {
	const a = square(10, 10, 30, 30);
	a[2 * W + 2] = 255; // speck
	a[20 * W + 20] = 0; // pinhole
	const s = api.smooth_alpha(a, W, H, 2);
	assert.equal(s[2 * W + 2], 0);
	assert.equal(s[20 * W + 20], 255);
	assert.equal(s[15 * W + 15], 255);
	assert.equal(s[5 * W + 5], 0);
});

test('border is a band centred on the selection edge', () => {
	assert.deepEqual({ ...api.border_split(10) }, { out: 5, in: 5 });
	assert.deepEqual({ ...api.border_split(5) }, { out: 3, in: 2 });
	const ex = square(5, 5, 35, 35), co = square(15, 15, 25, 25);
	const b = api.border_alpha(ex, co);
	assert.equal(b[20 * W + 20], 0, 'inside is not selected');
	assert.equal(b[20 * W + 8], 255, 'band is selected');
	assert.equal(b[20 * W + 2], 0, 'outside is not selected');
});

test('rgba ↔ alpha round trip', () => {
	const a = Uint8ClampedArray.from([0, 128, 255]);
	const rgba = api.alpha_to_rgba(a);
	assert.deepEqual([...rgba], [0, 0, 0, 0, 128, 128, 128, 128, 255, 255, 255, 255]);
	assert.deepEqual([...api.rgba_to_alpha(rgba)], [0, 128, 255]);
});

test('Select ▸ Modify menu, Shift+F6, and undoable dialogs are wired', () => {
	const menu = src('../src/js/config-menu.js');
	const modify = menu.slice(menu.indexOf("name: 'Modify'"), menu.indexOf("name: 'Select Subject'"));
	for (const m of ['border', 'smooth', 'expand', 'contract', 'feather']) assert.match(modify, new RegExp(`edit/selection\\.${m}'`));
	assert.match(modify, /name: 'Feather',\s*shortcut: 'Shift \+ F6'/);
	const keys = src('../src/js/core/gui/gui-shortcuts.js');
	assert.match(keys, /event\.shiftKey && !event\.ctrlKey && !event\.metaKey && !event\.altKey && \(event\.code === 'F6'[\s\S]{0,300}\.feather\(\)/);
	const mod = src('../src/js/modules/edit/selection.js');
	for (const m of ['feather', 'smooth', 'border', 'contract']) assert.match(mod, new RegExp(`\\n\\t${m}\\(\\) \\{`));
	assert.match(mod, /Set_selection_action\(finalCanvas, old_mask\)/);
	assert.match(mod, /on_cancel: \(\) => \{\s*baseSel\.set_mask_canvas\(old_mask\)/);
});
