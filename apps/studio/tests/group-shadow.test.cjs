const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createCanvas } = require('@napi-rs/canvas');

function runtime() {
	const config = { layers: [], WIDTH: 40, HEIGHT: 24 };
	const context = vm.createContext({ config, console, alertify: { success() {}, warning() {}, error() {} }, document: { createElement: () => createCanvas(1, 1) } });
	for (const file of ['libs/layer-tree.js', 'libs/layer-clip.js', 'libs/group-composite.js', 'core/base-layers.js']) {
		const source = fs.readFileSync(require.resolve('../src/js/' + file), 'utf8')
			.replace(/^import .*;$/gm, '').replace(/export default \{[\s\S]*?\};/g, '').replace(/^export default .*;$/gm, '').replace(/\bexport /g, '');
		vm.runInContext(source, context);
	}
	const renderer = vm.runInContext('Object.create(Base_layers_class.prototype)', context);
	renderer.disabled_filter_id = [];
	renderer.Base_gui = { modules: { 'effects/shadow': {
		render_pre(ctx, filter) {
			const p = filter.params;
			ctx.filter = `drop-shadow(${p.x}px ${p.y}px ${p.value}px rgba(0,0,0,${p.opacity / 100}))`;
		},
		render_post(ctx) { ctx.filter = 'none'; },
	} } };
	renderer._draw_layer_content = (ctx, layer) => ctx.drawImage(layer.link, layer.x, layer.y, layer.width, layer.height);
	return { config, context, renderer };
}
const shadow = { name: 'shadow', params: { x: 8, y: 0, value: 0, opacity: 50, color: '#000000' } };
function image(id, parent_id, x, color) {
	const link = createCanvas(8, 8), ctx = link.getContext('2d');
	ctx.fillStyle = color; ctx.fillRect(0, 0, 8, 8);
	return { id, parent_id, type: 'image', link, x, y: 4, width: 8, height: 8, opacity: 100, filters: [], composition: 'source-over' };
}
function group(id, parent_id = 0) {
	return { id, parent_id, type: 'group', opacity: 100, filters: [shadow], composition: 'pass-through' };
}
function render(renderer, config, layers) {
	config.layers = layers;
	const canvas = createCanvas(40, 24), ctx = canvas.getContext('2d');
	renderer.render_objects(ctx, createCanvas(40, 24), layers, () => ctx.save());
	ctx.restore();
	return canvas;
}
function pixel(canvas, x, y = 6) { return [...canvas.getContext('2d').getImageData(x, y, 1, 1).data]; }

test('group shadow is applied once to overlapping children and stays behind the combined content', () => {
	const { config, renderer } = runtime();
	const layers = [image(3, 1, 8, 'blue'), image(2, 1, 4, 'red'), group(1)];
	const canvas = render(renderer, config, layers);
	assert.deepEqual(pixel(canvas, 13), [0, 0, 255, 255]);
	assert.ok(Math.abs(pixel(canvas, 18)[3] - 128) <= 1);
	assert.equal(layers[2].type, 'group');
	assert.equal(layers[0].filters.length, 0);
});

test('nested styled groups render recursively, and hidden groups contribute no pixels', () => {
	const { config, renderer } = runtime();
	const layers = [image(3, 2, 4, 'red'), group(2, 1), group(1)];
	const canvas = render(renderer, config, layers);
	assert.ok(pixel(canvas, 23)[3] > 0, 'outer shadow includes the inner group shadow');
	layers[2].visible = false;
	assert.equal(pixel(render(renderer, config, layers), 6)[3], 0);
});

test('PSD group effects survive import and export with their saved settings', async () => {
	const { context } = runtime();
	vm.runInContext(fs.readFileSync(require.resolve('../src/js/libs/psd.js'), 'utf8')
		.replace(/^import .*;$/gm, '').replace(/\bexport (?=(?:async )?function)/g, ''), context);
	let imported;
	context.app = { Documents: { create_document_from_psd_data: data => { imported = data; } } };
	context.psdFixture = { width: 40, height: 24, children: [{ name: 'Group 1', children: [], effects: {
		dropShadow: [{ enabled: true, angle: 90, distance: { value: 25 }, size: { value: 54 }, opacity: 0.35, color: { r: 0, g: 0, b: 0 } }],
	} }] };
	vm.runInContext('agPsdModulePromise = Promise.resolve({readPsd: () => psdFixture})', context);
	await context.load_psd(new ArrayBuffer(0), 'mockup.psd');
	const layer = imported.layers[0];
	assert.equal(layer.filters[0].params.y, 25);
	assert.equal(layer.filters[0].params.value, 54);
	assert.equal(layer.filters[0].params.opacity, 35);
	context.exportLayers = imported.layers;
	const exported = vm.runInContext('build_psd_children_tree(exportLayers, 0, 40, 24)', context);
	assert.equal(exported[0].effects.dropShadow[0].distance.value, 25);
	assert.equal(exported[0].effects.dropShadow[0].opacity, 0.35);
});

test('user PSD imports its enabled Group 1 shadow', { skip: !process.env.STUDIO_PSD_FIXTURE }, async () => {
	const { context } = runtime();
	const agPsd = require('ag-psd');
	const { ImageData } = require('@napi-rs/canvas');
	agPsd.initializeCanvas(createCanvas, (w, h) => new ImageData(w, h));
	context.psdFixture = agPsd.readPsd(fs.readFileSync(process.env.STUDIO_PSD_FIXTURE), { skipThumbnail: true });
	vm.runInContext(fs.readFileSync(require.resolve('../src/js/libs/psd.js'), 'utf8')
		.replace(/^import .*;$/gm, '').replace(/\bexport (?=(?:async )?function)/g, ''), context);
	let imported;
	context.app = { Documents: { create_document_from_psd_data: data => { imported = data; } } };
	vm.runInContext('agPsdModulePromise = Promise.resolve({readPsd: () => psdFixture})', context);
	await context.load_psd(new ArrayBuffer(0), 'fixture.psd');
	const group = imported.layers.find(layer => layer.name === 'Group 1');
	assert.equal(group.type, 'group');
	assert.equal(group.filters[0].name, 'shadow');
	assert.equal(group.filters[0].params.y, 25);
	assert.equal(group.filters[0].params.value, 54);
	assert.equal(group.filters[0].params.opacity, 35);
});
