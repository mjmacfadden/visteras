const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const libSrc = fs.readFileSync(require.resolve('../src/js/libs/vector-paste.js'), 'utf8').replace(/export /g, '');
const lib = vm.createContext({});
vm.runInContext(libSrc, lib);

// Normalized Vector clipboard SVG (as written by apps/vector visteras-clipboard-bridge.js).
const VECTOR_SVG = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 120" width="300" height="120" data-visteras-format="1" data-visteras-source="vector" data-visteras-origin="2000 40">\n<g data-visteras-copy-group="1" transform="translate(-2000 -40)"><rect x="2000" y="40" width="80" height="80"/><circle cx="2150" cy="80" r="40"/><rect x="2220" y="40" width="80" height="80"/></g>\n</svg>';

test('vector-paste: detects the Vector bridge payload, not Studio or foreign SVG', () => {
	assert.equal(lib.is_visteras_vector_svg(VECTOR_SVG), true);
	assert.equal(lib.is_visteras_vector_svg('<svg xmlns="http://www.w3.org/2000/svg" data-visteras-format="1"><path d="M0 0"/></svg>'), false, 'Studio copies stay vector layers');
	assert.equal(lib.is_visteras_vector_svg('<svg><g data-visteras-source="vector"/></svg>'), false, 'marker must be on the root');
	assert.equal(lib.is_visteras_vector_svg(null), false);
});

test('vector-paste: pixel size from width/height, falling back to the viewBox', () => {
	assert.deepEqual({ ...lib.svg_pixel_size(VECTOR_SVG) }, { width: 300, height: 120 });
	assert.deepEqual({ ...lib.svg_pixel_size('<svg viewBox="0 0 40.4 20.6">') }, { width: 40, height: 21 });
	assert.deepEqual({ ...lib.svg_pixel_size('<svg width="100%" viewBox="0 0 50 25">') }, { width: 50, height: 25 });
	assert.deepEqual({ ...lib.svg_pixel_size('<svg width="60" viewBox="0 0 30 10">') }, { width: 60, height: 20 });
	assert.equal(lib.svg_pixel_size('<svg>'), null);
});

test('vector-paste placement: centered on the visible canvas at 1:1, never off-canvas', () => {
	// Whole 800x600 document visible.
	assert.deepEqual({ ...lib.compute_paste_placement({ width: 300, height: 120 }, 800, 600, { x: -50, y: -20, width: 900, height: 640 }) },
		{ x: 250, y: 240, width: 300, height: 120, scale: 1 });
	// No viewport info → document center.
	assert.deepEqual({ ...lib.compute_paste_placement({ width: 300, height: 120 }, 800, 600) },
		{ x: 250, y: 240, width: 300, height: 120, scale: 1 });
	// Zoomed in on the bottom-right quarter → center of what is visible.
	const p = lib.compute_paste_placement({ width: 100, height: 100 }, 2000, 1000, { x: 1000, y: 500, width: 1000, height: 500 });
	assert.deepEqual({ ...p }, { x: 1450, y: 700, width: 100, height: 100, scale: 1 });
	// Viewport entirely off the document (stale) → document center, still on canvas.
	const q = lib.compute_paste_placement({ width: 100, height: 100 }, 800, 600, { x: 5000, y: 5000, width: 100, height: 100 });
	assert.deepEqual({ ...q }, { x: 350, y: 250, width: 100, height: 100, scale: 1 });
});

test('vector-paste placement: larger than the canvas stays 1:1 and centered; absurd sizes fit the canvas', () => {
	const big = lib.compute_paste_placement({ width: 1200, height: 900 }, 800, 600);
	assert.deepEqual({ ...big }, { x: -200, y: -150, width: 1200, height: 900, scale: 1 });
	assert.ok(big.x < 800 && big.x + big.width > 0 && big.y < 600 && big.y + big.height > 0, 'overlaps the canvas');
	const absurd = lib.compute_paste_placement({ width: 20000, height: 1000 }, 800, 600);
	assert.equal(absurd.width, 800);
	assert.equal(absurd.height, 40);
	assert.deepEqual([absurd.x, absurd.y], [0, 280]);
	assert.ok(absurd.scale < 1);
});

