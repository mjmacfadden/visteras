import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  openEndpoints, closeOpenContours, joinEndpoints,
  simplifyPathSegments, pointsToSegments, countPoints,
} from '../js/visteras-path-ops.js';
import { contours } from '../js/visteras-anchor-model.js';

const openLine = [
  { type: 2, x: 0, y: 0 },
  { type: 4, x: 100, y: 0 },
  { type: 4, x: 100, y: 50 },
];

test('Path ops: openEndpoints lists start/end of open contours', () => {
  const ends = openEndpoints(openLine);
  assert.equal(ends.length, 2);
  assert.deepEqual([ends[0].x, ends[0].y, ends[0].end], [0, 0, 'start']);
  assert.deepEqual([ends[1].x, ends[1].y, ends[1].end], [100, 50, 'end']);
  assert.equal(openEndpoints([...openLine, { type: 1 }]).length, 0);
});

test('Path ops: closeOpenContours appends Z', () => {
  const closed = closeOpenContours(openLine);
  assert.equal(closed.at(-1).type, 1);
  assert.ok(contours(closed)[0].closed);
});

test('Path ops: joinEndpoints merges two open paths', () => {
  const a = [{ type: 2, x: 0, y: 0 }, { type: 4, x: 10, y: 0 }];
  const b = [{ type: 2, x: 10, y: 0 }, { type: 4, x: 20, y: 5 }];
  const joined = joinEndpoints(a, null, b, null);
  assert.equal(joined.removeB, true);
  assert.ok(joined.segments.length >= 3);
  assert.equal(joined.segments[0].type, 2);
  assert.equal(joined.segments.at(-1).x, 20);
});

test('Path ops: simplify reduces point count at low precision', () => {
  const pts = Array.from({ length: 40 }, (_, i) => ({ x: i, y: Math.sin(i / 3) * 0.01 }));
  const segs = pointsToSegments(pts);
  const hi = simplifyPathSegments(segs, 100);
  const lo = simplifyPathSegments(segs, 10);
  assert.ok(countPoints(lo) < pts.length);
  assert.ok(countPoints(lo) <= countPoints(hi));
});

test('Path ops: menu + ⌘J + Simplify dialog + path_node XY wiring', () => {
  const src = fs.readFileSync(new URL('../js/visteras-path-ops.js', import.meta.url), 'utf8');
  assert.match(src, /action_path_join/);
  assert.match(src, /action_path_simplify/);
  assert.match(src, /KeyJ/);
  assert.match(src, /visteras_simplify_dialog/);
  assert.match(src, /Curve Precision/);
  assert.match(src, /vsimp_preview/);
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /mountPathOps\(svgEditor\)/);
  assert.match(html, /slot_path_node_xy/);
  const hy = fs.readFileSync(new URL('../css/visteras-svgedit-hygiene.css', import.meta.url), 'utf8');
  assert.doesNotMatch(hy, /#path_node_x,\s*\n#path_node_y \{/);
  const ds = fs.readFileSync(new URL('../js/visteras-direct-selection.js', import.meta.url), 'utf8');
  assert.match(ds, /syncAnchorXYFields/);
});
