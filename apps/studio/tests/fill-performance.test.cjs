const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createCanvas } = require('@napi-rs/canvas');

const rootDir = path.resolve(__dirname, '../../..');

test('base-selection: restore_outside_selection uses hardware composite operations and avoids getImageData loops', () => {
	const baseSelPath = path.join(rootDir, 'apps/studio/src/js/core/base-selection.js');
	const content = fs.readFileSync(baseSelPath, 'utf8');

	// Extract restore_outside_selection implementation
	const methodMatch = content.match(/restore_outside_selection\s*\([^)]*\)\s*\{([\s\S]*?)\n\t\}/);
	assert.ok(methodMatch, 'restore_outside_selection method must exist');
	const methodBody = methodMatch[1];

	// Ensure no CPU getImageData pixel loops
	assert.ok(!methodBody.includes('getImageData'), 'restore_outside_selection must not call getImageData');
	assert.ok(!methodBody.includes('putImageData'), 'restore_outside_selection must not call putImageData');

	// Verify GPU composite operations
	assert.ok(methodBody.includes('destination-in'), 'must use destination-in composite operation');
	assert.ok(methodBody.includes('destination-over'), 'must use destination-over composite operation');
});

test('base-selection: restore_outside_selection composites selection correctly', () => {
	const config = { WIDTH: 40, HEIGHT: 40 };
	const context = vm.createContext({
		config,
		document: { createElement: () => createCanvas(1, 1) },
	});
	const source = fs.readFileSync(path.join(rootDir, 'apps/studio/src/js/core/base-selection.js'), 'utf8')
		.replace(/^import .*;$/gm, '')
		.replace(/var instance = null;/g, '')
		.replace(/export default \w+;/, 'globalThis.Base_selection_class = Base_selection_class;');
	vm.runInContext(source, context);

	const baseSelection = Object.create(context.Base_selection_class.prototype);
	baseSelection.has_selection = true;
	baseSelection.mask_canvas = createCanvas(40, 40);
	const mctx = baseSelection.mask_canvas.getContext('2d');
	mctx.fillStyle = '#000000';
	mctx.fillRect(10, 10, 20, 20); // Selected area

	const layer = { width: 40, height: 40, x: 0, y: 0 };

	const original = createCanvas(40, 40);
	const octx = original.getContext('2d');
	octx.fillStyle = '#0000ff'; // Blue
	octx.fillRect(0, 0, 40, 40);

	const edited = createCanvas(40, 40);
	const ectx = edited.getContext('2d');
	ectx.fillStyle = '#ff0000'; // Red
	ectx.fillRect(0, 0, 40, 40);

	baseSelection.restore_outside_selection(edited, original, layer);

	const edata = edited.getContext('2d').getImageData(0, 0, 40, 40).data;
	// Inside selection (15, 15): Should be red (255, 0, 0)
	const idxInside = (15 * 40 + 15) * 4;
	assert.equal(edata[idxInside], 255, 'Inside selection R should be 255');
	assert.equal(edata[idxInside + 2], 0, 'Inside selection B should be 0');

	// Outside selection (5, 5): Should be blue (0, 0, 255)
	const idxOutside = (5 * 40 + 5) * 4;
	assert.equal(edata[idxOutside], 0, 'Outside selection R should be 0');
	assert.equal(edata[idxOutside + 2], 255, 'Outside selection B should be 255');
});

