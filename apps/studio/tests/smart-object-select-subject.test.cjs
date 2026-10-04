const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createCanvas } = require('@napi-rs/canvas');

const rootDir = path.resolve(__dirname, '../../..');

test('bg-auto: require_raster_layer accepts smart objects as well as raster image layers', () => {
	const bgAutoSource = fs.readFileSync(path.join(rootDir, 'apps/studio/src/js/modules/tools/bg_auto.js'), 'utf8');

	// Verify require_raster_layer allows both 'image' and 'smart'
	const fnMatch = bgAutoSource.match(/require_raster_layer\(\)\s*\{([\s\S]*?)\n\t\}/);
	assert.ok(fnMatch, 'require_raster_layer method must exist');
	const fnBody = fnMatch[1];

	assert.ok(fnBody.includes("'smart'"), "require_raster_layer must check for 'smart' layer type");
	assert.match(fnBody, /config\.layer\.type\s*!==\s*'image'\s*&&\s*config\.layer\.type\s*!==\s*'smart'/);
});

test('bg-auto: layer_source_canvas extracts source canvas from smart layers via get_layer_source', () => {
	const bgAutoSource = fs.readFileSync(path.join(rootDir, 'apps/studio/src/js/modules/tools/bg_auto.js'), 'utf8');

	assert.ok(bgAutoSource.includes('get_layer_source(layer)'), 'must define get_layer_source helper');
	assert.ok(bgAutoSource.includes('renderSmart'), 'get_layer_source should check renderSmart');
	assert.ok(bgAutoSource.includes('config.smart_sources'), 'get_layer_source should resolve config.smart_sources');
});

test('bg-auto: functional execution on smart layer', () => {
	const config = {
		layer: {
			id: 42,
			type: 'smart',
			name: 'Hero Smart Object',
			smart_source_id: 'src-123',
			width: 100,
			height: 100,
			x: 0,
			y: 0,
		},
		smart_sources: {
			'src-123': {
				link: createCanvas(100, 100)
			}
		}
	};

	const alertify = {
		error: () => {},
		warning: () => {},
		success: () => {},
	};

	const context = vm.createContext({
		config,
		alertify,
		renderSmart: (layer) => config.smart_sources[layer.smart_source_id].link,
		document: { createElement: (tag) => createCanvas(1, 1) },
		window: {},
		navigator: { platform: 'MacIntel', userAgent: 'Mac' },
		console,
		Object,
		Math,
		Error
	});

	const fullSource = fs.readFileSync(path.join(rootDir, 'apps/studio/src/js/modules/tools/bg_auto.js'), 'utf8');
	const classMatch = fullSource.match(/class Tools_bg_auto_class\s*\{[\s\S]*?\n\}/);
	assert.ok(classMatch, 'class Tools_bg_auto_class must be extractable');

	const classCode = classMatch[0] + '\nglobalThis.Tools_bg_auto_class = Tools_bg_auto_class;';
	vm.runInContext(classCode, context);

	const bgAuto = Object.create(context.Tools_bg_auto_class.prototype);

	// 1. require_raster_layer on smart layer must succeed
	const verifiedLayer = bgAuto.require_raster_layer();
	assert.equal(verifiedLayer.id, 42, 'smart layer must be accepted by require_raster_layer');

	// 2. layer_source_canvas must return a 100x100 canvas without error
	const sourceCanvas = bgAuto.layer_source_canvas(verifiedLayer);
	assert.equal(sourceCanvas.width, 100);
	assert.equal(sourceCanvas.height, 100);

	// 3. Non-image, non-smart layer (e.g. text) must still be rejected
	config.layer = { id: 99, type: 'text', name: 'Header' };
	let errorTriggered = false;
	alertify.error = (msg) => {
		if (msg.includes('convert it to raster')) errorTriggered = true;
	};
	const rejected = bgAuto.require_raster_layer();
	assert.equal(rejected, null, 'text layer must be rejected');
	assert.ok(errorTriggered, 'alertify error must indicate converting to raster');
});

test('gui-properties: smart layers render quick actions (Remove Background)', () => {
	const propsSource = fs.readFileSync(path.join(rootDir, 'apps/studio/src/js/core/gui/gui-properties.js'), 'utf8');

	// Check that smart layers route to render_image_properties
	assert.match(propsSource, /layer\.type\s*===\s*'image'\s*\|\|\s*layer\.type\s*===\s*'smart'/);
});
