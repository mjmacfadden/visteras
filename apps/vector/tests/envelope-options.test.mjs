import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tree, canvas } from './helpers/envelope-dom.mjs';
import { makeEnvelope, updateEnvelope } from '../js/visteras-envelope-model.js?v=envelope-12';
import { readEnvelope } from '../js/visteras-envelope-core.js?v=envelope-12';
import { getSessionOpts, setSessionOpts, resetSession } from '../js/visteras-envelope-dialogs.js?v=envelope-12';
import { buildOutput } from '../js/visteras-envelope-render.js?v=envelope-12';
import { countNodes, parsePathData } from '../js/visteras-envelope-warp.js?v=envelope-12';

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const env = (extra = {}) => { let n = 0; return { doc: { createElementNS: (_n, t) => tree(t) }, nextId: () => `n${++n}`, outlines: new Map(), rasters: new Map(), ...extra }; };
const mk = (opts = {}, attrs = {}) => {
  const r = tree('rect', { id: 'r', x: '0', y: '0', width: '200', height: '100', fill: 'red', ...attrs });
  tree('g', { class: 'layer' }, [r]);
  const sc = canvas([r]);
  return { r, sc, g: makeEnvelope(sc, [r], { style: 'flag', bend: 60 }, opts) };
};
const pathsOf = (out) => out.querySelectorAll('*').filter((n) => n.localName === 'path');

test('Envelope Options on a selected envelope is one undo step; redo restores', () => {
  const { sc, g } = mk();
  updateEnvelope(sc, g, { opts: { fidelity: 100, preserve: 'alpha', aa: false, appearance: false } }, { label: 'Envelope Options' });
  assert.equal(sc.log.length, 2); assert.equal(sc.log[1].text, 'Envelope Options');
  assert.deepEqual([readEnvelope(g).opts.fidelity, readEnvelope(g).opts.preserve, readEnvelope(g).opts.aa], [100, 'alpha', false]);
  sc.undo(); assert.equal(readEnvelope(g).opts.fidelity, 50); assert.equal(readEnvelope(g).opts.preserve, 'clip');
  sc.redo(); assert.equal(readEnvelope(g).opts.fidelity, 100);
});

test('AT10 Fidelity 0 → 100 shows in the rendered node count (monotonic)', () => {
  const counts = [0, 50, 100].map((fidelity) => {
    const { sc, g } = mk({ fidelity });
    return countNodes(parsePathData(pathsOf(buildOutput(g, env(), (s) => s.cloneNode(true)))[0].getAttribute('d')));
  });
  assert.ok(counts[0] <= counts[1] && counts[1] <= counts[2] && counts[0] < counts[2], counts.join());
});

test('defaults with nothing selected apply to the next Make (memory only)', () => {
  resetSession();
  setSessionOpts({ fidelity: 80, preserve: 'alpha', linGrad: true });
  const o = getSessionOpts();
  assert.equal(o.fidelity, 80); assert.equal(o.preserve, 'alpha');
  const { g } = mk(getSessionOpts());
  assert.equal(readEnvelope(g).opts.fidelity, 80);
  resetSession(); assert.equal(getSessionOpts().fidelity, 50);
  const dialogs = read('../js/visteras-envelope-dialogs.js');
  assert.match(dialogs, /makeEnvelope\(sc, targets, state, getSessionOpts\(\)\)/);
  assert.match(dialogs, /else setSessionOpts\(opts\)/);
  assert.doesNotMatch(dialogs, /localStorage|sessionStorage|indexedDB/);
});

test('Distort Appearance on: stroke becomes a warped filled outline grouped with the fill', () => {
  const { r, g } = mk({}, { stroke: '#000', 'stroke-width': '8' });
  const so = new Map([[r, { d: 'M-4 -4H204V104H-4Z M4 4V96H196V4Z', color: '#000', opacity: 0.5 }]]);
  const out = buildOutput(g, env({ strokeOutlines: so }), (s) => s.cloneNode(true));
  const grp = out.children.find((n) => n.localName === 'g');
  assert.ok(grp, 'outlined group');
  const [fillPath, strokePath] = grp.children;
  assert.equal(fillPath.getAttribute('fill'), 'red'); assert.equal(fillPath.getAttribute('stroke'), 'none'); assert.equal(fillPath.getAttribute('stroke-width'), null);
  assert.equal(strokePath.getAttribute('fill'), '#000'); assert.equal(strokePath.getAttribute('stroke'), 'none'); assert.equal(strokePath.getAttribute('fill-opacity'), '0.5');
  assert.match(strokePath.getAttribute('d'), /^M/);
});

test('Distort Appearance off: the stroke stays a uniform stroke on the warped path', () => {
  const { g } = mk({ appearance: false }, { stroke: '#000', 'stroke-width': '8' });
  const p = pathsOf(buildOutput(g, env(), (s) => s.cloneNode(true)))[0];
  assert.equal(p.getAttribute('stroke'), '#000'); assert.equal(p.getAttribute('stroke-width'), '8');
  const render = read('../js/visteras-envelope-render.js');
  assert.match(render, /if \(data\.opts\.appearance && deps\.loadStrokeOutliner\)/);
});

test('Envelope Options dialog wiring: rasters, preserve shape, fidelity 0–100, disabled "Coming later" items', () => {
  const src = read('../js/visteras-envelope-dialogs.js');
  assert.match(src, /id="venvo_title">Envelope Options/);
  assert.match(src, /id="venvo_aa"> Anti-Alias/);
  assert.match(src, /value="clip"> Clipping Mask/); assert.match(src, /value="alpha"> Transparency/);
  assert.match(src, /id="venvo_fidelity_range" min="0" max="100"/);
  assert.match(src, /id="venvo_appearance"> Distort Appearance/);
  assert.match(src, /id="venvo_lingrad" disabled title="Coming later"> Distort Linear Gradients/);
  assert.match(src, /id="venvo_pattern" disabled title="Coming later"> Distort Pattern Fills/);
  assert.match(src, /label: 'Envelope Options'/);
  assert.match(read('../js/visteras-envelope.js'), /openEnvelopeOptions\(sc, \{ envelope: currentEnvelope\(\) \}\)/);
});
