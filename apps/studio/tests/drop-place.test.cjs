const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '../src/js/libs/drop-routing.js'), 'utf8')
	.replace(/^import .*;$/gm, '').replace(/\bexport /g, '');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src + '\nthis.lib={is_placeable_image,drop_mode,fit_place_rect,is_blank_start_document};', ctx);
const { is_placeable_image, drop_mode, fit_place_rect, is_blank_start_document } = ctx.lib;
const png = { name: 'a.png', type: 'image/png' };
const jpgNoType = { name: 'b.JPG', type: '' };

test('raster images are placeable; psd, svg, vsd and fonts are not', () => {
	assert.ok(is_placeable_image(png));
	assert.ok(is_placeable_image(jpgNoType));
	assert.ok(!is_placeable_image({ name: 'x.psd', type: 'image/vnd.adobe.photoshop' }));
	assert.ok(!is_placeable_image({ name: 'x.svg', type: 'image/svg+xml' }));
	assert.ok(!is_placeable_image({ name: 'x.vsd', type: '' }));
	assert.ok(!is_placeable_image({ name: 'x.ttf', type: 'font/ttf' }));
});

test('drop onto a working document places; shift, empty doc or mixed files open', () => {
	assert.strictEqual(drop_mode({ files: [png, jpgNoType] }), 'place');
	assert.strictEqual(drop_mode({ files: [png], shiftKey: true }), 'open');
	assert.strictEqual(drop_mode({ files: [png], documentEmpty: true }), 'open');
	assert.strictEqual(drop_mode({ files: [png], hasDocument: false }), 'open');
	assert.strictEqual(drop_mode({ files: [png, { name: 'p.psd', type: '' }] }), 'open');
	assert.strictEqual(drop_mode({ files: [] }), 'open');
});

test('place fits large images inside the canvas and keeps small ones at 100%', () => {
	const big = fit_place_rect(2000, 1000, 800, 600);
	assert.deepStrictEqual([big.width, big.height, big.x, big.y], [800, 400, 0, 100]);
	const small = fit_place_rect(200, 100, 800, 600);
	assert.deepStrictEqual([small.width, small.height, small.x, small.y, small.scale], [200, 100, 300, 250, 1]);
});

test('a freshly opened image is a real document; an untouched Untitled one is not', () => {
	assert.strictEqual(is_blank_start_document(true, 'Untitled-1'), true);
	assert.strictEqual(is_blank_start_document(true, 'photo.JPG'), false);
	assert.strictEqual(is_blank_start_document(false, 'Untitled-1'), false);
});
