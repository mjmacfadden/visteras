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
