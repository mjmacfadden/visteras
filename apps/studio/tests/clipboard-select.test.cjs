const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadPaste, pasteEvent, lib } = require('./helpers/paste-harness.cjs');

const S = vm.createContext({});
vm.runInContext(lib('clipboard-select.js'), S);
const choose = (o) => ({ ...S.choose_paste_source(o) });

const VEC = (nonce = 'vector-1', ts = 2000) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10" data-visteras-source="vector" data-visteras-clip="${nonce}" data-visteras-copied="${ts}"><g data-visteras-copy-group="1"><rect width="10" height="10"/></g></svg>`;
const RASTER = (o = {}) => ({ kind: 'raster', nonce: 'studio-1', ts: 1000, width: 64, height: 48, system_write: 'ok', ...o });

test('clipboard stamp: stamp_svg writes / replaces the nonce and svg_clip_stamp reads it back', () => {
	const svg = S.stamp_svg('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" data-visteras-format="1"><path/></svg>', { nonce: 'studio-a', ts: 42 });
	assert.deepEqual({ ...S.svg_clip_stamp(svg) }, { source: 'studio', nonce: 'studio-a', ts: 42 });
	const again = S.stamp_svg(svg, { nonce: 'studio-b', ts: 43 });
	assert.equal((again.match(/data-visteras-clip=/g) || []).length, 1, 'old stamp replaced');
	assert.equal(S.svg_clip_stamp(again).nonce, 'studio-b');
	assert.deepEqual({ ...S.svg_clip_stamp(VEC()) }, { source: 'vector', nonce: 'vector-1', ts: 2000 });
	assert.equal(S.svg_clip_stamp('<svg><path/></svg>'), null);
	assert.equal(S.same_svg(svg, again), true, 'same content ignoring stamp + prolog');
	assert.equal(S.parse_clip_json('{"nonce":"studio-x","ts":5,"source":"studio"}').nonce, 'studio-x');
	assert.equal(S.parse_clip_json('nope'), null);
	const st = S.new_clip_stamp('studio', 1234, () => 0.5);
	assert.equal(st.ts, 1234); assert.match(st.nonce, /^studio-/);
});

test('select: a Vector copy after a Studio copy wins (system clipboard holds the newest copy)', () => {
	const d = choose({ system: { status: 'ok', svg: VEC(), stamp: S.svg_clip_stamp(VEC()) }, internal: RASTER() });
	assert.equal(d.use, 'svg'); assert.equal(d.reason, 'vector-copy');
});

test('select: a foreign copy (text or image) after a Vector copy wins over the cached Vector copy', () => {
	const cross = { svg: VEC(), nonce: 'vector-1', ts: 5000 };
	assert.equal(choose({ system: { status: 'ok', text: 'hello from another app' }, cross }).use, 'text');
	assert.equal(choose({ system: { status: 'ok', image: { width: 30, height: 20 } }, cross, internal: RASTER() }).use, 'image');
	assert.equal(choose({ system: { status: 'ok', svg: '<svg><circle r="3"/></svg>' }, cross }).reason, 'foreign-svg');
	assert.equal(choose({ system: { status: 'ok' }, cross, internal: RASTER() }).use, 'none', 'unknown foreign content never pastes a stale copy');
});

