// Edit ▸ Transform submenu: flip/negative scale, Again, Perspective, Warp math, menu wiring.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const read = (f) => fs.readFileSync(require.resolve('../src/js/' + f), 'utf8');
const strip = (src) => src.replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const ctx = vm.createContext({});
vm.runInContext(strip(read('libs/quad-transform.js')) + '\n' + strip(read('libs/free-transform.js')) + '\n' + strip(read('libs/warp-mesh.js')) +
	'\nthis.api = { ref_point, resize_from_drag, transform_layer_geometry, flip_about, repeat_transform, layer_point, layer_uv, rotate_about, TRANSFORM_FIELDS, snapshot_transform_layer, restore_transform_session, create_transform_session, identity_mesh, is_identity_mesh, mesh_point, subdivide, triangle_affine, draw_warp };', ctx);
const api = ctx.api;
const close = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) < eps, `${msg || ''} ${a} ≈ ${b}`);
const H = { tc: 1, bc: 2, ml: 4, mr: 8, tl: 5, bl: 6, tr: 9, br: 10 };
const box = () => ({ x: 0, y: 0, width: 100, height: 50, rotate: 0, skew_x: 0, skew_y: 0 });

test('dragging the top handle past the bottom edge flips vertically about the bottom edge', () => {
	const r = api.resize_from_drag(box(), H.tc, { x: 50, y: 0 }, { x: 50, y: 80 }, false, null);
	assert.equal(r.flip_y, true);
	assert.equal(!!r.flip_x, false);
	close(r.height, 30); close(r.y, 50); close(r.width, 100);
});

test('dragging the right handle past the left edge flips horizontally; the box stays positive', () => {
	const r = api.resize_from_drag(box(), H.mr, { x: 100, y: 25 }, { x: -40, y: 25 }, false, null);
	assert.equal(r.flip_x, true);
	close(r.width, 40); close(r.x, -40);
	assert.ok(r.width > 0 && r.height > 0);
});

test('proportional middle drag past the edge still flips (no clamp at 1px)', () => {
	const r = api.resize_from_drag(box(), H.tc, { x: 50, y: 0 }, { x: 50, y: 100 }, true, null);
	assert.equal(r.flip_y, true);
	assert.equal(!!r.flip_x, false, 'only the dragged axis flips');
	close(r.height, 50); close(r.width, 100);
});

test('corner dragged past the opposite corner flips both axes', () => {
	const r = api.resize_from_drag(box(), H.br, { x: 100, y: 50 }, { x: -50, y: -25 }, false, null);
	assert.equal(r.flip_x, true); assert.equal(r.flip_y, true);
	close(r.x, -50); close(r.y, -25); close(r.width, 50); close(r.height, 25);
});

test('Shift + middle handle reflects about the opposite edge, then keeps resizing', () => {
	const start = api.resize_from_drag(box(), H.tc, { x: 50, y: 0 }, { x: 50, y: 0 }, true, null, true);
	assert.equal(start.flip_y, true);
	close(start.y, 50); close(start.height, 50); close(start.width, 100, 1e-6, 'reflection is single-axis');
	const more = api.resize_from_drag(box(), H.tc, { x: 50, y: 0 }, { x: 50, y: -10 }, true, null, true);
	close(more.height, 60); close(more.y, 50);
	const side = api.resize_from_drag(box(), H.ml, { x: 0, y: 25 }, { x: 0, y: 25 }, true, null, true);
	assert.equal(side.flip_x, true); close(side.x, 100); close(side.height, 50);
});

test('flipping a flipped box un-flips it', () => {
	const b = { ...box(), flip_x: true };
	const r = api.resize_from_drag(b, H.mr, { x: 100, y: 25 }, { x: -40, y: 25 }, false, null);
	assert.equal(r.flip_x, false);
});

