// Flatten Image: uses convert_layers_to_canvas, produces locked Background,
// asks about hidden layers.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const srcFlatten = fs.readFileSync(require.resolve('../src/js/modules/layer/flatten.js'), 'utf8');

test('flatten() uses convert_layers_to_canvas and does not use raw loop/composite ops', () => {
	assert.match(srcFlatten, /this\.Base_layers\.convert_layers_to_canvas\(/);
	assert.doesNotMatch(srcFlatten, /globalCompositeOperation = /);
	assert.doesNotMatch(srcFlatten, /ctx\.globalAlpha = /);
	assert.match(srcFlatten, /Bundle_action\('flatten_image', 'Flatten Image'/);
	assert.match(srcFlatten, /Discard hidden layers\?/);
});

function load() {
	const strip = (f) => fs.readFileSync(require.resolve('../src/js/' + f), 'utf8')
		.replace(/^import .*;$/gm, '').replace(/export default \{[\s\S]*?\};/g, '').replace(/^export default .*;$/gm, '').replace(/\bexport /g, '');
	const ctx = vm.createContext({ config: { layers: [] } });
	vm.runInContext(['libs/layer-tree.js', 'libs/layer-clip.js', 'libs/merge-plan.js'].map(strip).join('\n') + '\nthis.api = { flatten_plan };', ctx);
	return ctx.api;
}
const { flatten_plan } = load();

test('flatten_plan detects hidden layers', () => {
	const layers = [
		{ id: 1, name: 'Background', visible: true, type: 'image' },
		{ id: 2, name: 'Layer 1', visible: false, type: 'image' },
	];
	const plan = flatten_plan(layers);
	assert.equal(plan.ok, true);
	assert.equal(plan.hasHidden, true);
	assert.deepEqual(plan.deleteIds, [1, 2]);
	assert.equal(plan.result.name, 'Background');
	assert.equal(plan.result.locked, true);
	assert.equal(plan.result.type, 'image');
	assert.equal(plan.result.order, 1);
});

test('flatten_plan with all visible layers hasHidden === false', () => {
	const layers = [
		{ id: 1, name: 'Layer 1', visible: true, type: 'image' },
		{ id: 2, name: 'Layer 2', visible: true, type: 'image' },
	];
	const plan = flatten_plan(layers);
	assert.equal(plan.ok, true);
	assert.equal(plan.hasHidden, false);
	assert.deepEqual(plan.deleteIds, [1, 2]);
	assert.equal(plan.result.name, 'Background');
	assert.equal(plan.result.locked, true);
});
