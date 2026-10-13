const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const lib = () => import('../src/js/libs/curves.js');

test('Curves defaults are identity, and moved endpoints clamp the tails', async () => {
	const { curves_lut, default_curves_params } = await lib();
	assert.deepEqual([...curves_lut(default_curves_params().rgb)], Array.from({ length: 256 }, (_, i) => i));
	const lut = curves_lut([{ input: 30, output: 20 }, { input: 200, output: 235 }]);
	assert.equal(lut[0], 20); assert.equal(lut[255], 235);
});

test('monotone cubic passes through anchors without overshooting; extrema remain bounded', async () => {
	const { curves_lut } = await lib();
	const points = [{ input: 0, output: 0 }, { input: 60, output: 150 }, { input: 150, output: 180 }, { input: 255, output: 255 }];
	const lut = curves_lut(points);
	for (const p of points) assert.equal(lut[p.input], p.output);
	for (let i = 1; i < 256; i++) assert.ok(lut[i] >= lut[i - 1]);
	assert.ok(lut[128] > 128);
	const inverted = curves_lut([{ input: 0, output: 255 }, { input: 128, output: 0 }, { input: 255, output: 255 }]);
	assert.equal(inverted[128], 0); assert.equal(inverted[255], 255);
});

test('Curves applies individual channels before RGB, preserving alpha and transparent pixels', async () => {
	const { default_curves_params, curves_lut, compose_curves, apply_curves } = await lib();
	const p = default_curves_params();
	p.red = [{ input: 0, output: 20 }, { input: 255, output: 200 }];
	p.rgb = [{ input: 0, output: 0 }, { input: 100, output: 160 }, { input: 255, output: 255 }];
	const expected = curves_lut(p.rgb)[curves_lut(p.red)[128]];
	assert.equal(compose_curves(p).r[128], expected);
	const data = new Uint8ClampedArray([128, 50, 200, 120, 80, 90, 100, 0]);
	apply_curves(data, p);
	assert.deepEqual([...data], [expected, curves_lut(p.rgb)[50], curves_lut(p.rgb)[200], 120, 80, 90, 100, 0]);
});

test('Curves PSD binary round trip and legacy VSD placeholder migration preserve anchors', async () => {
	const { default_curves_params, studio_curves_to_psd, psd_curves_to_studio, migrate_psd_unsupported_curves } = await lib();
	const { writePsd, readPsd } = require('ag-psd');
	const p = default_curves_params(); p.blue.splice(1, 0, { input: 128, output: 170 });
	const adj = studio_curves_to_psd(p);
	const binary = writePsd({ width: 2, height: 1, children: [{ name: 'Curves 1', adjustment: adj }] });
	const decoded = readPsd(binary, { skipLayerImageData: true, skipCompositeImageData: true });
	assert.deepEqual(psd_curves_to_studio(decoded.children[0].adjustment), p);
	const layer = { name: 'Curves 1 (unsupported)', psd_unsupported: { type: 'curves', raw: adj } };
	migrate_psd_unsupported_curves(layer);
	assert.equal(layer.name, 'Curves 1'); assert.equal(layer.adjustment_type, 'curves');
	assert.equal(layer.psd_unsupported, undefined); assert.deepEqual(layer.params, p);
});

