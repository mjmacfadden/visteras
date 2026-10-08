/**
 * Item 5 (gravit-gap-3): Arrowheads were evaluated and deferred.
 *
 * Why not in this branch:
 * - SVG-Edit ships `ext-markers` (leftarrow/rightarrow/box/mcircle) with a
 *   `#marker_panel`, but Visteras hygiene CSS hides that panel on purpose.
 * - The extension fixes marker size ("marker size is fixed") — Illustrator
 *   Stroke options need a scale control for Start/End arrowheads.
 * - Markers are per-object (not shared), color-locked to the stroke, and only
 *   for line/path/polyline/polygon — not a drop-in for the Stroke dock UX.
 * - Wiring Start/End + scale into the Stroke dock, Appearance, and verifying
 *   SVG / PDF (svg2pdf) / PNG export is a larger project than a gap-3 item.
 *
 * This test locks the "deferred" documentation and the hidden panel so we
 * don't accidentally surface the raw extension UI without the Illustrator UX.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('arrowheads deferred: Appearance documents the gap', () => {
  const src = fs.readFileSync(new URL('../js/visteras-appearance.js', import.meta.url), 'utf8');
  assert.match(src, /arrowheads deferred/i);
  assert.doesNotMatch(src, /no arrowheads in Stroke options yet/);
});

test('arrowheads deferred: marker_panel stays hidden by hygiene CSS', () => {
  const css = fs.readFileSync(new URL('../css/visteras-svgedit-hygiene.css', import.meta.url), 'utf8');
  assert.match(css, /#tools_top #marker_panel/);
  assert.match(css, /display:\s*none\s*!important/);
});

test('arrowheads deferred: ext-markers still present for a future proper Stroke-dock UX', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /ext-markers/);
  assert.ok(fs.existsSync(new URL('../extensions/ext-markers/ext-markers.js', import.meta.url)));
});
