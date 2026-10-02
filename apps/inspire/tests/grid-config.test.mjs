import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRID_CONFIG, gridMetrics, gridBackgroundStyle, gridStylesForMode } from '../js/grid-config.js';

const inspireRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(inspireRoot, rel), 'utf8');
const px = (s) => s.split(' ').map((v) => parseFloat(v));
const dotRadiusOf = (img) => parseFloat(/\) ?([\d.]+)px, transparent/.exec(img)?.[1] ?? /([\d.]+)px, transparent/.exec(img)[1]);

// On-screen metrics as each renderer produces them:
//  fixed  = artboard style in board units, multiplied by the world transform scale(zoom)
//  infinite = viewport style already in screen px
function screenMetrics(mode, pattern, zoom, panX = 0, panY = 0) {
  const s = gridStylesForMode(mode, pattern, zoom, panX, panY);
  const style = mode === 'infinite' ? s.viewport : s.artboard;
  const scale = mode === 'infinite' ? 1 : zoom;
  const [sx, sy] = px(style.backgroundSize).map((v) => v * scale);
  const radius = dotRadiusOf(style.backgroundImage) * scale;
  const [ox, oy] = px(style.backgroundPosition).map((v, i) => (mode === 'infinite' ? v : (i === 0 ? panX : panY) + v * zoom));
  return { sx, sy, radius, ox, oy };
}

test('Grid: fixed and infinite modes give the same on-screen spacing and dot size at every zoom', () => {
  for (const zoom of [0.25, 0.5, 1, 1.5, 2, 4]) {
    const fixed = screenMetrics('fixed', 'dots', zoom, 37, -12);
    const infinite = screenMetrics('infinite', 'dots', zoom, 37, -12);
    const expected = gridMetrics(zoom);
    for (const m of [fixed, infinite]) {
      assert.ok(Math.abs(m.sx - expected.spacing) < 1e-9, `spacing @${zoom}`);
      assert.ok(Math.abs(m.sy - expected.spacing) < 1e-9, `spacing y @${zoom}`);
      assert.ok(Math.abs(m.radius - expected.dotRadius) < 1e-9, `dot radius @${zoom}`);
    }
    // Same grid origin on screen => no misalignment/swimming while panning
    assert.ok(Math.abs(fixed.ox - infinite.ox) < 1e-9 && Math.abs(fixed.oy - infinite.oy) < 1e-9, `origin @${zoom}`);
  }
  assert.deepEqual(gridMetrics(1), { spacing: GRID_CONFIG.spacing, dotRadius: GRID_CONFIG.dotRadius, lineWidth: GRID_CONFIG.lineWidth });
  assert.deepEqual(gridMetrics(2), { spacing: 48, dotRadius: 3, lineWidth: 2 });
});

test('Grid: infinite viewport grid follows pan exactly and blueprint lines scale with zoom', () => {
  const a = gridStylesForMode('infinite', 'dots', 1.5, 100, 50).viewport;
  const b = gridStylesForMode('infinite', 'dots', 1.5, 133.5, 20.25).viewport;
  assert.equal(a.backgroundPosition, '100px 50px');
  assert.equal(b.backgroundPosition, '133.5px 20.25px');
  assert.equal(a.backgroundSize, b.backgroundSize, 'panning never changes spacing');
  const grid = gridBackgroundStyle('grid', 2);
  assert.match(grid.backgroundImage, /2px, transparent 2px/);
  assert.equal(grid.backgroundSize, '48px 48px');
  assert.equal(gridBackgroundStyle('blank', 2).backgroundImage, 'none');
  // Only one surface paints the grid in each mode
  assert.equal(gridStylesForMode('infinite', 'dots', 1).artboard.backgroundImage, 'none');
  assert.equal(gridStylesForMode('fixed', 'dots', 1).viewport.backgroundImage, '');
});

test('Grid: both renderers read the single shared config (no hard-coded duplicates)', () => {
  const canvas = read('js/canvas.js');
  const css = read('css/visteras-inspire-theme.css');
  assert.match(canvas, /import \{ gridStylesForMode \} from '\.\/grid-config\.js'/);
  assert.match(canvas, /applyGridBackground\(\)/);
  assert.doesNotMatch(canvas, /24 \* this\.zoom/, 'no hard-coded grid spacing in canvas.js');
  assert.doesNotMatch(css, /radial-gradient\(rgba\(0, 0, 0, 0\.12\) 1\.5px/, 'no duplicate dot rule in CSS');
  assert.doesNotMatch(css, /pattern-(dots|grid)[^{]*\{[^}]*background-size/s, 'no duplicate grid size in CSS');
});