test('select: our own latest copy on the clipboard → lossless internal paste', () => {
	assert.equal(choose({ system: { status: 'ok', image: { width: 64, height: 48 }, stamp: { nonce: 'studio-1', ts: 1000 } }, internal: RASTER() }).reason, 'own-nonce');
	assert.equal(choose({ system: { status: 'ok', image: { width: 64, height: 48 } }, internal: RASTER() }).reason, 'own-image');
	assert.equal(choose({ system: { status: 'ok', image: { width: 65, height: 48 } }, internal: RASTER() }).use, 'image', 'different image = foreign');
	const svg = S.stamp_svg('<svg data-visteras-format="1"><path d="M0 0"/></svg>', { nonce: 'studio-2', ts: 9 });
	assert.equal(choose({ system: { status: 'ok', svg: svg.replace(/ data-visteras-(clip|copied)="[^"]*"/g, '') }, internal: { kind: 'svg', svg, nonce: 'studio-2', ts: 9 } }).reason, 'own-svg');
});

test('select: a Studio copy that never reached the clipboard is newer than what is there', () => {
	assert.equal(choose({ system: { status: 'ok', text: 'older text' }, internal: RASTER({ system_write: 'failed', ts: 3000 }) }).use, 'internal');
	assert.equal(choose({ system: { status: 'ok', svg: VEC('vector-9', 4000), stamp: { source: 'vector', nonce: 'vector-9', ts: 4000 } }, internal: RASTER({ system_write: 'failed', ts: 3000 }) }).use, 'svg', 'unless a later Visteras copy is there');
});

test('select: empty or unreadable clipboard falls back to the newest of our own copies', () => {
	const cross = { svg: VEC(), ts: 5000 };
	assert.equal(choose({ system: { status: 'unreadable' }, internal: RASTER({ ts: 1000 }), cross }).reason, 'fallback-cross-app');
	assert.equal(choose({ system: { status: 'unreadable' }, internal: RASTER({ ts: 9000 }), cross }).reason, 'fallback-internal');
	assert.equal(choose({ system: { status: 'empty' }, internal: RASTER() }).use, 'internal');
	assert.equal(choose({ system: { status: 'empty' } }).reason, 'empty');
	assert.equal(choose({ system: { status: 'unreadable' } }).reason, 'unreadable');
	assert.equal(choose({ system: null, internal: RASTER() }).use, 'internal');
});

test('Studio paste event: Vector copy after a Studio copy → ONE smart layer, not the old internal copy', async () => {
	const h = loadPaste({ internal: { data_url: 'data:image/png;base64,OLD', width: 64, height: 48, nonce: 'studio-1', ts: 1000, system_write: 'ok' } });
	await h.paste.paste(pasteEvent({ data: { 'text/plain': VEC() }, files: [{ type: 'image/png', tag: 'VPNG' }] }));
	assert.equal(h.internalPastes(), 0);
	assert.equal(h.actions.length, 1);
	assert.equal(h.actions[0].list.filter((a) => a.kind === 'insert' && a.settings.type === 'smart').length, 1);
	assert.equal(h.window.__visteras_last_paste_decision.reason, 'vector-copy');
});

test('Studio paste event: foreign text after a Vector copy pastes nothing (no stale Vector copy)', async () => {
	const h = loadPaste({ cross: { svg: VEC(), ts: Date.now(), nonce: 'vector-1' } });
	await h.paste.paste(pasteEvent({ data: { 'text/plain': 'SENTINEL' } }));
	assert.equal(h.actions.length, 0);
	assert.equal(h.messages[0][0], 'message');
	assert.equal(h.window.__visteras_last_paste_decision.reason, 'foreign-text');
});

test('Studio paste event: a foreign image is one image layer centered in the visible canvas', async () => {
	const h = loadPaste({ internal: { data_url: 'data:image/png;base64,OLD', width: 10, height: 10, nonce: 'studio-1', ts: 1, system_write: 'ok' } });
	await h.paste.paste(pasteEvent({ files: [{ type: 'image/png', tag: 'FOREIGN' }] }));
	assert.equal(h.internalPastes(), 0);
	assert.equal(h.actions.length, 1);
	const s = h.actions[0].settings;
	assert.deepEqual([s.type, s.x, s.y, s.width, s.height], ['image', 368, 276, 64, 48]);
});

test('Studio paste event: our own image on the clipboard → internal (keeps position / alpha)', async () => {
	const h = loadPaste({ internal: { data_url: 'data:image/png;base64,OWN', width: 64, height: 48, nonce: 'studio-1', ts: 1, system_write: 'ok' } });
	await h.paste.paste(pasteEvent({ files: [{ type: 'image/png', tag: 'OWN' }] }));
	assert.equal(h.internalPastes(), 1);
	assert.equal(h.actions.length, 0);
});

test('Studio paste (menu / no event): unreadable or empty clipboard falls back to the internal copy', async () => {
	const internal = { data_url: 'data:image/png;base64,OWN', width: 64, height: 48, nonce: 'studio-1', ts: 1, system_write: 'ok' };
	const denied = loadPaste({ internal, clipboardRead: async () => { throw new Error('NotAllowedError'); } });
	await denied.paste.paste();
	assert.equal(denied.internalPastes(), 1);
	assert.equal(denied.window.__visteras_last_paste_decision.status, 'unreadable');
	const empty = loadPaste({ internal, clipboardRead: async () => [] });
	await empty.paste.paste();
	assert.equal(empty.internalPastes(), 1);
	assert.equal(empty.window.__visteras_last_paste_decision.status, 'empty');
	const vec = loadPaste({ internal, clipboardRead: async () => [{ types: ['text/plain'], getType: async () => ({ text: async () => VEC() }) }] });
	await vec.paste.paste();
	assert.equal(vec.internalPastes(), 0);
	assert.equal(vec.actions.length, 1, 'clipboard API read: Vector copy wins');
});

test('Studio ⌘V: the native paste event cancels the fallback read (one paste)', async () => {
	let reads = 0;
	const h = loadPaste({ clipboardRead: async () => { reads++; return []; } });
	h.paste.paste_shortcut();
	await h.paste.paste(pasteEvent({ data: { 'text/plain': VEC() } }));
	await new Promise((r) => setTimeout(r, 220));
	assert.equal(reads, 0);
	assert.equal(h.actions.length, 1);
});
