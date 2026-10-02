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