test('rotated box: flip keeps the fixed edge in place', () => {
	const b = { ...box(), rotate: 30 };
	const fixed = api.ref_point(b, 'bc');
	const startPt = api.ref_point(b, 'tc');
	const local = { x: -Math.sin(30 * Math.PI / 180) * 80, y: Math.cos(30 * Math.PI / 180) * 80 };
	const r = api.resize_from_drag(b, H.tc, startPt, { x: startPt.x + local.x, y: startPt.y + local.y }, false, null);
	assert.equal(r.flip_y, true);
	const after = api.ref_point(r, 'tc'); // un-flipped top of the new box sits on the old bottom edge
	close(after.x, fixed.x, 1e-6); close(after.y, fixed.y, 1e-6);
});

test('transform_layer_geometry carries the flip to layers, including multi-selections', () => {
	const from = box(), to = { ...from, flip_x: true };
	const one = api.transform_layer_geometry({ ...from, id: 1 }, from, to);
	assert.equal(one.flip_x, true); close(one.x, 0);
	const left = { id: 2, x: 0, y: 0, width: 20, height: 50, rotate: 0 };
	const moved = api.transform_layer_geometry(left, from, to);
	assert.equal(moved.flip_x, true); close(moved.x, 80, 1e-6, 'left layer mirrors to the right');
});

test('non-aligned layer in a flipped group stores a proper rotation plus flip', () => {
	const from = box(), to = { ...from, flip_x: true };
	const layer = { id: 3, x: 10, y: 10, width: 20, height: 10, rotate: 30 };
	const r = api.transform_layer_geometry(layer, from, to);
	assert.equal(r.flip_x, true);
	close(((r.rotate % 360) + 360) % 360, 330, 1e-6, 'mirror · R(30°) = R(−30°) · flip');
	close(r.width, 20); close(r.height, 10);
	close(api.layer_point(r, 0, 0).x, 100 - api.layer_point(layer, 0, 0).x, 1e-6);
});

test('flip_about mirrors around the reference point', () => {
	const b = box();
	const r = api.flip_about(b, { x: 0, y: 25 }, 'x');
	assert.equal(r.flip_x, true); close(r.x, -100); close(r.width, 100);
	const c = api.flip_about(b, api.ref_point(b), 'y');
	assert.equal(c.flip_y, true); close(c.y, 0);
	assert.equal(api.flip_about(c, api.ref_point(c), 'y').flip_y, false);
});

test('Rotate 90° CW about the centre', () => {
	const r = api.rotate_about(box(), api.ref_point(box()), 90);
	assert.equal(r.rotate, 90); close(r.x, 0); close(r.y, 0);
	assert.equal(api.rotate_about(box(), api.ref_point(box()), -90).rotate, 270);
});

test('Again re-applies the committed delta (scale, rotate, move, flip)', () => {
	const from = box(), to = { ...from, x: 10, y: 5, width: 200, height: 50, rotate: 15, flip_y: true };
	const other = { x: 300, y: 300, width: 40, height: 40, rotate: 10, skew_x: 0, skew_y: 0 };
	const r = api.repeat_transform(other, from, to);
	close(r.width, 80); close(r.height, 40); close(r.rotate, 25);
	assert.equal(r.flip_y, true); assert.equal(r.flip_x, false);
	close(r.x + r.width / 2, 300 + 20 + 60); close(r.y + r.height / 2, 300 + 20 + 5);
});

test('layer_point / layer_uv round-trip through rotate, skew and flip', () => {
	const b = { x: 10, y: 20, width: 80, height: 40, rotate: 25, skew_x: 10, skew_y: 0, flip_x: true, flip_y: false };
	const p = api.layer_point(b, 0.2, 0.7), q = api.layer_uv(b, p);
	close(q.x, 0.2); close(q.y, 0.7);
	const flat = api.layer_point({ ...b, rotate: 0, skew_x: 0 }, 0, 0);
	close(flat.x, 90, 1e-6, 'flipped u=0 sits on the right edge'); close(flat.y, 20);
});

