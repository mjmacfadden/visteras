import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as utils from '../js/inspire-utils.js';

const inspireRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(inspireRoot, rel), 'utf8');

test('Bug 8: status-bar zoom never reads a missing canvas', () => {
  assert.equal(utils.zoomPercent({}, null), 100);
  assert.equal(utils.zoomPercent(undefined, undefined), 100);
  assert.equal(utils.zoomPercent({}, { zoom: 0.5 }), 50);
  assert.equal(utils.zoomPercent({ zoom: 37 }, null), 37);
  assert.equal(utils.zoomPercent({}, { zoom: NaN }), 100);
  assert.match(read('js/app.js'), /const z = zoomPercent\(extra, this\.canvas\);/);
  assert.doesNotMatch(read('js/app.js'), /Math\.round\(this\.canvas\.zoom \* 100\)\);\n\s*zoomEl/);
});

test('Bug 7: artboard size changes apply instantly (no layout transition) so hit-testing is right immediately', () => {
  const css = read('css/visteras-inspire-theme.css');
  const artboardRule = /\.inspire-artboard \{([^}]*)\}/.exec(css)[1];
  assert.doesNotMatch(artboardRule, /transition\s*:/, '.inspire-artboard must not transition width/height');
  assert.doesNotMatch(css, /transition:\s*width[^;]*height/, 'no width/height transitions on canvas layout');
  assert.match(/\.inspire-artboard-frame \{([^}]*)\}/.exec(css)[1], /vertical-align: top/);
});

test('Bug 4: opening a .vid keeps its created date through re-save', async () => {
  const { InspireDocument } = await import('../js/document.js');
  const { BoardComposer } = await import('../js/board-composer.js');
  const { SwipeFileManager } = await import('../js/swipe-file.js');
  const file = InspireDocument.createBlank('Old Board');
  file.meta.created = '2024-03-01T10:00:00.000Z';
  file.meta.modified = '2024-03-02T10:00:00.000Z';
  // Same steps as app.createDocumentModel()
  const doc = new InspireDocument(file.board);
  utils.applyFileMeta(doc, file.meta);
  const resaved = doc.serialize(new BoardComposer([], null, doc), new SwipeFileManager(null));
  assert.equal(resaved.meta.created, '2024-03-01T10:00:00.000Z', 'created survives re-save');
  assert.notEqual(resaved.meta.modified, '2024-03-02T10:00:00.000Z', 'modified refreshes on save');
  // Garbage / missing meta leaves fresh timestamps alone
  const fresh = new InspireDocument();
  const before = fresh.created;
  utils.applyFileMeta(fresh, { created: 'not a date' });
  utils.applyFileMeta(fresh, null);
  assert.equal(fresh.created, before);
  assert.match(read('js/app.js'), /applyFileMeta\(docInstance, data\.meta\)/);
});

test('Bug 6: tab name and downloaded .vid name are the same (spaces kept, only illegal chars replaced)', async () => {
  assert.equal(utils.safeVidFileName('My Board.vid'), 'My Board.vid');
  assert.equal(utils.safeVidFileName('My Board'), 'My Board.vid');
  assert.equal(utils.safeVidFileName('Brand v2.1 – Café'), 'Brand v2.1 – Café.vid');
  assert.equal(utils.safeVidFileName('a/b:c*?"<>|d'), 'a_b_c______d.vid');
  assert.equal(utils.safeVidFileName('   '), 'Untitled.vid');
  assert.equal(utils.safeVidFileName('.hidden..'), 'hidden.vid');
  assert.equal(utils.safeFileBase('Mood Board.vid'), 'Mood Board');

  const { InspireDocument } = await import('../js/document.js');
  const created = [];
  const prevDoc = globalThis.document, prevURL = globalThis.URL.createObjectURL, prevRevoke = globalThis.URL.revokeObjectURL;
  globalThis.document = {
    createElement: () => { const a = { click() {}, set download(v) { created.push(v); } }; return a; },
    body: { appendChild() {}, removeChild() {} }
  };
  globalThis.URL.createObjectURL = () => 'blob:x';
  globalThis.URL.revokeObjectURL = () => {};
  try {
    const returned = InspireDocument.downloadAsFile(InspireDocument.createBlank('x'), 'Summer Mood Board.vid');
    assert.equal(returned, 'Summer Mood Board.vid');
    assert.deepEqual(created, ['Summer Mood Board.vid'], 'download keeps spaces, matches tab');
    await new Promise((r) => setTimeout(r, 150)); // let the anchor cleanup timer run
  } finally {
    globalThis.document = prevDoc; globalThis.URL.createObjectURL = prevURL; globalThis.URL.revokeObjectURL = prevRevoke;
  }
  const app = read('js/app.js');
  assert.match(app, /const fileName = safeVidFileName\(active\.fileName \|\| active\.doc\.title\);/);
  assert.match(app, /active\.fileName = fileName;\n\s*active\.title = savedTitle;/, 'tab reflects the saved name');
  assert.match(app, /val = safeVidFileName\(val\);/, 'renaming a tab uses the same rule');
});