test('vector-paste: smart source document embeds the SVG as one image layer', () => {
	const url = lib.svg_data_url(VECTOR_SVG);
	assert.match(url, /^data:image\/svg\+xml;charset=utf-8,/);
	assert.ok(!decodeURIComponent(url).includes('<?xml'), 'prolog stripped');
	assert.ok(decodeURIComponent(url).includes('data-visteras-copy-group'), 'the SVG group travels with the layer');
	const doc = lib.smart_source_document({ svg_url: url, width: 300, height: 120 });
	assert.equal(doc.info.width, 300);
	assert.equal(doc.layers.length, 1);
	assert.equal(doc.layers[0].type, 'image');
	assert.equal(doc.data[0].data, url);
});

function loadPaste() {
	const actions = [];
	const ctx = vm.createContext({
		console, Promise, Math, Error,
		config: { WIDTH: 800, HEIGHT: 600, need_render: false },
		alertify: { error: (m) => { throw new Error('alertify: ' + m); } },
		uuid: () => 'uuid-1',
		looks_like_svg: (t) => /<svg/i.test(t),
		svg_to_vectors: () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
		read_svg_from_clipboard_event: async () => null,
		Insert_vector_action: class { constructor(v) { this.kind = 'vector'; this.v = v; } },
		Add_smart_source_action: class { constructor(source) { this.kind = 'source'; this.source = source; } },
		Image: class { set src(v) { this._src = v; setImmediate(() => this.onload()); } get src() { return this._src; } },
		setImmediate,
		document: {
			getElementById: (id) => (id === 'canvas_minipaint' ? { width: 1000, height: 700 } : null),
			createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/png;base64,AAAA' }),
		},
		app: {
			Layers: { get_world_coords: (x, y) => ({ x: x - 100, y: y - 50 }) },
			GUI: { GUI_layers: { render_layers() {} } },
			State: { do_action: async (a) => { actions.push(a); return { status: 'completed' }; } },
			Actions: {
				Bundle_action: class { constructor(id, name, list) { this.kind = 'bundle'; this.id = id; this.list = list; } },
				Insert_layer_action: class { constructor(settings, can_automate) { this.kind = 'insert'; this.settings = settings; this.can_automate = can_automate; } },
			},
		},
	});
	vm.runInContext(libSrc, ctx);
	const src = fs.readFileSync(require.resolve('../src/js/modules/edit/paste.js'), 'utf8')
		.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, '')
		.replace(/export default Edit_paste_class;/, 'globalThis.Edit_paste_class = Edit_paste_class;');
	vm.runInContext(src, ctx);
	return { paste: new ctx.Edit_paste_class(), actions, ctx };
}

test('Studio paste: a multi-object Vector copy becomes ONE smart layer, centered in the visible canvas', async () => {
	const { paste, actions } = loadPaste();
	const ok = await paste.paste_svg_text(VECTOR_SVG);
	assert.equal(ok, true);
	assert.equal(actions.length, 1, 'one undoable action');
	const bundle = actions[0];
	assert.equal(bundle.kind, 'bundle');
	const inserts = bundle.list.filter((a) => a.kind === 'insert');
	assert.equal(inserts.length, 1, 'exactly one new layer');
	assert.equal(bundle.list.filter((a) => a.kind === 'vector').length, 0, 'no per-object vector layers');
	const s = inserts[0].settings;
	assert.equal(s.type, 'smart');
	assert.equal(s.name, 'Vector Smart Object');
	assert.equal(inserts[0].can_automate, false, 'never auto-resizes the canvas');
	// Whole 800x600 document visible (viewport world rect -100,-50 .. 900,650) → centered.
	assert.deepEqual([s.x, s.y, s.width, s.height], [250, 240, 300, 120]);
	const source = bundle.list.find((a) => a.kind === 'source').source;
	assert.equal(s.smart_source_id, source.id);
	assert.deepEqual([source.width, source.height], [300, 120]);
	assert.equal(source.document.layers.length, 1);
	assert.match(source.document.data[0].data, /^data:image\/svg\+xml/);
	assert.ok(decodeURIComponent(source.document.data[0].data).includes('translate(-2000 -40)'), 'embedded SVG group kept');
});

test('Studio paste: Studio-origin / foreign SVG still pastes as editable vector layers', async () => {
	const { paste, actions } = loadPaste();
	const ok = await paste.paste_svg_text('<svg xmlns="http://www.w3.org/2000/svg" data-visteras-format="1"><path d="M0 0L5 5"/></svg>');
	assert.equal(ok, true);
	assert.equal(actions[0].kind, 'bundle');
	assert.equal(actions[0].list.every((a) => a.kind === 'vector'), true);
});