test('TRANSFORM_FIELDS snapshot and restore flip + warp mesh (undo/cancel)', () => {
	for (const f of ['flip_x', 'flip_y', 'warp_mesh']) assert.ok(api.TRANSFORM_FIELDS.includes(f), f);
	const layer = { id: 1, x: 0, y: 0, width: 10, height: 10, flip_x: true, warp_mesh: api.identity_mesh() };
	const session = api.create_transform_session([layer]);
	assert.equal(session.box.flip_x, true);
	layer.flip_x = false; layer.warp_mesh[5].x = 0.9; layer.flip_y = true;
	api.restore_transform_session(session, [layer]);
	assert.equal(layer.flip_x, true); assert.equal('flip_y' in layer, false); close(layer.warp_mesh[5].x, 1 / 3);
});

test('warp mesh: identity patch is the identity map; moved points bend it', () => {
	const mesh = api.identity_mesh();
	assert.equal(mesh.length, 16); assert.equal(api.is_identity_mesh(mesh), true);
	for (const [u, v] of [[0, 0], [0.3, 0.8], [1, 1], [0.5, 0.5]]) { const p = api.mesh_point(mesh, u, v); close(p.x, u); close(p.y, v); }
	const bent = mesh.map(p => ({ ...p })); bent[5] = { x: 1 / 3, y: 0 };
	assert.equal(api.is_identity_mesh(bent), false);
	assert.ok(api.mesh_point(bent, 1 / 3, 1 / 3).y < 1 / 3);
	close(api.mesh_point(bent, 0, 0).x, 0); close(api.mesh_point(bent, 1, 1).y, 1, 1e-9, 'corners stay put');
	const grid = api.subdivide(mesh, 4);
	assert.equal(grid.length, 5); close(grid[2][2].x, 0.5);
});

test('triangle_affine maps source triangle onto destination', () => {
	const s = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }], d = [{ x: 5, y: 5 }, { x: 25, y: 5 }, { x: 7, y: 15 }];
	const m = api.triangle_affine(s, d);
	s.forEach((p, i) => { close(m[0] * p.x + m[2] * p.y + m[4], d[i].x); close(m[1] * p.x + m[3] * p.y + m[5], d[i].y); });
	assert.equal(api.triangle_affine([s[0], s[0], s[1]], d), null);
});

test('draw_warp issues one clipped draw per triangle', () => {
	let draws = 0, clips = 0;
	const fake = { getTransform: () => ({ a: 1, b: 0 }), save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, clip() { clips++; }, transform() {}, drawImage() { draws++; } };
	api.draw_warp(fake, { width: 10, height: 10 }, { x: 0, y: 0, width: 10, height: 10 }, api.identity_mesh(), 4);
	assert.equal(draws, 32); assert.equal(clips, 32);
});

