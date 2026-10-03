import test from 'node:test';
import assert from 'node:assert/strict';
import {
  safeFileBase, safeFileName, fileBaseFromName, saveFile, downloadBlob,
  openFile, ensureWritePermission, isSameFileHandle, findBySameHandle,
  hasAnyDirty, handleBeforeUnload, installBeforeUnloadGuard, markDirty, markClean, confirmCloseIfDirty,
} from '../src/index.js';
import { fakeDom } from './fake-dom.mjs';

test('filename rules: Studio-style — keep spaces/dots/Unicode, replace only illegal chars', () => {
  assert.equal(safeFileBase('My Board 2026'), 'My Board 2026');
  assert.equal(safeFileBase('Café • naïve v1.2'), 'Café • naïve v1.2');
  assert.equal(safeFileBase('a/b\\c:d*e?f"g<h>i|j'), 'a_b_c_d_e_f_g_h_i_j');
  assert.equal(safeFileBase('two   spaces  here'), 'two spaces here', 'runs of spaces collapsed');
  assert.equal(safeFileBase('tab\there\nline'), 'tab_here_line', 'tabs/newlines are control chars → _');
  assert.equal(safeFileBase('bell\u0007x'), 'bell_x', 'control chars replaced');
  assert.equal(safeFileBase('...hidden'), 'hidden', 'no leading dots');
  assert.equal(safeFileBase('trailing. . '), 'trailing', 'no trailing dots/spaces (Windows)');
  assert.equal(safeFileBase('   '), 'Untitled');
  assert.equal(safeFileBase(null, 'Board'), 'Board');
  assert.equal(safeFileBase('x'.repeat(300)).length, 200);
  assert.equal(safeFileBase('Poster.vid', 'Untitled', { stripExtensions: ['vid'] }), 'Poster');
  assert.equal(safeFileBase('Poster.VID', 'Untitled', { stripExtensions: ['.vid'] }), 'Poster', 'case-insensitive, leading dot ok');
  assert.equal(safeFileBase('Poster.vid'), 'Poster.vid', 'no stripping unless asked');
});

test('filename rules: safeFileName adds the app extension once', () => {
  assert.equal(safeFileName('Smoke Poster', 'vvd'), 'Smoke Poster.vvd');
  assert.equal(safeFileName('Smoke Poster.vvd', '.vvd'), 'Smoke Poster.vvd');
  assert.equal(safeFileName('Q3: plan?', 'vsd'), 'Q3_ plan_.vsd');
  assert.equal(safeFileName('', 'vid'), 'Untitled.vid');
  for (const ext of ['vvd', 'vsd', 'vpd', 'vcd', 'vid']) assert.equal(safeFileName('Doc', ext), `Doc.${ext}`);
  assert.equal(fileBaseFromName('Final cut.vid', ['vid']), 'Final cut');
});

function handle(name, log, { fail = false } = {}) {
  return {
    name,
    async createWritable() {
      if (fail) throw new Error('permission');
      let parts = [];
      return { async write(b) { parts.push(await b.text()); }, async close() { log.push({ name, text: parts.join('') }); } };
    },
  };
}

test('saveFile: existing handle → write in place', async () => {
  const log = [];
  const r = await saveFile({ data: '{"a":1}', fileName: 'A.vid', handle: handle('A.vid', log), win: {}, doc: null });
  assert.deepEqual({ method: r.method, name: r.name }, { method: 'handle', name: 'A.vid' });
  assert.deepEqual(log, [{ name: 'A.vid', text: '{"a":1}' }]);
});

test('saveFile: picker → returns the chosen name + handle; cancel does nothing', async () => {
  const log = [];
  let opts = null;
  const win = { showSaveFilePicker: async (o) => { opts = o; return handle('Renamed.vid', log); } };
  const r = await saveFile({ data: 'x', fileName: 'A.vid', types: [{ description: 'Inspire', accept: { 'application/json': ['.vid'] } }], win, doc: null });
  assert.equal(r.method, 'picker');
  assert.equal(r.name, 'Renamed.vid');
  assert.equal(opts.suggestedName, 'A.vid');
  assert.equal(opts.types[0].accept['application/json'][0], '.vid');
  assert.equal(log[0].text, 'x');

  const abort = Object.assign(new Error('cancel'), { name: 'AbortError' });
  const cancelled = await saveFile({ data: 'x', fileName: 'A.vid', win: { showSaveFilePicker: async () => { throw abort; } }, doc: null });
  assert.deepEqual(cancelled, { cancelled: true });
});

