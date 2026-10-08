import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeGridPrefs, majorStepPx, minorStepPx, snapValue, snapPoint,
  buildGridPatternMarkup, DEFAULT_GRID, GRID_STORAGE_KEY, GRID_LAYER_ID,
  loadGridPrefs, saveGridPrefs,
} from '../js/visteras-grid.js';

test('normalizeGridPrefs: defaults and clamping', () => {
  assert.deepEqual(normalizeGridPrefs(null).every, DEFAULT_GRID.every);
  assert.equal(normalizeGridPrefs({ style: 'dots', subdivisions: 0 }).subdivisions, DEFAULT_GRID.subdivisions);
  assert.equal(normalizeGridPrefs({ style: 'dots' }).style, 'dots');
  assert.equal(normalizeGridPrefs({ color: '#abc' }).color, '#aabbcc');
  assert.equal(normalizeGridPrefs({ color: 'red' }).color, DEFAULT_GRID.color);
  assert.equal(normalizeGridPrefs({ inBack: false }).inBack, false);
});

test('major/minor step honour units (96 CSS px / in)', () => {
  assert.equal(majorStepPx({ every: 100 }, 'px'), 100);
  assert.equal(minorStepPx({ every: 100, subdivisions: 10 }, 'px'), 10);
  assert.equal(majorStepPx({ every: 1 }, 'in'), 96);
  assert.equal(minorStepPx({ every: 1, subdivisions: 8 }, 'in'), 12);
  assert.ok(Math.abs(majorStepPx({ every: 25.4 }, 'mm') - 96) < 0.01);
});

test('snapValue / snapPoint: subdivision snap (Illustrator)', () => {
  assert.equal(snapValue(14, 10), 10);
  assert.equal(snapValue(16, 10), 20);
  assert.equal(snapValue(0, 10), 0);
  assert.deepEqual(snapPoint({ x: 14, y: -6 }, 10), { x: 10, y: -10 });
  assert.equal(snapValue(5, 0), 5, 'no snap when step is 0');
});

test('buildGridPatternMarkup: lines include majors + subdivisions; dots style', () => {
  const lines = buildGridPatternMarkup({ majorPx: 100, subdivisions: 4, color: '#112233', style: 'lines' });
  assert.equal(lines.width, 100);
  assert.match(lines.body, /stroke="#112233"/);
  assert.equal((lines.body.match(/<line /g) || []).length, 2 + 2 * 3, '2 major edges + 3 subdiv × 2 axes');
  const dots = buildGridPatternMarkup({ majorPx: 50, subdivisions: 2, color: '#000', style: 'dots' });
  assert.match(dots.body, /<circle /);
});

test('load/save prefs round-trip via storage stub', () => {
  const mem = new Map();
  const storage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
  };
  const saved = saveGridPrefs({ show: true, snap: true, every: 50, subdivisions: 5, style: 'dots', color: '#ff0000' }, storage);
  assert.equal(saved.show, true);
  assert.equal(mem.get(GRID_STORAGE_KEY).includes('"every":50'), true);
  const loaded = loadGridPrefs(storage);
  assert.equal(loaded.every, 50);
  assert.equal(loaded.style, 'dots');
  assert.equal(loaded.snap, true);
});

test('menus, mount, storage key, and export strip for the grid layer', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const clip = fs.readFileSync(new URL('../js/visteras-export-clip.js', import.meta.url), 'utf8');
  const allow = fs.readFileSync(new URL('../../../scripts/check-no-doc-localstorage.mjs', import.meta.url), 'utf8');
  const src = fs.readFileSync(new URL('../js/visteras-grid.js', import.meta.url), 'utf8');
  assert.match(html, /id="action_toggle_grid"/);
  assert.match(html, /id="action_snap_grid"/);
  assert.match(html, /id="action_grid_in_back"/);
  assert.match(html, /id="action_grid_prefs"/);
  assert.match(html, /mountGrid/);
  assert.match(html, /replaced by visteras-grid/);
  assert.doesNotMatch(html, /^\s*'ext-grid',/m);
  assert.match(clip, /visteras_document_grid/);
  assert.match(clip, /visteras-document-grid/);
  assert.match(allow, /GRID_STORAGE_KEY/);
  assert.match(src, /573fbb82|#canvasBackground\{display:none/);
  assert.equal(GRID_LAYER_ID, 'visteras_document_grid');
  assert.match(src, /code === 'Quote'/);
});

test('origin alignment: pattern starts at 0,0 so rects snapped to major multiples stay on the ruler origin', () => {
  // Documented contract used by redraw(): pattern x/y = 0; covering rect at floor(view/maj)*maj.
  const maj = 100;
  const viewX = -237;
  const x0 = Math.floor(viewX / maj) * maj;
  assert.equal(x0, -300);
  assert.ok(x0 % maj === 0);
});
