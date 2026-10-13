// Audit Merge Visible / Stamp Visible: Shift+Ctrl/⌘E merges visible layers, ⌥⇧⌘E stamps.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const strip = (f) => fs.readFileSync(require.resolve('../src/js/' + f), 'utf8')
	.replace(/^import .*;$/gm, '').replace(/export default \{[\s\S]*?\};/g, '').replace(/^export default .*;$/gm, '').replace(/\bexport /g, '');
const ctx = vm.createContext({ config: { layers: [] } });
vm.runInContext(['libs/layer-tree.js', 'libs/layer-clip.js', 'libs/merge-plan.js'].map(strip).join('\n') + '\nthis.api = { merge_visible_plan, MERGE_VISIBLE_MESSAGES };', ctx);
const { merge_visible_plan, MERGE_VISIBLE_MESSAGES } = ctx.api;
const read = (f) => fs.readFileSync(require.resolve('../src/js/' + f), 'utf8');
const img = (id, order, extra = {}) => ({ id, order, type: 'image', name: 'L' + id, visible: true, parent_id: 0, ...extra });
const grp = (id, order, extra = {}) => ({ id, order, type: 'group', name: 'G' + id, visible: true, parent_id: 0, ...extra });
const plain = (v) => JSON.parse(JSON.stringify(v));

test('merges every visible layer into the bottom visible one, keeps hidden layers', () => {
	const p = merge_visible_plan([img(1, 1, { name: 'Background' }), img(2, 2, { visible: false }), img(3, 3), img(4, 4)]);
	assert.equal(p.ok, true);
	assert.deepEqual(plain(p.deleteIds).sort(), [1, 3, 4]);
	assert.deepEqual(plain(p.result), { name: 'Background', parent_id: 0, order: 1 });
});

test('groups: removed only when nothing hidden is left inside; children of hidden groups untouched', () => {
	const layers = [
		img(1, 1), grp(4, 4), img(2, 2, { parent_id: 4 }), img(3, 3, { parent_id: 4 }), // fully visible group
		grp(8, 8), img(5, 5, { parent_id: 8 }), img(6, 6, { parent_id: 8, visible: false }), // group keeps a hidden child
		grp(10, 10, { visible: false }), img(9, 9, { parent_id: 10 }), // hidden group
	];
	const p = merge_visible_plan(layers);
	assert.deepEqual(plain(p.deleteIds).sort((a, b) => a - b), [1, 2, 3, 4, 5]);
	assert.ok(!p.deleteIds.includes(8) && !p.deleteIds.includes(9) && !p.deleteIds.includes(10));
	assert.ok(p.deleteIds.indexOf(4) > p.deleteIds.indexOf(2), 'children are deleted before their group');
});

test('result stays in the bottom layer\'s group unless that group is merged away', () => {
	const kept = merge_visible_plan([grp(5, 5), img(1, 1, { parent_id: 5 }), img(2, 2, { parent_id: 5, visible: false }), img(3, 3)]);
	assert.equal(kept.result.parent_id, 5);
	const gone = merge_visible_plan([grp(5, 5), img(1, 1, { parent_id: 5 }), img(3, 3)]);
	assert.equal(gone.result.parent_id, 0);
});

test('needs two visible layers', () => {
	assert.equal(merge_visible_plan([img(1, 1), img(2, 2, { visible: false })]).error, MERGE_VISIBLE_MESSAGES.none);
	assert.equal(merge_visible_plan([]).ok, false);
});

test('wiring: menu items, shortcuts, one undo step', () => {
	const menu = read('config-menu.js');
	assert.match(menu, /name: 'Merge Visible',\n\t+shortcut: 'Ctrl \+ Shift \+ E',\n\t+target: 'layer\/flatten\.merge_visible'/);
	assert.match(menu, /name: 'Stamp Visible',\n\t+shortcut: 'Ctrl \+ Alt \+ Shift \+ E',\n\t+target: 'layer\/flatten\.new_from_visible'/);
	assert.doesNotMatch(menu, /New from Visible/);
	assert.match(read('modules/layer/merge.js'), /if \(event\.shiftKey\) app\.GUI\?\.modules\?\.\['layer\/flatten'\]\?\.merge_visible\?\.\(\)/);
	const flat = read('modules/layer/flatten.js');
	assert.match(flat, /async merge_visible\(\)/);
	assert.match(flat, /Bundle_action\('merge_visible', 'Merge Visible'/);
	assert.match(flat, /new app\.Actions\.Update_layer_action\(plan\.into, \{[\s\S]*mask:\s*null,\s*filters:\s*\[\],[\s\S]*opacity:\s*100,\s*composition:\s*'source-over'/);
	assert.match(flat, /!event\.altKey \|\| !event\.shiftKey \|\| event\.code !== 'KeyE'[\s\S]{0,300}this\.new_from_visible\(\)/);
});

test('locked Background is merged into (kept), other locked layers block with a message', () => {
	const bg = img(1, 1, { name: 'Background', locked: true });
	const p = merge_visible_plan([bg, img(2, 2), img(3, 3)]);
	assert.equal(p.ok, true);
	assert.equal(p.into, 1);
	assert.deepEqual(plain(p.deleteIds).sort(), [2, 3]);
	const blocked = merge_visible_plan([img(1, 1), img(2, 2, { locked: true, name: 'Logo' })]);
	assert.equal(blocked.ok, false);
	assert.match(blocked.error, /"Logo" is locked/);
});