test('saveFile: failing handle → picker; no picker or picker error → download fallback', async () => {
  const log = [];
  const win = { showSaveFilePicker: async () => handle('B.vid', log) };
  const r = await saveFile({ data: 'y', fileName: 'A.vid', handle: handle('A.vid', log, { fail: true }), win, doc: null, onWarn: () => {} });
  assert.equal(r.method, 'picker');

  const doc = fakeDom();
  const urls = [];
  const realURL = globalThis.URL;
  globalThis.URL = { createObjectURL: (b) => { urls.push(b); return 'blob:1'; }, revokeObjectURL: () => {} };
  try {
    let clicked = null;
    const origCreate = doc.createElement;
    doc.createElement = (tag) => { const el = origCreate(tag); el.click = () => { clicked = { href: el.href, download: el.download }; }; return el; };
    const d1 = await saveFile({ data: 'z', fileName: 'My Board.vid', mimeType: 'application/json', win: {}, doc });
    assert.deepEqual(d1, { method: 'download', name: 'My Board.vid', handle: null });
    assert.deepEqual(clicked, { href: 'blob:1', download: 'My Board.vid' }, 'download keeps the spaces');
    assert.equal(urls[0].type, 'application/json');
    const d2 = await saveFile({ data: 'z', fileName: 'C.vid', win: { showSaveFilePicker: async () => { throw new Error('SecurityError'); } }, doc, onWarn: () => {} });
    assert.equal(d2.method, 'download');
    const d3 = await saveFile({ data: 'z', fileName: 'D.vid', usePicker: false, win: { showSaveFilePicker: async () => assert.fail('picker not wanted') }, doc });
    assert.equal(d3.method, 'download');
    assert.throws(() => downloadBlob('z', 'x', { doc: null }));
  } finally {
    globalThis.URL = realURL;
  }
});

test('dirty tracking: any-dirty across flag spellings, beforeunload only when dirty', () => {
  const docs = [{ dirty: false }, { isDirty: false }, { is_dirty: false }];
  const mk = () => ({ prevented: false, returnValue: undefined, preventDefault() { this.prevented = true; } });
  let e = mk();
  assert.equal(handleBeforeUnload(e, docs), undefined);
  assert.equal(e.prevented, false);
  for (const [i, f] of [[0, 'dirty'], [1, 'isDirty'], [2, 'is_dirty']]) {
    markDirty(docs[i], f);
    assert.equal(hasAnyDirty(docs), true, f);
    e = mk();
    assert.equal(handleBeforeUnload(e, docs), '');
    assert.equal(e.prevented, true);
    assert.equal(e.returnValue, '');
    markClean(docs[i], f);
    assert.equal(hasAnyDirty(docs), false, `${f} cleared by save`);
  }
  assert.equal(hasAnyDirty(null), false);
  assert.equal(hasAnyDirty([{ edits: 2 }], (d) => d.edits > 0), true, 'custom reader');
});

test('dirty tracking: installBeforeUnloadGuard reads live documents and uninstalls', () => {
  const listeners = {};
  const target = { addEventListener: (t, fn) => { listeners[t] = fn; }, removeEventListener: (t, fn) => { if (listeners[t] === fn) delete listeners[t]; } };
  let docs = [{ dirty: false }];
  const off = installBeforeUnloadGuard(() => docs, { target });
  const ev = () => ({ prevented: false, preventDefault() { this.prevented = true; } });
  let e = ev(); listeners.beforeunload(e); assert.equal(e.prevented, false);
  docs = [{ dirty: true }];
  e = ev(); listeners.beforeunload(e); assert.equal(e.prevented, true, 'sees the new array');
  off();
  assert.equal(listeners.beforeunload, undefined);
});