test('selection: fill() assigns layer.link_canvas and renders optimistically before do_action', () => {
	const selContent = fs.readFileSync(path.join(rootDir, 'apps/studio/src/js/tools/selection.js'), 'utf8');

	// Find the fill_layer section in fill()
	const fillLayerBlockIdx = selContent.indexOf("'fill_layer'");
	assert.ok(fillLayerBlockIdx !== -1, 'fill() must create fill_layer action');
	const fillPreceeding = selContent.slice(fillLayerBlockIdx - 300, fillLayerBlockIdx);

	assert.ok(fillPreceeding.includes('layer.link_canvas = fillCanvas'), 'fill() must assign layer.link_canvas optimistically before fill_layer');
	assert.ok(fillPreceeding.includes('app.Layers.render()'), 'fill() must call app.Layers.render() optimistically before fill_layer');

	// Find the fill_mask section in fill()
	const fillMaskBlockIdx = selContent.indexOf("'fill_mask'");
	assert.ok(fillMaskBlockIdx !== -1, 'fill() must create fill_mask action');
	const fillMaskPreceeding = selContent.slice(fillMaskBlockIdx - 300, fillMaskBlockIdx);

	assert.ok(fillMaskPreceeding.includes('layer.mask.link_canvas = maskCanvas'), 'fill() must assign layer.mask.link_canvas optimistically before fill_mask');
	assert.ok(fillMaskPreceeding.includes('app.Layers.render()'), 'fill() must call app.Layers.render() optimistically before fill_mask');
});

test('selection: delete_selection() assigns layer.link_canvas and renders optimistically before do_action', () => {
	const selContent = fs.readFileSync(path.join(rootDir, 'apps/studio/src/js/tools/selection.js'), 'utf8');

	const delBlockIdx = selContent.indexOf("'delete_selection'");
	assert.ok(delBlockIdx !== -1, 'delete_selection() must create delete_selection action');
	const delPreceeding = selContent.slice(delBlockIdx - 300, delBlockIdx);

	assert.ok(delPreceeding.includes('layer.link_canvas = delCanvas'), 'delete_selection() must assign layer.link_canvas optimistically');
	assert.ok(delPreceeding.includes('app.Layers.render()'), 'delete_selection() must call app.Layers.render() optimistically');
});

test('actions: Update_layer_image_action assigns link_canvas and renders before async storage', () => {
	const actionContent = fs.readFileSync(path.join(rootDir, 'apps/studio/src/js/actions/update-layer-image.js'), 'utf8');

	const doMatch = actionContent.match(/async do\(\)\s*\{([\s\S]*?)\n\t\}/);
	assert.ok(doMatch, 'do method must exist');
	const doBody = doMatch[1];

	const bridgeIdx = doBody.indexOf('layer.link_canvas = committed_canvas');
	const renderIdx = doBody.indexOf('app.Layers.render()');
	const toBlobIdx = doBody.indexOf('this.canvas.toBlob');

	assert.ok(bridgeIdx !== -1, 'Update_layer_image_action must set layer.link_canvas immediately');
	assert.ok(renderIdx !== -1, 'Update_layer_image_action must trigger render immediately');
	assert.ok(toBlobIdx !== -1, 'Update_layer_image_action has async toBlob');
	assert.ok(bridgeIdx < toBlobIdx, 'bridge assignment must precede async toBlob conversion');
	assert.ok(renderIdx < toBlobIdx, 'immediate render must precede async toBlob conversion');
});

test('actions: Update_layer_mask_image_action updates mask link and renders before async storage', () => {
	const maskActionContent = fs.readFileSync(path.join(rootDir, 'apps/studio/src/js/actions/update-layer-mask-image.js'), 'utf8');

	const doMatch = maskActionContent.match(/async do\(\)\s*\{([\s\S]*?)\n\t\}/);
	assert.ok(doMatch, 'do method must exist');
	const doBody = doMatch[1];

	const drawIdx = doBody.indexOf('ctx.drawImage(this.canvas, 0, 0)');
	const renderIdx = doBody.indexOf('app.Layers.render()');
	const toDataURLIdx = doBody.indexOf('this.canvas.toDataURL');

	assert.ok(drawIdx !== -1, 'Update_layer_mask_image_action must draw this.canvas to mask immediately');
	assert.ok(renderIdx !== -1, 'Update_layer_mask_image_action must render immediately');
	assert.ok(toDataURLIdx !== -1, 'Update_layer_mask_image_action has toDataURL');
	assert.ok(drawIdx < toDataURLIdx, 'mask update must precede toDataURL serialization');
	assert.ok(renderIdx < toDataURLIdx, 'mask render must precede toDataURL serialization');
});
