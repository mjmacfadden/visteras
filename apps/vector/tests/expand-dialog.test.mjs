import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tree, canvas } from './helpers/envelope-dom.mjs';
import { makeEnvelope } from '../js/visteras-envelope-model.js?v=envelope-11';
import { expandOptions, canExpand, expandSelection, expandTargets } from '../js/visteras-expand.js?v=expand-1';

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const all = (n) => [n, ...n.querySelectorAll('*')];

test('Expand… menu: directly above Expand Appearance, no shortcuts, greyed out until something expandable is selected', () => {
  const html = read('../index.html');
  const m = /<div[^>]*id="action_expand"[^>]*>([^<]*)<\/div>\s*<div[^>]*id="action_expand_appearance"[^>]*>([^<]*)<\/div>/.exec(html);
  assert.ok(m, 'Expand Appearance sits directly below Expand…');
  assert.equal(m[1], 'Expand…'); assert.equal(m[2], 'Expand Appearance');
  assert.doesNotMatch(m[0], /menu_dropdown_shortcut/, 'Illustrator has no default shortcut for either');
  assert.match(m[0], /id="action_expand"[^>]*|class="menu_dropdown_item disabled" id="action_expand"/);
  assert.match(html, /class="menu_dropdown_item disabled" id="action_expand"/, 'starts greyed out (nothing selected)');
  assert.equal((html.match(/Expand Appearance/g) || []).length, 1, 'only one Expand Appearance item');
  assert.equal(canExpand([]), false);
  assert.equal(canExpand([tree('path', { d: 'M0 0L9 9Z', fill: '#000' })]), false, 'a filled path has nothing to expand');
  assert.equal(canExpand([tree('image', { href: 'x' })]), false);
  const src = read('../js/visteras-expand.js');
  assert.match(src, /if \(expandBtn\.classList\.contains\('disabled'\)\) return;/);
});

test('Expand dialog: checkboxes that do not apply are disabled (Illustrator)', () => {
  const opts = (els) => expandOptions(els);
  assert.deepEqual(opts([tree('rect', { fill: 'red' })]), { object: false, fill: true, stroke: false });
  assert.deepEqual(opts([tree('rect', { fill: 'none', stroke: '#000', 'stroke-width': '4' })]), { object: false, fill: false, stroke: true });
  assert.deepEqual(opts([tree('path', { d: 'M0 0L9 9', fill: 'none', stroke: '#000' })]), { object: false, fill: false, stroke: true });
  const t = tree('text', { x: '0', y: '9' }); t.textContent = 'Hi';
  assert.deepEqual(opts([t]), { object: true, fill: false, stroke: false });
  assert.deepEqual(opts([tree('use', { href: '#s' })]), { object: true, fill: false, stroke: false });
  const g = tree('g', {}, [tree('circle', { r: '4', stroke: 'red' }), tree('use', { href: '#s' })]);
  assert.deepEqual(opts([g]), { object: true, fill: true, stroke: true }, 'groups count their contents');
  // Envelope: only Object (like Illustrator); its hidden contents never count.
  const a = tree('rect', { id: 'ea', x: '0', y: '0', width: '10', height: '10', fill: 'red', stroke: '#000' });
  tree('g', { class: 'layer' }, [a]);
  const env = makeEnvelope(canvas([a]), [a], { style: 'arc', bend: 50 });
  assert.deepEqual(opts([env]), { object: true, fill: false, stroke: false });
  const src = read('../js/visteras-expand.js');
  assert.match(src, /opts\[k\] \? ' checked' : ' disabled'/);
  assert.match(src, /mountMovable\(overlay, sc, \{ targets: elements \}\)/, 'same movable dialog as Warp Options');
  assert.match(src, /'visteras_modal_overlay venv_modal'/, 'same transparent modal layer (no dimming)');
});

test('Expand: envelope + filled rect is ONE undo step, the envelope expands exactly like Envelope Distort ▸ Expand, and nothing hidden is left', async () => {
  const a = tree('rect', { id: 'ea', x: '0', y: '0', width: '100', height: '50', fill: 'red' });
  const r = tree('rect', { id: 'r', x: '200', y: '0', width: '40', height: '40', fill: 'blue', rx: '5' });
  const layer = tree('g', { class: 'layer' }, [a, r]); const sc = canvas([a, r]);
  const env = makeEnvelope(sc, [a], { style: 'arc', bend: 50 });
  const before = JSON.stringify(layer.children.map((c) => c.id)); const n = sc.log.length;
  const out = await expandSelection({ svgCanvas: sc }, [env, r]);
  assert.equal(sc.log.length, n + 1, 'one undo step'); assert.equal(sc.log.at(-1).text, 'Expand');
  const g = out.find((e) => e.getAttribute('data-visteras-name') === 'Envelope');
  assert.ok(g, 'envelope → group named "Envelope" (Envelope Distort ▸ Expand)');
  const p = out.find((e) => e.localName === 'path' && e.id === 'r');
  assert.ok(p && p.getAttribute('fill') === 'blue' && /A5 5/.test(p.getAttribute('d')), 'rect → path with the same paint and corners');
  for (const node of all(layer)) {
    assert.ok(!Object.keys(node.attrs || {}).some((k) => k.startsWith('data-visteras-envelope')), 'no envelope attributes left');
    assert.notEqual(node.getAttribute?.('display'), 'none', 'no hidden originals left');
  }
  assert.ok(!layer.children.some((x) => x.localName === 'rect'), 'the selected rect was replaced'); // (the fake DOM has no renderer: -out is an unwarped clone)
  sc.undo(); assert.equal(JSON.stringify(layer.children.map((c) => c.id)), before, 'undo restores the envelope and the rect');
});

test('Expand: unticked options are respected and inapplicable ones are ignored', async () => {
  const r = tree('rect', { id: 'r2', x: '0', y: '0', width: '10', height: '10', fill: 'red' });
  const layer = tree('g', { class: 'layer' }, [r]); const sc = canvas([r]); const n = sc.log.length;
  const res = await expandSelection({ svgCanvas: sc }, [r], { fill: false, object: true });
  assert.equal(sc.log.length, n, 'nothing to do → no undo step'); assert.equal(res[0], r);
  assert.equal(layer.children[0].localName, 'rect');
  assert.deepEqual(expandTargets([r]).filled, [r]);
});