test('dirty tracking: close confirm only for dirty docs, titled like the tab', async () => {
  const asked = [];
  const ask = async (t) => { asked.push(t); return false; };
  assert.equal(await confirmCloseIfDirty({ fileName: 'Board.vid', isDirty: false }, ask), true);
  assert.equal(await confirmCloseIfDirty({ fileName: 'Board.vid', isDirty: true }, ask), false);
  assert.equal(await confirmCloseIfDirty({ title: 'Poster', dirty: true }, ask), false);
  assert.equal(await confirmCloseIfDirty({ title: 'Poster', dirty: true }, async () => true), true);
  assert.equal(await confirmCloseIfDirty({ name: 'X', changed: true }, ask, { isDirty: (d) => d.changed, getTitle: (d) => d.name }), false);
  assert.deepEqual(asked, ['Board.vid', 'Poster', 'X']);
  assert.equal(await confirmCloseIfDirty(null, ask), true);
});

test('saveFile: data function is serialized after the picker, with the picked name', async () => {
  const log = [];
  const calls = [];
  let picked = false;
  const data = (name) => { calls.push({ name, picked }); return JSON.stringify({ fileName: name }); };
  const win = { showSaveFilePicker: async () => { picked = true; return handle('Picked.vid', log); } };
  const r = await saveFile({ data, fileName: 'Untitled-1.vid', win, doc: null });
  assert.equal(r.name, 'Picked.vid');
  assert.deepEqual(calls, [{ name: 'Picked.vid', picked: true }]);
  assert.equal(JSON.parse(log[0].text).fileName, 'Picked.vid');
  // cancel → data never serialized
  calls.length = 0;
  const abort = Object.assign(new Error('x'), { name: 'AbortError' });
  await saveFile({ data, fileName: 'A.vid', win: { showSaveFilePicker: async () => { throw abort; } }, doc: null });
  assert.equal(calls.length, 0);
  // existing handle → its name
  const r2 = await saveFile({ data, fileName: 'A.vid', handle: handle('Kept.vid', log), win: {}, doc: null });
  assert.equal(r2.method, 'handle');
  assert.equal(JSON.parse(log.at(-1).text).fileName, 'Kept.vid');
});

// ── Open → handle → silent save-back ──
function diskFile(name, text, log, { perm = 'granted', failWrite = false } = {}) {
  const h = {
    name, kind: 'file', text, permRequests: 0,
    async getFile() { return { name, async text() { return h.text; } }; },
    async queryPermission() { return perm === 'granted' ? 'granted' : 'prompt'; },
    async requestPermission() { h.permRequests++; return perm === 'prompt' ? 'granted' : perm; },
    async isSameEntry(o) { return o === h || (o && o.__path === h.__path); },
    async createWritable() {
      if (failWrite) throw new Error('NotAllowedError');
      let parts = [];
      return { async write(b) { parts.push(await b.text()); }, async close() { h.text = parts.join(''); log.push({ name, text: h.text }); } };
    },
  };
  h.__path = name;
  return h;
}

test('openFile: picker → { file, handle, name } with the app types; cancel → cancelled', async () => {
  const h = diskFile('Board.vid', '{"a":1}', []);
  let opts = null;
  const r = await openFile({ types: [{ description: 'Inspire', accept: { 'application/json': ['.vid'] } }], win: { showOpenFilePicker: async (o) => { opts = o; return [h]; } }, doc: null });
  assert.equal(r.method, 'picker');
  assert.equal(r.handle, h);
  assert.equal(r.name, 'Board.vid');
  assert.equal(await r.file.text(), '{"a":1}');
  assert.equal(opts.multiple, false);
  assert.deepEqual(opts.types[0].accept['application/json'], ['.vid']);
  const abort = Object.assign(new Error('x'), { name: 'AbortError' });
  assert.deepEqual(await openFile({ win: { showOpenFilePicker: async () => { throw abort; } }, doc: null }), { cancelled: true });
});

