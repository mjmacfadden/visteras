import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../js/visteras-selection.js', import.meta.url), 'utf8');

test('Area text: grips resize the frame (data-text-width/height + x/y), not the glyphs', () => {
  assert.match(src, /const areaTextFrame = \(elements, dir\) =>/);
  // single, unrotated, unscaled area text only; point text / textPath / rotation keep scaling
  assert.match(src, /elements\.length === 1 \? elements\[0\] : null/);
  assert.match(src, /dir === 'rotate' \|\| el\.tagName !== 'text' \|\| !el\.hasAttribute\('data-text-width'\) \|\| el\.querySelector\('textPath'\)/);
  assert.match(src, /Math\.abs\(lm\.b\) > 1e-9 \|\| Math\.abs\(lm\.c\) > 1e-9\) return null/);
  // live: frame attributes, never a transform; the text-editing observer reflows
  const live = src.slice(src.indexOf('if (drag.area) {'), src.indexOf('for (const item of drag.items) {\n      const m'));
  assert.match(live, /setAttribute\('data-text-width', f\.w\)/);
  assert.doesNotMatch(live, /'transform'/);
  // one undo step, restorable on Esc / window blur
  assert.match(src, /new ChangeElementCommand\(area\.el, area\.attrs, 'Resize text box'\)/);
  assert.match(src, /if \(cancel \|\| !moved\) restore\(\);/);
  // handles sit on the frame
  assert.match(src, /el\.tagName === 'text' && el\.hasAttribute\('data-text-width'\)[^\n]*\n\s*const n = /);
});

test('Area text: resizedFrame maths (scale about an anchor in element space)', () => {
  // Re-implement with DOMMatrix-like algebra to pin the contract: SE drag 1.5× from (520,470).
  const scaleAbout = (ax, ay, sx, sy) => (x, y) => [ax + (x - ax) * sx, ay + (y - ay) * sy];
  const f = scaleAbout(520, 470, 1.5, 1.5);
  const a = f(520, 470), b = f(720, 570);
  assert.deepEqual([a[0], a[1], b[0] - a[0], b[1] - a[1]], [520, 470, 300, 150]);
  assert.match(src, /w: r\(Math\.max\(1, Math\.abs\(b\.x - a\.x\)\)\)/, 'frame never collapses below 1 px');
});
