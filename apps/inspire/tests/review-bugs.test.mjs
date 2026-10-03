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
  assert.match(app, /const savedFileName = safeVidFileName\(result\.name \|\| fileName\);/, 'name chosen in the save picker goes through the same rule');
  assert.match(app, /active\.fileName = savedFileName;\n\s*active\.title = savedTitle;/, 'tab reflects the saved name');
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

test('Bug 5: undo snapshots store each embedded image once and undo/redo restore it', async () => {
  const { BoardComposer } = await import('../js/board-composer.js');
  const big = 'data:image/png;base64,' + 'A'.repeat(200_000);
  const big2 = 'data:image/png;base64,' + 'B'.repeat(150_000);
  const board = new BoardComposer();
  board.elements.push({ id: 'img1', type: 'image', x: 0, y: 0, width: 100, height: 100, zIndex: 1, data: { src: big, title: 'Photo' } });
  board.saveHistory('Add image');
  for (let i = 0; i < 40; i++) board.updateElement('img1', { x: i * 5 });
  board.elements.push({ id: 'img2', type: 'image', x: 0, y: 0, width: 50, height: 50, zIndex: 2, data: { src: big2 } });
  board.saveHistory('Add image 2');

  const total = board.history.reduce((n, h) => n + h.snapshot.length, 0);
  assert.ok(total < 100_000, `history must not copy images per step (was ${total} chars)`);
  assert.equal(board.assetDataById.size, 2, 'each image stored exactly once');
  assert.ok(board.history.every((h) => !h.snapshot.includes('AAAAAAAAAA')), 'no raw image data in snapshots');

  // Undo past image 2, then back to the first image state, then redo everything
  board.undo();
  assert.equal(board.elements.length, 1);
  assert.equal(board.elements[0].data.src, big, 'image data restored on undo');
  while (board.canUndo()) board.undo();
  assert.equal(board.elements.length, 0);
  while (board.canRedo()) board.redo();
  assert.equal(board.elements.length, 2);
  assert.equal(board.elements[0].data.src, big);
  assert.equal(board.elements[1].data.src, big2);
  assert.equal(board.elements[0].x, 195);

  // Small strings and lookalike objects are untouched
  board.elements.push({ id: 't', type: 'text', x: 0, y: 0, width: 10, height: 10, data: { text: 'data:short', meta: { $asset: 'zzz', extra: 1 } } });
  board.saveHistory('t');
  board.undo(); board.redo();
  const t = board.elements.find((e) => e.id === 't');
  assert.equal(t.data.text, 'data:short');
  assert.deepEqual(t.data.meta, { $asset: 'zzz', extra: 1 });
});

