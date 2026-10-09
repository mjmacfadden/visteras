// Item 3 (broken): Vector Smart Objects blurred when scaled up; now they
// re-render from the embedded SVG at the drawn size.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load() {
	const src = fs.readFileSync(require.resolve('../src/js/libs/vector-smart-render.js'), 'utf8').replace(/\bexport /g, '');
	const ctx = vm.createContext({ setTimeout, clearTimeout, Promise });
	vm.runInContext(src + '\nthis.api = { vector_svg_url, wanted_size, covers, crisp_vector_source, _reset_vector_smart_cache, MAX_SIDE };', ctx);
	return ctx.api;
}
const api = load();
const SVG = 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E';
const source = (extra = {}) => ({
	id: 's1', revision: 1, link: { width: 40, height: 40 },
	document: { layers: [{ id: 1, type: 'image', is_vector: true, filters: [] }], data: [{ id: 1, data: SVG }] },
	...extra,
});

test('vector_svg_url: only unedited Vector pastes (one is_vector SVG layer)', () => {
	assert.equal(api.vector_svg_url(source()), SVG);
	assert.equal(api.vector_svg_url(source({ document: { layers: [{ id: 1, is_vector: true }, { id: 2 }], data: [{ id: 1, data: SVG }] } })), null, 'edited contents');
	assert.equal(api.vector_svg_url(source({ document: { layers: [{ id: 1, is_vector: false }], data: [{ id: 1, data: SVG }] } })), null, 'raster smart object');
	assert.equal(api.vector_svg_url(source({ document: { layers: [{ id: 1, is_vector: true }], data: [{ id: 1, data: 'data:image/png;base64,x' }] } })), null);
	assert.equal(api.vector_svg_url(null), null);
});

test('wanted_size adds headroom and caps huge sizes', () => {
	assert.deepEqual(JSON.parse(JSON.stringify(api.wanted_size(400, 200))), { w: 500, h: 250 });
	const big = api.wanted_size(20000, 20000);
	assert.ok(big.w <= api.MAX_SIDE && big.h <= api.MAX_SIDE);
	assert.ok(api.covers(100, 100, 100, 100) && !api.covers(50, 100, 100, 100));
});

test('scaling up schedules one crisp re-render, then draws from it; a new revision invalidates', async () => {
	api._reset_vector_smart_cache();
	const calls = [];
	const rasterize = (url, w, h) => { calls.push([w, h]); return Promise.resolve({ width: w, height: h }); };
	let ready = 0;
	const s = source();
	assert.equal(api.crisp_vector_source(s, 30, 30, () => ready++, rasterize), null, 'preview already covers it');
	assert.equal(api.crisp_vector_source(s, 320, 320, () => ready++, rasterize), null, 'first frame uses the preview');
	api.crisp_vector_source(s, 330, 330, () => ready++, rasterize); // debounced, same request
	await new Promise((r) => setTimeout(r, 200));
	assert.deepEqual(calls, [[413, 413]]);
	assert.equal(ready, 1);
	const crisp = api.crisp_vector_source(s, 320, 320, null, rasterize);
	assert.equal(crisp.width, 413);
	s.revision = 2; // Edit Contents / Replace Contents
	assert.equal(api.crisp_vector_source(s, 320, 320, null, rasterize), null);
	await new Promise((r) => setTimeout(r, 200));
	assert.equal(calls.length, 2);
});

test('base-layers draws a smart layer from the crisp render only without Smart Filters', () => {
	const src = fs.readFileSync(require.resolve('../src/js/core/base-layers.js'), 'utf8');
	assert.match(src, /import \{ crisp_vector_source \} from '\.\/\.\.\/libs\/vector-smart-render\.js';/);
	assert.match(src, /if \(smartSource && source === smartSource\.link\) \{\n\t+const crisp = crisp_vector_source\(smartSource, targetWidth, targetHeight, \(\) => this\.invalidate\(\{ document: true \}\)\);/);
});