test('openFile: without the picker → <input type=file> with accept, no handle', async () => {
  const doc = fakeDom();
  const p = openFile({ accept: '.vid,application/json', win: {}, doc });
  const input = doc.body.children.find((c) => c.tagName === 'INPUT');
  assert.ok(input, 'input mounted');
  assert.equal(input.type, 'file');
  assert.equal(input.accept, '.vid,application/json');
  input.files = [{ name: 'Old.vid' }];
  input.fire('change');
  const r = await p;
  assert.deepEqual({ name: r.name, handle: r.handle, method: r.method }, { name: 'Old.vid', handle: null, method: 'input' });
  assert.equal(doc.body.children.length, 0, 'input removed');
  // picker throwing (not cancel) also falls back
  const doc2 = fakeDom();
  const p2 = openFile({ accept: '.vvd', win: { showOpenFilePicker: async () => { throw new Error('SecurityError'); } }, doc: doc2, onWarn: () => {} });
  await new Promise((r) => setTimeout(r, 0));
  const input2 = doc2.body.children[0];
  input2.fire('cancel');
  assert.deepEqual(await p2, { cancelled: true });
});

test('open then save: writes back to the opened handle without showSaveFilePicker', async () => {
  const log = [];
  const h = diskFile('Board.vid', 'old', log, { perm: 'prompt' });
  const opened = await openFile({ win: { showOpenFilePicker: async () => [h] }, doc: null });
  let picks = 0;
  const win = { showSaveFilePicker: async () => { picks++; return diskFile('Other.vid', '', log); } };
  const r = await saveFile({ data: (name) => `new:${name}`, fileName: 'Board.vid', handle: opened.handle, win, doc: null });
  assert.equal(r.method, 'handle');
  assert.equal(r.handle, h);
  assert.equal(r.name, 'Board.vid');
  assert.equal(picks, 0, 'no save picker');
  assert.equal(h.permRequests, 1, 'asked for readwrite once');
  assert.equal(h.text, 'new:Board.vid');
});

test('Save As ignores the handle and asks with the picker', async () => {
  const log = [];
  const h = diskFile('Board.vid', 'old', log);
  let picks = 0;
  const r = await saveFile({ data: 'x', fileName: 'Board.vid', handle: null, win: { showSaveFilePicker: async () => { picks++; return diskFile('Copy.vid', '', log); } }, doc: null });
  assert.equal(picks, 1);
  assert.equal(r.method, 'picker');
  assert.equal(r.name, 'Copy.vid');
  assert.equal(h.text, 'old', 'original untouched');
});

test('failed write or denied permission on the handle falls back to the picker', async () => {
  for (const opts of [{ failWrite: true }, { perm: 'denied' }]) {
    const log = [];
    const h = diskFile('Board.vid', 'old', log, opts);
    let picks = 0;
    const r = await saveFile({ data: 'x', fileName: 'Board.vid', handle: h, win: { showSaveFilePicker: async () => { picks++; return diskFile('Board.vid', '', log); } }, doc: null, onWarn: () => {} });
    assert.equal(picks, 1, JSON.stringify(opts));
    assert.equal(r.method, 'picker');
    assert.equal(h.text, 'old');
  }
});

test('ensureWritePermission / isSameFileHandle / findBySameHandle', async () => {
  assert.equal(await ensureWritePermission(null), false);
  assert.equal(await ensureWritePermission({}), true, 'no permission API → allowed');
  assert.equal(await ensureWritePermission(diskFile('a', '', [], { perm: 'denied' })), false);
  const a = diskFile('A.vid', '', []);
  const a2 = diskFile('A.vid', '', []);
  const b = diskFile('B.vid', '', []);
  assert.equal(await isSameFileHandle(a, a2), true);
  assert.equal(await isSameFileHandle(a, b), false);
  assert.equal(await isSameFileHandle(a, null), false);
  assert.equal(await isSameFileHandle({ name: 'A.vid' }, a), false, 'no isSameEntry → not the same');
  const tabs = [{ id: 1, fileHandle: b }, { id: 2, fileHandle: a }, { id: 3, fileHandle: null }];
  assert.deepEqual((await findBySameHandle(tabs, a2)).map((t) => t.id), [2]);
  assert.deepEqual(await findBySameHandle(tabs, null), []);
});