test('Bug 3: opening a same-name .vid switches only when content is identical, otherwise opens a new tab', async () => {
  const { InspireDocument } = await import('../js/document.js');
  const { BoardComposer } = await import('../js/board-composer.js');
  const { SwipeFileManager } = await import('../js/swipe-file.js');
  const { resolveOpenTarget } = await import('../js/open-match.js');
  const toModel = (data, fileName) => {
    const doc = new InspireDocument(data.board);
    return { id: data.meta.id, title: fileName.replace(/\.vid$/, ''), fileName, doc,
      board: new BoardComposer(data.board.elements, null, doc), swipeFile: new SwipeFileManager(data.swipeFile) };
  };
  const fileA = InspireDocument.createBlank('Board');
  fileA.board.elements = [{ id: 'e1', type: 'text', x: 10, y: 10, width: 100, height: 20, data: { text: 'A' } }];
  const open = [toModel(JSON.parse(JSON.stringify(fileA)), 'Board.vid')];

  // identical bytes (re-open same file) -> switch
  let r = resolveOpenTarget(open, JSON.parse(JSON.stringify(fileA)), { fileName: 'Board.vid', title: 'Board' });
  assert.equal(r.action, 'switch');
  // same id, same content, different timestamps -> switch
  const sameNewerMeta = JSON.parse(JSON.stringify(fileA)); sameNewerMeta.meta.modified = '2030-01-01T00:00:00.000Z';
  assert.equal(resolveOpenTarget(open, sameNewerMeta, { fileName: 'Board.vid', title: 'Board' }).action, 'switch');
  // different file, same name -> new tab
  const fileB = InspireDocument.createBlank('Board');
  fileB.board.elements = [{ id: 'e9', type: 'text', x: 0, y: 0, width: 50, height: 20, data: { text: 'B' } }];
  r = resolveOpenTarget(open, fileB, { fileName: 'Board.vid', title: 'Board' });
  assert.deepEqual(r, { action: 'new', sameNameOpen: true });
  // same id but the file on disk is newer (different content) -> new tab
  const newer = JSON.parse(JSON.stringify(fileA)); newer.board.elements[0].x = 400;
  assert.equal(resolveOpenTarget(open, newer, { fileName: 'Other.vid', title: 'Other' }).action, 'new');
  // the open tab has unsaved edits -> reopening the file opens it fresh in a new tab
  open[0].board.updateElement('e1', { x: 999 });
  assert.equal(resolveOpenTarget(open, JSON.parse(JSON.stringify(fileA)), { fileName: 'Board.vid', title: 'Board' }).action, 'new');
  // unrelated name -> new tab, no collision note
  assert.deepEqual(resolveOpenTarget(open, fileB, { fileName: 'Else.vid', title: 'Else' }), { action: 'new', sameNameOpen: false });

  const app = read('js/app.js');
  assert.match(app, /resolveOpenTarget\(this\.documents, docData,/);
  assert.match(app, /Tab ids must stay unique/);
  assert.doesNotMatch(app, /Switched to open document/);
});