test('Bug 1: Infinite-mode export uses the content bounds of all elements plus padding', async () => {
  const ex = await import('../js/export-utils.js');
  const els = [
    { x: -300, y: -120, width: 200, height: 100 },
    { x: 500, y: 400, width: 100, height: 50 },
    { x: 0, y: 0, width: 100, height: 100, rotation: 45 }
  ];
  const b = ex.computeContentBounds(els, 40);
  assert.deepEqual(b, { x: -340, y: -160, width: 980, height: 650 });
  assert.equal(ex.computeContentBounds([], 40), null);
  assert.deepEqual(ex.exportRegion({ mode: 'infinite' }, els), ex.computeContentBounds(els));
  assert.equal(ex.exportRegion({ mode: 'infinite' }, []), null, 'empty infinite board: nothing to export');
  assert.deepEqual(ex.exportRegion({ mode: 'fixed', width: 1920, height: 1080 }, els), { x: 0, y: 0, width: 1920, height: 1080 });

  // onclone lays the 0×0 infinite artboard out as the region, shifted, with the board background
  const mk = () => ({ style: {}, className: '' });
  const world = mk(), viewport = mk(), artboard = mk(), elLayer = mk(), connLayer = mk(), svg = mk(), guides = mk();
  artboard.className = 'inspire-artboard pattern-blank mode-infinite';
  artboard.querySelectorAll = (sel) => (sel.includes('svg') ? [svg] : [elLayer, connLayer]);
  const doc = {
    querySelector: (s) => ({ '.inspire-canvas-world': world, '.inspire-viewport': viewport }[s] || null),
    querySelectorAll: (s) => (s === '.inspire-guides-layer' ? [guides] : []),
    getElementById: () => artboard
  };
  ex.prepareExportClone(doc, { region: { x: -340, y: -160, width: 980, height: 650 }, mode: 'infinite', background: '#123456', pattern: 'dots' });
  assert.equal(world.style.transform, 'none');
  assert.equal(artboard.style.width, '980px');
  assert.equal(artboard.style.height, '650px');
  assert.equal(artboard.style.backgroundColor, '#123456');
  assert.doesNotMatch(artboard.className, /mode-infinite/, 'drop the class that forces a transparent background');
  assert.match(artboard.style.backgroundImage, /radial-gradient/, 'pattern carried into the export');
  assert.equal(elLayer.style.transform, 'translate(340px, 160px)');
  assert.equal(connLayer.style.transform, 'translate(340px, 160px)');
  assert.equal(guides.style.display, 'none');

  const app = read('js/app.js');
  assert.match(app, /const region = exportRegion\(this\.doc, this\.board\.elements\);/);
  assert.match(app, /onclone: \(clonedDoc\) => prepareExportClone\(clonedDoc,/);
  assert.match(app, /Nothing to export yet/);
});

test('Bug 2: export scale is clamped to safe canvas limits and reports when reduced', async () => {
  const ex = await import('../js/export-utils.js');
  const within = (r) => r.width <= 8192 && r.height <= 8192 && r.width * r.height <= 16_777_216;
  // 16:9 board: full 2x fits
  assert.deepEqual(ex.computeSafeExportScale(1920, 1080), { scale: 2, reduced: false, width: 3840, height: 2160 });
  // US Letter print at 2x would be 33.7M px -> reduced
  const letter = ex.computeSafeExportScale(3300, 2550);
  assert.ok(letter.reduced && within(letter) && letter.scale > 1.4, JSON.stringify(letter));
  // Poster 18x24 (5400x7200) at 2x = 10800x14400 -> capped
  const poster = ex.computeSafeExportScale(5400, 7200);
  assert.ok(poster.reduced && within(poster), JSON.stringify(poster));
  assert.ok(poster.scale > 0.6 && poster.width > 3000, 'downscale gracefully, not to a thumbnail');
  // Very wide content hits the per-side limit first
  const wide = ex.computeSafeExportScale(20000, 300);
  assert.ok(wide.width <= 8192 && wide.reduced);
  // Every preset stays within limits
  const { CANVAS_PRESETS } = await import('../js/document.js');
  for (const p of Object.values(CANVAS_PRESETS)) assert.ok(within(ex.computeSafeExportScale(p.width, p.height)), p.name);
  assert.match(read('js/app.js'), /scale reduced to \$\{sizing\.scale\}×/);
  assert.doesNotMatch(read('js/app.js'), /scale: 2, \/\/ 2x retina clarity/);
});

test('Smoke fix 1: a click with no movement is not a transform', () => {
  const el = { id: 'a', x: 10, y: 20, width: 100, height: 50, rotation: 0, data: { text: 'hi' } };
  const snap = [{ ...el, data: { ...el.data } }];
  assert.equal(utils.transformChanged(snap, [el]), false);
  assert.equal(utils.transformChanged(snap, [{ ...el, x: 11 }]), true);
  assert.equal(utils.transformChanged(snap, [{ ...el, rotation: 15 }]), true);
  assert.equal(utils.transformChanged(snap, [{ ...el, width: 90 }]), true);
  assert.equal(utils.transformChanged(snap, [{ ...el, data: { text: 'hi', fontSize: 30 } }]), true);
  assert.equal(utils.transformChanged([], []), false);
  const src = read('js/canvas.js');
  assert.match(src, /if \(!transformChanged\(before, this\.board\.getSelectedElements\(\)\)\) return;/);
});
