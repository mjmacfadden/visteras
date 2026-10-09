// Audit fix #6: Canvas Size 9-point anchor (centre default) + Relative.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(require.resolve('../src/js/libs/canvas-anchor.js'), 'utf8').replace(/\bexport /g, '') + '\nthis.api = { ANCHORS, DEFAULT_ANCHOR, anchor_offset, resolve_canvas_size, anchor_grid_html };', ctx);
const api = ctx.api;
const off = (...a) => JSON.parse(JSON.stringify(api.anchor_offset(...a)));

test('centre is the default anchor and splits the added space', () => {
	assert.equal(api.DEFAULT_ANCHOR, 'c');
	assert.deepEqual(off('c', 100, 100, 200, 140), { dx: 50, dy: 20 });
	assert.deepEqual(off('bogus', 100, 100, 200, 140), { dx: 50, dy: 20 });
});

test('corner and edge anchors keep that side fixed (also when shrinking)', () => {
	assert.deepEqual(off('nw', 100, 100, 200, 140), { dx: 0, dy: 0 });
	assert.deepEqual(off('se', 100, 100, 200, 140), { dx: 100, dy: 40 });
	assert.deepEqual(off('n', 100, 100, 200, 140), { dx: 50, dy: 0 });
	assert.deepEqual(off('w', 100, 100, 200, 140), { dx: 0, dy: 20 });
	assert.deepEqual(off('s', 100, 100, 60, 60), { dx: -20, dy: -40 });
	assert.equal(api.ANCHORS.length, 9);
});

test('Relative adds to (or with negatives removes from) the current size', () => {
	assert.deepEqual(JSON.parse(JSON.stringify(api.resolve_canvas_size(800, 600, 40, 40, true))), { width: 840, height: 640 });
	assert.deepEqual(JSON.parse(JSON.stringify(api.resolve_canvas_size(800, 600, -100, 0, true))), { width: 700, height: 600 });
	assert.deepEqual(JSON.parse(JSON.stringify(api.resolve_canvas_size(800, 600, 1000, 900, false))), { width: 1000, height: 900 });
});

test('grid HTML: 9 buttons, the selected one pressed, hidden pop_data_anchor input', () => {
	const html = api.anchor_grid_html('c');
	assert.equal((html.match(/data-anchor=/g) || []).length, 9);
	assert.match(html, /data-anchor="c" aria-label="Anchor c" aria-pressed="true"/);
	assert.match(html, /<input type="hidden" id="pop_data_anchor" value="c">/);
});

test('size.js: Relative + Anchor in the dialog; content, masks and adjustments follow', () => {
	const src = fs.readFileSync(require.resolve('../src/js/modules/image/size.js'), 'utf8');
	assert.match(src, /\{name: "relative", title: "Relative:", value: false\},\n\t+\{title: "Anchor:", html: anchor_grid_html\(DEFAULT_ANCHOR\)\},/);
	assert.match(src, /var shift = anchor_offset\(data\.anchor \|\| DEFAULT_ANCHOR, config\.WIDTH, config\.HEIGHT/);
	assert.match(src, /patch\.mask = Object\.assign\(\{\}, lyr\.mask, \{ x: \(lyr\.mask\.x \|\| 0\) \+ shift\.dx/);
	assert.match(src, /if \(lyr\.type === 'adjustment'\) \{/);
	assert.match(src, /resolve_canvas_size\(old_w, old_h/);
});
