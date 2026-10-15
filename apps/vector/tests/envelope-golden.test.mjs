// AT4 golden geometry: every style at bend ±50/±100, Horizontal and Vertical, frozen in
// tests/fixtures/envelope/<style>.svg. The references were generated from our own math the first
// time (UPDATE_ENVELOPE_GOLDEN=1 node --test tests/envelope-golden.test.mjs) and are now frozen.
// Tolerance: 0.01 px per coordinate (render maths only; Illustrator tuning is a documented follow-up).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STYLES } from '../js/visteras-envelope-core.js?v=envelope-5';
import { parsePathData, shapeToPathData, warpSegments, segmentsToPathData } from '../js/visteras-envelope-warp.js?v=envelope-5';

const DIR = new URL('./fixtures/envelope/', import.meta.url);
const BOX = [0, 0, 200, 100], TOL = 0.01;
const SHAPE = [shapeToPathData('rect', { x: 0, y: 0, width: 200, height: 100 }),
  'M0 50L200 50', 'M100 0L100 100', 'M0 25C50 0 150 0 200 25', 'M20 80Q100 120 180 80'].join(' ');
const CASES = [];
for (const dir of ['h', 'v']) for (const bend of [-100, -50, 50, 100]) CASES.push({ dir, bend });
const render = (style, { dir, bend }) => segmentsToPathData(warpSegments(parsePathData(SHAPE), BOX, { style, dir, bend, dh: 0, dv: 0 }, { fidelity: 50 }).segments);
const svgFor = (style) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-150 -150 500 400" data-tolerance="${TOL}">\n` +
  CASES.map((c) => `  <path id="${style}-${c.dir}-${c.bend < 0 ? 'm' : 'p'}${Math.abs(c.bend)}" fill="none" stroke="black" d="${render(style, c)}"/>`).join('\n') + '\n</svg>\n';
const nums = (d) => (d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) || []).map(Number);
const cmds = (d) => d.replace(/[^MCLZmclz]/g, '');

if (process.env.UPDATE_ENVELOPE_GOLDEN === '1') for (const style of STYLES) fs.writeFileSync(new URL(`${style}.svg`, DIR), svgFor(style));

for (const style of STYLES) {
  test(`AT4 golden ${style}: bend ±50/±100, H and V match the frozen reference within ${TOL}px`, () => {
    const file = new URL(`${style}.svg`, DIR);
    assert.ok(fs.existsSync(file), `missing fixture ${style}.svg`);
    const ref = fs.readFileSync(file, 'utf8');
    for (const c of CASES) {
      const id = `${style}-${c.dir}-${c.bend < 0 ? 'm' : 'p'}${Math.abs(c.bend)}`;
      const m = new RegExp(`id="${id}"[^>]* d="([^"]+)"`).exec(ref);
      assert.ok(m, `fixture path ${id}`);
      const got = render(style, c);
      assert.equal(cmds(got), cmds(m[1]), `${id} command structure`);
      const a = nums(got), b = nums(m[1]);
      assert.equal(a.length, b.length, `${id} coordinate count`);
      for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) <= TOL, `${id} coord ${i}: ${a[i]} vs ${b[i]}`);
    }
  });
}

test('AT4 references actually deform (no fixture is the identity) and ±bend mirror differently', () => {
  for (const style of STYLES) {
    const p50 = render(style, { dir: 'h', bend: 50 }), m50 = render(style, { dir: 'h', bend: -50 });
    assert.notEqual(p50, m50, style);
  }
});
