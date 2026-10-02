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
