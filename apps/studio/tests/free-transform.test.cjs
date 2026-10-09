// Free Transform pure module + wiring tests
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const src = fs.readFileSync(require.resolve('../src/js/libs/free-transform.js'), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(src.replace(/^export /gm, '') +
	'\nthis.api = { ref_point, scale_about, rotate_about, snap_angle, skew_from_drag, apply_numeric, create_transform_session, restore_transform_session };', ctx);
const {
	ref_point,
	scale_about,
	rotate_about,
	snap_angle,
	skew_from_drag,
	apply_numeric,
	create_transform_session,
	restore_transform_session,
} = ctx.api;

test('Scaling 200% about the center vs about top-left gives expected x/y/w/h', () => {
	const box = { x: 0, y: 0, width: 100, height: 100 };

	// Scale 200% about top-left (0, 0)
	const refTL = ref_point(box, 'tl');
	assert.equal(refTL.x, 0);
	assert.equal(refTL.y, 0);
	const scaledTL = scale_about(box, refTL, 2, 2);
	assert.equal(scaledTL.x, 0);
	assert.equal(scaledTL.y, 0);
	assert.equal(scaledTL.width, 200);
	assert.equal(scaledTL.height, 200);

	// Scale 200% about center (50, 50)
	const refC = ref_point(box, 'c');
	assert.equal(refC.x, 50);
	assert.equal(refC.y, 50);
	const scaledC = scale_about(box, refC, 2, 2);
	assert.equal(scaledC.x, -50);
	assert.equal(scaledC.y, -50);
	assert.equal(scaledC.width, 200);
	assert.equal(scaledC.height, 200);
	// Center of scaled box should still be (50, 50)
	assert.equal(scaledC.x + scaledC.width / 2, 50);
	assert.equal(scaledC.y + scaledC.height / 2, 50);
});

test('Rotating 90° about the center keeps the center', () => {
	const box = { x: 100, y: 100, width: 200, height: 100, rotate: 0 };
	const refC = ref_point(box, 'c');
	assert.equal(refC.x, 200);
	assert.equal(refC.y, 150);

	const rotated = rotate_about(box, refC, 90);
	assert.equal(rotated.rotate, 90);
	assert.equal(rotated.x + rotated.width / 2, refC.x);
	assert.equal(rotated.y + rotated.height / 2, refC.y);
});

test('snap_angle(22) === 15 and snap_angle(23) === 30', () => {
	assert.equal(snap_angle(22), 15);
	assert.equal(snap_angle(23), 30);
	assert.equal(snap_angle(0), 0);
	assert.equal(snap_angle(15), 15);
	assert.equal(snap_angle(44), 45);
	assert.equal(snap_angle(46), 45);
});

test('Skew from a drag round-trips with apply_numeric', () => {
	const box = { x: 100, y: 100, width: 200, height: 100, rotate: 0, skew_x: 0, skew_y: 0 };
	const dragSkew = skew_from_drag('right', 0, 50, box);
	assert.ok(dragSkew.skew_y !== 0);

	const applied = apply_numeric(box, { skewY: dragSkew.skew_y });
	assert.equal(applied.skew_y, dragSkew.skew_y);
});

test('Commit and cancel logic: snapshot is restored exactly', () => {
	const layers = [
		{ id: 1, x: 10, y: 20, width: 100, height: 100, rotate: 0, skew_x: 0, skew_y: 0 },
		{ id: 2, x: 50, y: 60, width: 80, height: 80, rotate: 10, skew_x: 5, skew_y: 0 },
	];
	const session = create_transform_session(layers);

	// Mutate layers during transform session
	layers[0].x = 100;
	layers[0].width = 250;
	layers[0].rotate = 45;
	layers[0].skew_x = 15;
	layers[1].y = 200;

	// Cancel restores original values
	restore_transform_session(session, layers);
	assert.equal(layers[0].x, 10);
	assert.equal(layers[0].width, 100);
	assert.equal(layers[0].rotate, 0);
	assert.equal(layers[0].skew_x, 0);
	assert.equal(layers[1].y, 60);
});

test('Source assertions: shortcuts and menu definitions for Free Transform', () => {
	const shortcutsSrc = fs.readFileSync(require.resolve('../src/js/core/gui/gui-shortcuts.js'), 'utf8');
	assert.match(shortcutsSrc, /eventMatchesChord\([^,]+,\s*\{[^}]*key:\s*'T'[^}]*\}/);

	const menuSrc = fs.readFileSync(require.resolve('../src/js/config-menu.js'), 'utf8');
	assert.match(menuSrc, /name:\s*'Free Transform',\n\s*shortcut:\s*'Ctrl \+ Alt \+ T'/);

	// Verify plain ⌘T / Ctrl+T is not bound
	const bShortcutsSrc = fs.readFileSync(require.resolve('../src/js/libs/browser_shortcuts.js'), 'utf8');
	const bCtx = vm.createContext({});
	vm.runInContext(bShortcutsSrc.replace(/^export /gm, '') + '\nthis.api = { eventMatchesChord };', bCtx);
	const { eventMatchesChord } = bCtx.api;

	// Plain Cmd+T (Mac) or Ctrl+T (Win) must NOT match
	const plainMacCmdT = { metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, code: 'KeyT', key: 't' };
	const plainWinCtrlT = { metaKey: false, ctrlKey: true, altKey: false, shiftKey: false, code: 'KeyT', key: 't' };
	assert.equal(eventMatchesChord(plainMacCmdT, { meta: true, key: 'T' }, true), false, 'plain Cmd+T must not match on Mac');
	assert.equal(eventMatchesChord(plainWinCtrlT, { meta: true, key: 'T' }, false), false, 'plain Ctrl+T must not match on Windows');

	// Safe chords MUST match
	const safeMacChord = { metaKey: true, ctrlKey: true, altKey: false, shiftKey: false, code: 'KeyT', key: 't' };
	const safeWinChord = { metaKey: false, ctrlKey: true, altKey: true, shiftKey: false, code: 'KeyT', key: 't' };
	assert.equal(eventMatchesChord(safeMacChord, { meta: true, key: 'T' }, true), true, '⌃⌘T matches on Mac');
	assert.equal(eventMatchesChord(safeWinChord, { meta: true, key: 'T' }, false), true, 'Ctrl+Alt+T matches on Windows');

	// Menu includes Transform ▸ Skew
	assert.match(menuSrc, /target:\s*'edit\/transform\.skew'/);

	// Help shortcuts includes Free Transform
	const helpSrc = fs.readFileSync(require.resolve('../src/js/modules/help/shortcuts.js'), 'utf8');
	assert.match(helpSrc, /Free Transform/);

	// Transform controller module exists and exports expected methods
	const transformModSrc = fs.readFileSync(require.resolve('../src/js/modules/edit/transform.js'), 'utf8');
	assert.match(transformModSrc, /export default class Transform_edit_class/);
	assert.match(transformModSrc, /free_transform\(/);
	assert.match(transformModSrc, /skew\(/);
	assert.match(transformModSrc, /commit\(/);
	assert.match(transformModSrc, /cancel\(/);
	assert.match(transformModSrc, /nudge\(/);
});