test('quad layer in a flipped selection mirrors its quad instead of double-flipping', () => {
	const from = box(), to = { ...from, flip_x: true };
	const quad = [{ x: 0.1, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
	const layer = { id: 1, ...from, transform_quad: quad };
	const r = api.transform_layer_geometry(layer, { ...from, transform_quad: quad }, { ...to, transform_quad: quad });
	assert.equal(!!r.flip_x, false);
	const tl = api.ref_point(r, 'tl');
	close(tl.x, 90, 1e-6, 'the inset tl corner lands mirrored on the right side');
	const tr = api.ref_point(r, 'tr');
	close(tr.x, 0, 1e-6);
});

test('a distorted box mirrors its quad instead of flagging a flip', () => {
	const b = { ...box(), transform_quad: [{ x: 0.1, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] };
	const r = api.flip_about(b, api.ref_point({ ...b, transform_quad: undefined }), 'x');
	assert.equal(!!r.flip_x, false);
	close(r.transform_quad[0].x, 0.9); close(r.transform_quad[3].x, 1);
	const layer = { id: 1, ...b };
	const moved = api.transform_layer_geometry(layer, b, r);
	close(api.ref_point(moved, 'tl').x, 90);
});

test('Edit ▸ Transform submenu lists every Photoshop item in order', () => {
	const menu = read('config-menu.js');
	const block = menu.slice(menu.indexOf("name: 'Transform',"), menu.indexOf("name: 'View'"));
	const names = [...block.matchAll(/name: '([^']+)'|divider: true/g)].map(m => m[1] || '—').slice(1);
	assert.deepEqual(names, ['Again', '—', 'Scale', 'Rotate', 'Skew', 'Distort', 'Perspective', '—', 'Warp', 'Split Warp Horizontally', 'Split Warp Vertically', 'Split Warp Crosswise', 'Remove Warp Split', '—', 'Convert Warp Anchor Point', '—', 'Toggle Guides', '—', 'Rotate 180°', 'Rotate 90° Clockwise', 'Rotate 90° Counter Clockwise', '—', 'Flip Horizontal', 'Flip Vertical']);
	assert.match(block, /name: 'Again',\n\t+shortcut: 'Ctrl \+ Alt \+ Shift \+ T'/);
	assert.doesNotMatch(block, /shortcut: 'Ctrl \+ Shift \+ T'/, 'Ctrl/⌘+Shift+T is Chrome reopen-closed-tab');
	// Phase 2 items are greyed out and marked.
	for (const n of ['Split Warp Horizontally', 'Split Warp Vertically', 'Split Warp Crosswise', 'Remove Warp Split', 'Convert Warp Anchor Point']) {
		assert.match(block, new RegExp(`// TODO phase 2[^\\n]*\\n\\t+\\{\\n\\t+name: '${n}',\\n\\t+enabled: \\(\\) => false`), n);
	}
	const module = read('modules/edit/transform.js');
	for (const m of [...block.matchAll(/target: 'edit\/transform\.([a-z0-9_]+)'/g)].map(m => m[1])) {
		assert.match(module, new RegExp(`\\n\\t(async )?${m}\\(`), `transform module implements ${m}`);
	}
});

test('menu renderer supports enabled(): disabled items render greyed and do not fire', () => {
	const gui = read('core/gui/gui-menu.js');
	assert.match(gui, /is_disabled\(definition\)/);
	assert.match(gui, /aria-disabled="true"/);
	assert.match(gui, /if \(this\.is_disabled\(definition\)\) return;/);
	assert.match(fs.readFileSync(require.resolve('../src/css/menu.css'), 'utf8'), /a\[aria-disabled="true"\]/);
});

test('Again shortcut follows the reserved-letter rule (⌃⇧⌘T / Ctrl+Alt+Shift+T)', async () => {
	const { browserSafeChord, eventMatchesChord } = await import('../src/js/libs/browser_shortcuts.js');
	assert.deepEqual(browserSafeChord({ meta: true, shift: true, key: 'T' }, true), { meta: true, ctrl: true, alt: false, shift: true, key: 'T' });
	assert.deepEqual(browserSafeChord({ meta: true, shift: true, key: 'T' }, false), { meta: false, ctrl: true, alt: true, shift: true, key: 'T' });
	assert.equal(eventMatchesChord({ code: 'KeyT', metaKey: true, ctrlKey: false, altKey: false, shiftKey: true }, { meta: true, shift: true, key: 'T' }, true), false, 'plain ⇧⌘T stays with Chrome');
	assert.equal(eventMatchesChord({ code: 'KeyT', metaKey: true, ctrlKey: true, altKey: false, shiftKey: false }, { meta: true, shift: true, key: 'T' }, true), false, '⌃⌘T is Free Transform, not Again');
	const gui = read('core/gui/gui-shortcuts.js');
	assert.match(gui, /eventMatchesChord\(event, \{ meta: true, shift: true, key: 'T' \}, isMacOSAgain\)/);
});

test('render paths honour flip and warp', () => {
	const layers = read('core/base-layers.js');
	assert.match(layers, /hasFlip/);
	assert.match(layers, /draw_warp\(ctx,source/);
	assert.match(read('tools/text.js'), /hasFlip/);
	assert.match(read('core/renderer/webgl-renderer.js'), /layer\.flip_x \|\| layer\.flip_y \|\| layer\.warp_mesh/);
});
