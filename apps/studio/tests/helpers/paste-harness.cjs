// Loads src/js/modules/edit/paste.js in a vm context with its imports stubbed,
// plus the real pure libs (vector-paste.js, clipboard-select.js).
const fs = require('node:fs');
const vm = require('node:vm');

const lib = (rel) => fs.readFileSync(require.resolve('../../src/js/libs/' + rel), 'utf8').replace(/export /g, '');

function loadPaste({ internal = null, cross = null, clipboardRead = null } = {}) {
	const actions = [], messages = [];
	const window = {};
	if (cross) Object.assign(window, { __visteras_last_cross_app_svg: cross.svg, __visteras_last_cross_app_ts: cross.ts, __visteras_last_cross_app_nonce: cross.nonce });
	const ctx = vm.createContext({
		console, Promise, Math, Error, JSON, window, setTimeout, clearTimeout,
		config: { WIDTH: 800, HEIGHT: 600, need_render: false, _internal_clipboard: internal },
		alertify: { error: (m) => messages.push(['error', m]), message: (m) => messages.push(['message', m]) },
		uuid: () => 'uuid-1',
		looks_like_svg: (t) => /<svg/i.test(t),
		svg_to_vectors: () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
		read_svg_from_clipboard_event: async () => null,
		VISTERAS_VECTOR_MIME: 'web application/x-visteras-vector+json',
		Insert_vector_action: class { constructor(v) { this.kind = 'vector'; this.v = v; } },
		Add_smart_source_action: class { constructor(source) { this.kind = 'source'; this.source = source; } },
		Image: class { set src(v) { this._src = v; setImmediate(() => this.onload()); } get src() { return this._src; } get width() { return 64; } get height() { return 48; } },
		FileReader: class { readAsDataURL(b) { this.result = 'data:image/png;base64,' + (b && b.tag || 'X'); setImmediate(() => this.onload()); } },
		setImmediate,
		navigator: { clipboard: clipboardRead ? { read: clipboardRead } : {} },
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
	vm.runInContext(lib('vector-paste.js'), ctx);
	vm.runInContext(lib('clipboard-select.js'), ctx);
	const src = fs.readFileSync(require.resolve('../../src/js/modules/edit/paste.js'), 'utf8')
		.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, '')
		.replace(/export default Edit_paste_class;/, 'globalThis.Edit_paste_class = Edit_paste_class;');
	vm.runInContext(src, ctx);
	let internal_pastes = 0;
	const paste = new ctx.Edit_paste_class();
	paste.paste_internal = () => { internal_pastes++; };
	return { paste, actions, messages, ctx, window, internalPastes: () => internal_pastes };
}

/** Fake paste-event DataTransfer: {types: {mime: string}, files: [{type, tag}]}. */
function pasteEvent({ data = {}, files = [] } = {}) {
	const types = Object.keys(data).concat(files.length ? ['Files'] : []);
	const items = Object.keys(data).map((t) => ({ kind: 'string', type: t }))
		.concat(files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })));
	return { clipboardData: { types, items, getData: (t) => data[t] || '' }, preventDefault() {} };
}

module.exports = { loadPaste, pasteEvent, lib };
