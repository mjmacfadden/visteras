const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createCanvas } = require('@napi-rs/canvas');

function setup() {
	const config = { WIDTH: 40, HEIGHT: 40 };
	const selection = { has_selection: true, mask_canvas: createCanvas(40, 40) };
	const app = { Layers: { Base_selection: selection, notify_mask_changed() {} } };
	const context = vm.createContext({
		app, config, Helper_class: class {}, alertify: {},
		document: { createElement: () => createCanvas(1, 1) },
	});
	const source = fs.readFileSync(require.resolve('../src/js/modules/mask/mask.js'), 'utf8')
		.replace(/^import .*;$/gm, '').replace('export default Mask_class;', 'globalThis.Mask = Mask_class;');
	vm.runInContext(source, context);
	const mask = new context.Mask();
	const layer = { id: 1, x: 5, y: 5, width: 20, height: 20 };
	config.layer = layer;
	const ctx = selection.mask_canvas.getContext('2d');
	ctx.fillStyle = '#fff';
	ctx.fillRect(10, 10, 10, 10);
	return { mask, layer, selection, config };
}
const pixel = (canvas, x, y) => canvas.getContext('2d').getImageData(x, y, 1, 1).data[0];

test('new masks reveal selection, hide its exterior, and invert on request', () => {
	const { mask, layer } = setup();
	const reveal = mask.create_mask_from_selection(layer, true).link;
	assert.equal(pixel(reveal, 8, 8), 255);
	assert.equal(pixel(reveal, 1, 1), 0);
	const hide = mask.create_mask_from_selection(layer, false).link;
	assert.equal(pixel(hide, 8, 8), 0);
	assert.equal(pixel(hide, 1, 1), 255);
});

test('mask brush clips the initial stamp and drag, and deselection restores unrestricted painting', () => {
	const { mask, layer, selection } = setup();
	layer.mask = mask.create_mask(layer, true);
	const tool = { get_mouse_info: e => ({ ...e, click_valid: true, is_drag: true }) };
	mask.start_paint(tool, { x: 15, y: 15 }, '0, 0, 0', { size: 40 });
	assert.equal(pixel(layer.mask.link_canvas, 8, 8), 0);
	assert.equal(pixel(layer.mask.link_canvas, 1, 1), 255);
	mask.move_paint(tool, { x: 24, y: 24 });
	assert.equal(pixel(layer.mask.link_canvas, 18, 18), 255);
	selection.has_selection = false;
	mask.start_paint(tool, { x: 15, y: 15 }, '0, 0, 0', { size: 40 });
	assert.equal(pixel(layer.mask.link_canvas, 1, 1), 0);
});

test('soft selection coverage is preserved without compounding across brush events', () => {
	const { mask, layer, selection } = setup();
	const ctx = selection.mask_canvas.getContext('2d');
	ctx.clearRect(0, 0, 40, 40);
	ctx.fillStyle = 'rgba(255,255,255,0.5)';
	ctx.fillRect(0, 0, 40, 40);
	assert.ok(Math.abs(pixel(mask.create_mask_from_selection(layer, true).link, 8, 8) - 128) <= 1);
	layer.mask = mask.create_mask(layer, true);
	const tool = { get_mouse_info: e => ({ ...e, click_valid: true, is_drag: true }) };
	mask.start_paint(tool, { x: 15, y: 15 }, '0, 0, 0', { size: 40 });
	const first = pixel(layer.mask.link_canvas, 8, 8);
	mask.move_paint(tool, { x: 15, y: 15 });
	assert.equal(pixel(layer.mask.link_canvas, 8, 8), first);
	assert.ok(Math.abs(first - 127) <= 1);
});

test('selection mapping respects mask placement, scaling and linked rotation', () => {
	const { mask, layer } = setup();
	layer.mask = mask.create_mask(layer, true);
	layer.mask.width = 40;
	layer.mask.height = 40;
	let alpha = mask.selection_alpha_for_mask(layer);
	assert.equal(alpha.getContext('2d').getImageData(4, 4, 1, 1).data[3], 255);
	assert.equal(alpha.getContext('2d').getImageData(12, 12, 1, 1).data[3], 0);
	layer.rotate = 90;
	layer.mask.width = layer.mask.height = 20;
	alpha = mask.selection_alpha_for_mask(layer);
	assert.equal(alpha.getContext('2d').getImageData(8, 8, 1, 1).data[3], 255);
});

test('add-mask action defaults to selection and restores the old target on undo', async () => {
	const layer = { id: 1, mask: null };
	const config = { layer, mask_active: false };
	const app = {
		Layers: { Base_selection: { has_selection: true }, get_layer: () => layer, notify_mask_changed() {} },
		GUI: { GUI_layers: { render_layers() {} } },
	};
	const context = vm.createContext({
		app, config,
		Base_action: class { do() {} undo() {} },
		Mask_class: class {
			create_mask_from_selection() { return 'selection'; }
			create_mask() { return 'all'; }
			default_mask_colors() {}
		},
	});
	vm.runInContext(fs.readFileSync(require.resolve('../src/js/actions/add-layer-mask.js'), 'utf8')
		.replace(/^import .*;$/gm, '').replace('export class Add_layer_mask_action', 'globalThis.Action = class'), context);
	const action = new context.Action(1, true);
	await action.do();
	assert.equal(layer.mask, 'selection');
	assert.equal(config.mask_active, true);
	await action.undo();
	assert.equal(layer.mask, null);
	assert.equal(config.mask_active, false);
	await action.do();
	assert.equal(layer.mask, 'selection');
	await action.undo();
	await new context.Action(1, true, false).do();
	assert.equal(layer.mask, 'all');
});
