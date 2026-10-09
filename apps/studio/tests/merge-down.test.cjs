// Item 2 (broken): Merge Down deleted groups, ignored clipping/blend modes and
// dropped the parent group. Plan rules + wiring.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load() {
	const strip = (f) => fs.readFileSync(require.resolve('../src/js/' + f), 'utf8')
		.replace(/^import .*;$/gm, '').replace(/export default \{[\s\S]*?\};/g, '').replace(/^export default .*;$/gm, '').replace(/\bexport /g, '');
	const ctx = vm.createContext({ config: { layers: [] } });
	vm.runInContext(['libs/layer-tree.js', 'libs/layer-clip.js', 'libs/merge-plan.js'].map(strip).join('\n') + '\nthis.api = { merge_down_plan, MERGE_MESSAGES };', ctx);
	return ctx.api;
}
const { merge_down_plan, MERGE_MESSAGES } = load();
const img = (id, order, extra = {}) => ({ id, order, type: 'image', name: 'L' + id, opacity: 100, composition: 'source-over', visible: true, parent_id: 0, ...extra });
const grp = (id, order, extra = {}) => ({ id, order, type: 'group', name: 'G' + id, visible: true, parent_id: 0, ...extra });
const plain = (v) => JSON.parse(JSON.stringify(v));

test('a layer directly above a group is NOT merged into it (no group deletion)', () => {
	const layers = [img(1, 1, { parent_id: 3 }), img(2, 2, { parent_id: 3 }), grp(3, 3), img(4, 4)];
	const p = merge_down_plan(layers, 4);
	assert.equal(p.ok, false);
	assert.equal(p.error, MERGE_MESSAGES.lowerGroup);
});

test('inside a group: merges with the sibling below and stays in the group', () => {
	const layers = [img(1, 1, { parent_id: 3, name: 'Bottom', opacity: 70, composition: 'multiply' }), img(2, 2, { parent_id: 3 }), grp(3, 3), img(4, 4)];
	const p = merge_down_plan(layers, 2);
	assert.equal(p.ok, true);
	assert.equal(p.mode, 'pair');
	assert.equal(p.lower.id, 1);
	assert.deepEqual(plain(p.result), { name: 'Bottom', parent_id: 3, order: 1, opacity: 70, composition: 'multiply', clipped: false });
	assert.deepEqual(plain(p.deleteIds), [2, 1]);
	assert.equal(p.renderLower.opacity, 100, 'lower opacity/blend live on the result, not baked twice');
	assert.equal(p.renderLower.composition, 'source-over');
});

test('bottom layer of a group has nothing below (does not jump out of the group)', () => {
	const layers = [img(1, 1), img(2, 2, { parent_id: 3 }), grp(3, 3)];
	assert.equal(merge_down_plan(layers, 2).error, MERGE_MESSAGES.bottom);
});

test('clipping: a clipped layer merges into its base; both-clipped keeps the result clipped', () => {
	const base = [img(1, 1), img(2, 2, { clipped: true, composition: 'overlay' })];
	const p = merge_down_plan(base, 2);
	assert.equal(p.renderUpper.clipped, true, 'clipped to the lower layer inside the merge');
	assert.equal(p.renderUpper.composition, 'overlay', 'custom blend kept for the compositor');
	assert.equal(p.result.clipped, false);
	const both = [img(1, 1), img(2, 2, { clipped: true }), img(3, 3, { clipped: true })];
	const q = merge_down_plan(both, 3);
	assert.equal(q.renderUpper.clipped, false);
	assert.equal(q.result.clipped, true, 'still clipped to the same base');
	const legacy = merge_down_plan([img(1, 1), img(2, 2, { composition: 'source-atop' })], 2);
	assert.equal(legacy.renderUpper.composition, 'source-over');
	assert.equal(legacy.renderUpper.clipped, true);
});

test('refuses adjustment targets and hidden layers', () => {
	assert.equal(merge_down_plan([{ ...img(1, 1), type: 'adjustment' }, img(2, 2)], 2).error, MERGE_MESSAGES.lowerAdjustment);
	assert.equal(merge_down_plan([img(1, 1, { visible: false }), img(2, 2)], 2).error, MERGE_MESSAGES.hidden);
	assert.equal(merge_down_plan([img(1, 1)], 99).error, MERGE_MESSAGES.none);
});

test('a selected group → Merge Group in place (keeps its parent and order)', () => {
	const layers = [img(1, 1, { parent_id: 3 }), img(2, 2, { parent_id: 3 }), grp(3, 3, { parent_id: 5 }), img(4, 4, { parent_id: 5 }), grp(5, 5)];
	const p = merge_down_plan(layers, 3);
	assert.equal(p.mode, 'group');
	assert.deepEqual(p.descendants.map((l) => l.id).sort(), [1, 2]);
	assert.equal(p.result.parent_id, 5);
	assert.equal(p.result.order, 3);
	assert.deepEqual(plain(p.deleteIds), [3]);
	assert.equal(merge_down_plan([grp(1, 1)], 1).error, MERGE_MESSAGES.emptyGroup);
});

test('merge.js uses the real compositor, one undo step, and binds Ctrl/⌘E', () => {
	const src = fs.readFileSync(require.resolve('../src/js/modules/layer/merge.js'), 'utf8');
	assert.match(src, /this\.Base_layers\.render_objects\(ctx, temp, layersTopFirst/);
	assert.doesNotMatch(src, /globalCompositeOperation = /, 'no raw composite ops');
	assert.match(src, /new app\.Actions\.Bundle_action\('merge_layers'/);
	assert.match(src, /event\.code !== 'KeyE'/);
	assert.match(src, /new app\.Actions\.Update_layer_action\(plan\.into, \{[\s\S]*mask:\s*null,\s*filters:\s*\[\]/);
	const menu = fs.readFileSync(require.resolve('../src/js/config-menu.js'), 'utf8');
	assert.match(menu, /name: 'Merge Down',\n\t+shortcut: 'Ctrl \+ E',/);
});

test('Merge Down onto the locked Background merges into it instead of aborting', () => {
	const p = merge_down_plan([img(1, 1, { name: 'Background', locked: true }), img(2, 2)], 2);
	assert.equal(p.ok, true);
	assert.equal(p.into, 1);
	assert.deepEqual(plain(p.deleteIds), [2]);
	const lockedUpper = merge_down_plan([img(1, 1), img(2, 2, { locked: true, name: 'Top' })], 2);
	assert.equal(lockedUpper.ok, false);
	assert.match(lockedUpper.error, /"Top" is locked/);
	const lockedSmart = merge_down_plan([img(1, 1, { type: 'smart', locked: true, name: 'S' }), img(2, 2)], 2);
	assert.equal(lockedSmart.ok, false);
});
