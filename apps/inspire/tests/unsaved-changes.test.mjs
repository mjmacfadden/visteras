import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { InspireDocument } from '../js/document.js';
import { BoardComposer } from '../js/board-composer.js';
import { SwipeFileManager } from '../js/swipe-file.js';
import {
  STALE_DOCUMENT_STORAGE_KEYS,
  clearStaleDocumentStorage,
  trackDirty,
  markSaved,
  hasAnyDirty,
  handleBeforeUnload,
  confirmCloseIfDirty
} from '../js/unsaved-changes.js';

const inspireRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(inspireRoot, rel), 'utf8');

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  const writes = [];
  return {
    writes,
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { writes.push(k); map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; }
  };
}

function makeModel() {
  const doc = new InspireDocument({ title: 'Board' });
  const board = new BoardComposer([], null, doc);
  const swipeFile = new SwipeFileManager(null);
  return { id: 'm1', title: 'Board', fileName: 'Board.vid', isDirty: false, doc, board, swipeFile };
}

test('No autosave: editing and saving never writes documents to localStorage/sessionStorage', async () => {
  const local = fakeStorage();
  const session = fakeStorage();
  const prevLocal = globalThis.localStorage;
  const prevSession = globalThis.sessionStorage;
  const prevDownload = InspireDocument.downloadAsFile;
  globalThis.localStorage = local;
  globalThis.sessionStorage = session;
  let downloaded = null;
  InspireDocument.downloadAsFile = (data, name) => { downloaded = { data, name }; };
  try {
    const model = makeModel();
    trackDirty(model);
    model.board.addTextElement({ text: 'Hello', x: 10, y: 10 });
    model.board.addSwatchElement({ hex: '#f59e0b', name: 'Amber', x: 50, y: 50 });
    await model.swipeFile.addItem({ type: 'quote', category: 'Quotes', title: 'Q', content: 'Less but better.', source: 'manual' });
    model.board.undo();
    model.board.redo();
    model.doc.downloadVidFile(model.board, model.swipeFile, model.fileName);
    assert.ok(downloaded, 'save must produce a .vid download');
    assert.equal(downloaded.data.format, 'visteras-inspire');
    assert.deepEqual(local.writes, [], 'no localStorage writes');
    assert.deepEqual(session.writes, [], 'no sessionStorage writes');
  } finally {
    globalThis.localStorage = prevLocal;
    globalThis.sessionStorage = prevSession;
    InspireDocument.downloadAsFile = prevDownload;
  }

  // Source-level guard: no storage writes and no autosave API anywhere in Inspire's app code
  for (const file of fs.readdirSync(path.join(inspireRoot, 'js'))) {
    const src = read(`js/${file}`);
    assert.doesNotMatch(src, /(localStorage|sessionStorage)\.setItem/, `${file} must not write browser storage`);
    assert.doesNotMatch(src, /saveToLocalStorage|loadFromLocalStorage|scheduleAutoSave|saveAllToLocalStorage/, `${file} must not autosave`);
  }
  assert.equal(typeof InspireDocument.prototype.saveToLocalStorage, 'undefined');
  assert.equal(typeof InspireDocument.loadFromLocalStorage, 'undefined');
});