test('Curves shortcut accepts only browser-safe M and uses physical key codes', async () => {
	const { eventMatchesChord } = await import('../src/js/libs/browser_shortcuts.js');
	for (const mac of [true, false]) {
		const e = { code: 'KeyM', key: 'µ', metaKey: mac, ctrlKey: true, altKey: !mac };
		assert.equal(eventMatchesChord(e, { meta: true, key: 'M' }, mac), true);
		assert.equal(eventMatchesChord({ ...e, code: 'KeyQ', key: 'M' }, { meta: true, key: 'M' }, mac), false);
		assert.equal(eventMatchesChord({ ...e, ctrlKey: !mac, altKey: false }, { meta: true, key: 'M' }, mac), false);
	}
	const menu = fs.readFileSync(require.resolve('../src/js/config-menu.js'), 'utf8');
	assert.match(menu, /name: 'Curves',\s*ellipsis: true,\s*shortcut: 'Ctrl \+ Alt \+ M'/);
	const shortcuts = fs.readFileSync(require.resolve('../src/js/core/gui/gui-shortcuts.js'), 'utf8');
	assert.match(shortcuts, /eventMatchesChord\(event, \{ meta: true, key: 'M' \}/);
	assert.match(shortcuts, /create_or_edit\('curves'\)/);
	assert.match(fs.readFileSync(require.resolve('../src/js/core/gui/gui-adjustments.js'), 'utf8'), /target: 'layer\/adjustment.curves'/);
});

test('Curves graph creates and removes points with one undo commit per gesture; endpoints survive', async () => {
	const mod = await lib();
	const src = fs.readFileSync(require.resolve('../src/js/core/gui/gui-properties.js'), 'utf8')
		.replace(/^import .*;$/gm, '').replace(/import\.meta\.url/g, '"file:///test.js"').replace(/export default GUI_properties_class;/, 'this.GUI_properties_class = GUI_properties_class;');
	const context = vm.createContext({ ...mod });
	vm.runInContext(src, context);
	const gui = Object.create(context.GUI_properties_class.prototype);
	const layer = { id: 1, params: mod.default_curves_params() };
	const listeners = {};
	const canvas = { addEventListener: (k, v) => { listeners[k] = v; }, removeEventListener: k => { delete listeners[k]; },
		setPointerCapture() {}, hasPointerCapture: () => false, getBoundingClientRect: () => ({ left: 0, top: 0, width: 255, height: 255 }) };
	const select = { addEventListener() {} }, reset = { addEventListener() {} };
	const target = { dataset: {}, querySelector: q => q === '.curves_graph' ? canvas : q === '#curves_channel' ? select : reset };
	let commits = 0;
	gui.snapshot_params = () => { gui.params_at_interaction_start = JSON.parse(JSON.stringify(layer.params)); };
	gui.commit_params = () => { commits++; }; gui.apply_live_levels = () => {};
	gui.draw_curves_graph = () => {}; gui.update_levels_histogram = () => {};
	gui.render_curves_properties(target, layer, true);
	const event = (x, y) => ({ button: 0, pointerId: 1, clientX: x, clientY: y, preventDefault() {} });
	listeners.pointerdown(event(128, 80));
	listeners.pointermove(event(128, 60));
	assert.equal(layer.params.rgb[1].output, 195); assert.equal(commits, 0);
	listeners.pointerup({ type: 'pointerup' }); assert.equal(commits, 1);
	listeners.pointerdown(event(128, 60)); listeners.pointermove(event(300, 60));
	listeners.pointerup({ type: 'pointerup' }); assert.equal(commits, 2); assert.equal(layer.params.rgb.length, 2);
	listeners.pointerdown(event(0, 255)); listeners.pointermove(event(-50, 300));
	listeners.pointerup({ type: 'pointerup' }); assert.equal(layer.params.rgb.length, 2);
});

test('Curves pixel path renders adjusted pixels into a canvas', async () => {
	const { apply_curves, default_curves_params } = await lib();
	const { createCanvas } = require('@napi-rs/canvas');
	const src = fs.readFileSync(require.resolve('../src/js/core/base-layers.js'), 'utf8');
	const method = src.slice(src.indexOf('\tapply_adjustment_effect('), src.indexOf('\tget_adjustment_filter_string(', src.indexOf('\tapply_adjustment_effect(')));
	const context = vm.createContext({ apply_curves });
	vm.runInContext('this.Renderer = class { ' + method + ' }', context);
	const canvas = createCanvas(2, 1), ctx = canvas.getContext('2d');
	ctx.fillStyle = 'rgb(128,128,128)'; ctx.fillRect(0, 0, 2, 1);
	const output = createCanvas(2, 1), params = default_curves_params();
	params.rgb.splice(1, 0, { input: 128, output: 200 });
	new context.Renderer().apply_adjustment_effect(output.getContext('2d'), canvas, { adjustment_type: 'curves', params }, 2, 1);
	assert.deepEqual([...output.getContext('2d').getImageData(0, 0, 2, 1).data], [200, 200, 200, 255, 200, 200, 200, 255]);
});
