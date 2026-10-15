import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tree, canvas } from './helpers/envelope-dom.mjs';
import { makeEnvelope } from '../js/visteras-envelope-model.js?v=envelope-10';
import { envelopeOutputOnly } from '../js/visteras-envelope-export.js?v=envelope-7';
import { appearanceRows } from '../js/visteras-appearance.js';
import { defaultObjectName } from '../js/visteras-layer-names.js';

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const build = () => {
  const a = tree('rect', { id: 'srcRect', x: '0', y: '0', width: '50', height: '20', fill: 'url(#g1)' });
  const layer = tree('g', { class: 'layer' }, [a]); const svg = tree('svg', {}, [layer]);
  const sc = canvas([a]); const env = makeEnvelope(sc, [a], { style: 'flag', bend: 100 });
  return { svg, layer, env, a };
};
const all = (n) => [n, ...n.querySelectorAll('*')];

test('H4/AT12 export clone keeps only the warped output: no -src, no source geometry, no envelope attributes', () => {
  const { svg, env } = build();
  const clone = svg.cloneNode(true);
  assert.equal(envelopeOutputOnly(clone), 1);
  const nodes = all(clone);
  assert.ok(!nodes.some((n) => n.id === 'srcRect'), 'source geometry removed');
  assert.ok(!nodes.some((n) => Object.keys(n.attrs).some((k) => k.startsWith('data-visteras-envelope'))));
  assert.ok(!nodes.some((n) => n.getAttribute('display') === 'none'));
  const outRect = nodes.find((n) => n.localName === 'rect');
  assert.ok(outRect && outRect.id !== 'srcRect', 'output kept');
  // The live document is untouched.
  assert.ok(all(svg).some((n) => n.id === 'srcRect'));
  assert.equal(env.getAttribute('data-visteras-envelope'), 'warp');
});

test('H5/AT13 clipboard clone of a selected envelope carries the output only', () => {
  const { env } = build();
  const clone = env.cloneNode(true);
  envelopeOutputOnly(clone);
  assert.equal(clone.children.length, 1);
  assert.ok(!all(clone).some((n) => n.id === 'srcRect'));
  assert.equal(clone.getAttribute('data-visteras-envelope'), null);
});

test('export / PDF / PNG / clipboard pipelines call envelopeOutputOnly before serializing; bounds use the envelope (= -out)', () => {
  const exp = read('../js/visteras-export.js');
  assert.match(exp, /import \{ envelopeOutputOnly \} from '\.\/visteras-envelope-export\.js\?v=envelope-7'/);
  const i = exp.indexOf('async function buildExportSvg'), j = exp.indexOf('envelopeOutputOnly(clone)', i), k = exp.indexOf('outlineStyledTextForPdf(clone', i), l = exp.indexOf("prune(clone, selected()", i);
  assert.ok(i > 0 && j > i && j < k && j < l, 'strip happens before text outlining and selection prune');
  assert.match(exp, /const root = doc\.documentElement;\n\s+envelopeOutputOnly\(root\);/);
  assert.match(exp, /sc\.getStrokedBBox\(\[el\]\)/); // envelope bbox: -src is display:none (H2)
  const clip = read('../js/visteras-clipboard-bridge.js');
  assert.match(clip, /const clone = el\.cloneNode\(true\);\n\s+\/\/ Envelopes travel[^\n]*\n\s+envelopeOutputOnly\(clone\);/);
  const html = read('../index.html');
  assert.match(html, /visteras-export\.js\?v=envelope-7/); assert.match(html, /visteras-clipboard-bridge\.js\?v=envelope-7/); assert.match(html, /visteras-appearance\.js\?v=envelope-7/);
});

test('AT15 Appearance shows Envelope and Contents (link → Edit Contents); Layers shows <Envelope>', () => {
  const { env } = build();
  const { rows, envelope } = appearanceRows([env]);
  assert.equal(envelope, true);
  assert.deepEqual(rows.map((r) => r.label), ['Envelope', 'Contents', 'Opacity']);
  assert.equal(rows[0].summary, 'Flag');
  const src = read('../js/visteras-appearance.js');
  assert.match(src, /kind === 'contents'\) \{ document\.getElementById\('action_envelope_edit'\)\?\.click\(\)/);
  assert.match(src, /data-act="edit-contents"[^>]*>Contents</);
  assert.equal(defaultObjectName(env), '<Envelope>');
  assert.equal(defaultObjectName(env.children[0]), 'Contents');
  // A plain object still gets the normal rows.
  assert.deepEqual(appearanceRows([tree('rect', { fill: 'red' })]).rows.map((r) => r.label), ['Stroke', 'Fill', 'Opacity']);
});