test('Stale-key cleanup: old document keys are removed on load, other keys are kept', () => {
  const local = fakeStorage({
    visteras_inspire_current_doc: '{"format":"visteras-inspire"}',
    visteras_inspire_open_docs: '[]',
    visteras_theme: 'dark',
    unrelated_pref: '1'
  });
  const session = fakeStorage({ visteras_inspire_session_state: '{}', other: 'x' });
  const cleared = clearStaleDocumentStorage(local, session);
  assert.deepEqual(cleared.sort(), [
    'localStorage:visteras_inspire_current_doc',
    'localStorage:visteras_inspire_open_docs',
    'sessionStorage:visteras_inspire_session_state'
  ]);
  for (const k of STALE_DOCUMENT_STORAGE_KEYS.local) assert.equal(local.getItem(k), null);
  for (const k of STALE_DOCUMENT_STORAGE_KEYS.session) assert.equal(session.getItem(k), null);
  assert.equal(local.getItem('visteras_theme'), 'dark');
  assert.equal(local.getItem('unrelated_pref'), '1');
  assert.equal(session.getItem('other'), 'x');

  // Storage that throws (private mode) must not break startup
  const throwing = { getItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  assert.doesNotThrow(() => clearStaleDocumentStorage(throwing, null));

  const app = read('js/app.js');
  assert.match(app, /clearStaleDocumentStorage\(local, session\)/, 'app.js must clear stale keys during initDocuments');
  assert.match(app, /InspireDocument\.createBlank\('Untitled-1'\)/, 'app.js still starts with a fresh blank doc');
});

test('Dirty flag: set on real edits (board, swipe file, doc settings), not on selection, cleared on .vid save', async () => {
  const model = makeModel();
  let changes = 0;
  trackDirty(model, { onChange: () => { changes++; } });

  // Creating / attaching a board records an 'Initial state' snapshot; that is not an edit
  model.board.attachDoc(model.doc);
  assert.equal(model.isDirty, false, 'fresh or re-attached board stays clean');

  const el = model.board.addTextElement({ text: 'Hi', x: 0, y: 0 });
  assert.equal(model.isDirty, true, 'adding an element marks dirty');
  markSaved(model);
  assert.equal(model.isDirty, false, 'saving clears dirty');

  model.board.select(el.id);
  model.board.clearSelection();
  assert.equal(model.isDirty, false, 'selection changes alone are not edits');

  model.board.updateElement(el.id, { x: 40 });
  assert.equal(model.isDirty, true, 'moving an element marks dirty');
  markSaved(model);

  await model.swipeFile.addItem({ type: 'quote', category: 'Quotes', title: 'Q', content: 'x', source: 'manual' });
  assert.equal(model.isDirty, true, 'swipe file edits mark dirty');
  assert.ok(changes > 0, 'onChange re-renders tabs');

  const app = read('js/app.js');
  assert.match(app, /trackDirty\(model,/, 'app.js wires dirty tracking per document');
  assert.match(app, /markSaved\(active\)/, 'exportVidFile (Save) clears dirty');
  assert.match(app, /document_tab[^`]*\$\{d\.isDirty \? ' dirty' : ''\}/, 'dirty tabs get the Studio "dirty" class');
  assert.match(app, /tab_dirty">•</, 'dirty tabs show the • marker');
  const insp = read('js/inspector.js');
  assert.ok((insp.match(/this\.onDocChange\?\.\(\)/g) || []).length >= 8, 'inspector board-setting edits mark dirty');
});

test('Close confirm: dirty tabs ask (Studio wording), clean tabs close without asking', async () => {
  const model = makeModel();
  let asked = null;
  const ask = async (title) => { asked = title; return false; };

  assert.equal(await confirmCloseIfDirty(model, ask), true, 'clean tab closes');
  assert.equal(asked, null, 'clean tab is not prompted');

  model.isDirty = true;
  assert.equal(await confirmCloseIfDirty(model, ask), false, 'Cancel keeps a dirty tab open');
  assert.equal(asked, 'Board.vid');
  assert.equal(await confirmCloseIfDirty(model, async () => true), true, 'Close closes a dirty tab');

  const src = read('js/unsaved-changes.js');
  assert.match(src, /Unsaved Changes/);
  assert.match(src, /Unsaved changes will be lost\./);
  assert.match(src, /btn_visteras_amber" data-action="close">Close</, 'Close uses Inspire amber button');
  assert.match(src, /\[data-action="cancel"\]'\)\?\.focus\(\)/, 'Cancel has default focus like Studio');
  const app = read('js/app.js');
  assert.match(app, /await confirmCloseIfDirty\(docToClose\)/, 'closeDocument awaits the dirty confirm');
  assert.doesNotMatch(app, /has unsaved changes\. Close anyway\?/, 'native confirm() replaced');
});

test('beforeunload: prompts only when any document is dirty', () => {
  const mkEvent = () => ({ prevented: false, returnValue: undefined, preventDefault() { this.prevented = true; } });
  const docs = [{ isDirty: false }, { isDirty: false }];

  const clean = mkEvent();
  assert.equal(handleBeforeUnload(clean, docs), undefined);
  assert.equal(clean.prevented, false);
  assert.equal(hasAnyDirty(docs), false);

  docs[1].isDirty = true;
  const dirty = mkEvent();
  handleBeforeUnload(dirty, docs);
  assert.equal(dirty.prevented, true);
  assert.equal(dirty.returnValue, '');
  assert.equal(hasAnyDirty(docs), true);

  const app = read('js/app.js');
  assert.match(app, /addEventListener\('beforeunload', \(e\) => handleBeforeUnload\(e, this\.documents\)\)/);
  assert.match(app, /this\.initUnsavedChangesGuard\(\);/);
});

test('Identity guard: Inspire keeps its amber accent and .vid file type', () => {
  const css = read('css/visteras-inspire-theme.css');
  assert.match(css, /--inspire-amber/);
  assert.match(read('js/document.js'), /\.vid/);
});
