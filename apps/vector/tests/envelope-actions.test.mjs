import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tree, canvas, serialize } from './helpers/envelope-dom.mjs';
import { makeEnvelope, updateEnvelope } from '../js/visteras-envelope-model.js?v=envelope-8';
import { readEnvelope, isEnvelopeSource, EDITING, envelopeHash } from '../js/visteras-envelope-core.js?v=envelope-8';
import { editContents, editEnvelope, releaseEnvelope, expandEnvelope, stripEnvelopeAttrs, sweepLocalClips, RELEASE_FILL, EXPAND_NAME } from '../js/visteras-envelope-actions.js?v=envelope-8';

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const setup = () => {
  const a = tree('rect', { id: 'a', x: '0', y: '0', width: '100', height: '50', fill: 'red' });
  const t = tree('text', { id: 't', x: '0', y: '80' }); t.textContent = 'Hi';
  const root = tree('g', { class: 'layer' }, [tree('rect', { id: 'below' }), a, t, tree('rect', { id: 'above' })]);
  const sc = canvas([a, t]);
  sc.history.ChangeElementCommand = sc.history.ChangeElementCommand; // from fake-svg
  const env = makeEnvelope(sc, [a, t], { style: 'arch', bend: 40 });
  return { a, t, root, sc, env };
};
const allNodes = (n) => [n, ...n.querySelectorAll('*')];
// -out is derived (re-rendered with fresh ids after undo); compare the authored document.
const DERIVED = new Set(['data-visteras-envelope-hash', 'data-visteras-envelope-rendered']);
const authored = (node) => JSON.stringify([node.localName, Object.fromEntries(Object.entries(node.attrs || {}).filter(([k]) => !DERIVED.has(k))), (node.children || []).filter((c) => !c.hasAttribute?.('data-visteras-envelope-out')).map(authored)]);

test('AT6 Make, Reset, Options, Release and Expand are each exactly one undo step; redo restores', () => {
  const { root, sc, env } = setup();
  const steps = [];
  const step = (fn, label) => { const before = authored(root), n = sc.log.length; fn(); assert.equal(sc.log.length, n + 1, label); assert.equal(sc.log.at(-1).text, label); const after = authored(root); sc.undo(); assert.equal(authored(root), before, `${label} undo`); sc.redo(); assert.equal(authored(root), after, `${label} redo`); steps.push(label); };
  assert.equal(sc.log.at(-1).text, 'Make with Warp');
  step(() => updateEnvelope(sc, env, { params: { style: 'bulge' } }, { label: 'Reset with Warp' }), 'Reset with Warp');
  step(() => updateEnvelope(sc, env, { opts: { fidelity: 90 } }, { label: 'Envelope Options' }), 'Envelope Options');
  step(() => editContents(sc, env), 'Edit Contents');
  step(() => editEnvelope(sc, env), 'Edit Envelope');
  // Release and Expand are terminal; check each from the same state.
  const before = authored(root);
  step(() => releaseEnvelope(sc, env), 'Release');
  sc.undo(); assert.equal(authored(root), before);
  sc.log.pop();
  step(() => expandEnvelope(sc, env), 'Expand');
});

test('AT7 Expand → plain artwork in a group named "Envelope", no envelope attributes, fresh ids', () => {
  const { root, sc, env } = setup();
  const g = expandEnvelope(sc, env);
  assert.ok(!root.children.includes(env));
  assert.equal(g.getAttribute('data-visteras-name'), EXPAND_NAME);
  for (const n of allNodes(g)) {
    for (const k of Object.keys(n.attrs)) assert.ok(!k.startsWith('data-visteras-envelope'), `${n.localName} ${k}`);
    assert.notEqual(n.id, 'a'); assert.notEqual(n.id, 't');
    assert.notEqual(n.getAttribute('display'), 'none');
  }
  // Order kept: expanded group sits where the envelope was.
  assert.deepEqual(root.children.map((n) => n.id), ['below', g.id, 'above']);
});

test('AT7 (render) Expand of a rendered envelope contains only path/image leaves', () => {
  const { sc, env } = setup();
  // Simulate the browser render: -out holds warped paths (and an image with its clip).
  const out = readEnvelope(env).out;
  for (const c of [...out.children]) c.remove();
  out.appendChild(tree('path', { id: 'o1', d: 'M0 0L1 1', 'data-visteras-envelope-unwarped': 'x' }));
  out.appendChild(tree('defs', {}, [tree('clipPath', { id: 'c1' }, [tree('path', { d: 'M0 0' })]), tree('clipPath', { id: 'orphan' }, [tree('path', { d: 'M0 0' })])]));
  out.appendChild(tree('image', { id: 'o2', 'clip-path': 'url(#c1)', 'data-visteras-envelope-preserve': 'clip' }));
  const g = expandEnvelope(sc, env);
  const leaves = allNodes(g).filter((n) => !n.children.length && !['clipPath', 'defs'].includes(n.parentNode?.localName) && n !== g);
  assert.ok(leaves.every((n) => ['path', 'image'].includes(n.localName)), leaves.map((n) => n.localName).join());
  const clips = allNodes(g).filter((n) => n.localName === 'clipPath');
  assert.equal(clips.length, 1, 'H6: orphan clipPath swept, referenced one kept');
  const img = allNodes(g).find((n) => n.localName === 'image');
  assert.equal(img.getAttribute('clip-path'), `url(#${clips[0].id})`);
});

test('AT8 Release gives back the original objects identically, plus one envelope-shape path; wrappers unwrapped', () => {
  const { a, t, root, sc, env } = setup();
  const aBefore = JSON.stringify(a.attrs), tBefore = JSON.stringify(t.attrs);
  const res = releaseEnvelope(sc, env);
  assert.equal(res.length, 3);
  assert.deepEqual(root.children.map((n) => n.id), ['below', 'a', 't', res[2].id, 'above']);
  assert.equal(JSON.stringify(a.attrs), aBefore); assert.equal(JSON.stringify(t.attrs), tBefore);
  assert.equal(res[2].localName, 'path'); assert.equal(res[2].getAttribute('fill'), RELEASE_FILL);
  assert.match(res[2].getAttribute('d'), /^M/);
  // H6: no hidden leftovers.
  assert.ok(!allNodes(root).some((n) => n.getAttribute('display') === 'none' || Object.keys(n.attrs).some((k) => k.startsWith('data-visteras-envelope'))));
  // Wrapped (multi-parent) + moved envelope: transforms fold into the children.
  const x = tree('rect', { id: 'x', width: '5' }), y = tree('rect', { id: 'y', width: '5', transform: 'translate(1 2)' });
  const l1 = tree('g', {}, [x]), l2 = tree('g', {}, [y]); tree('svg', {}, [l1, l2]);
  const sc2 = canvas([x, y]); const e2 = makeEnvelope(sc2, [x, y]);
  const { src } = readEnvelope(e2);
  const wrap = tree('g', { 'data-visteras-envelope-wrap': '1', transform: 'matrix(1 0 0 1 10 0)' }); src.appendChild(wrap); wrap.appendChild(y);
  e2.setAttribute('transform', 'translate(100 0)');
  releaseEnvelope(sc2, e2);
  assert.equal(y.getAttribute('transform'), 'matrix(1 0 0 1 111 2)');
  assert.equal(x.getAttribute('transform'), 'matrix(1 0 0 1 100 0)');
  sc2.undo();
  assert.equal(y.parentNode, wrap); assert.equal(y.getAttribute('transform'), 'translate(1 2)'); assert.equal(x.getAttribute('transform'), null);
});

test('AT9 Edit Contents on text, change the string, Edit Envelope → output updates', () => {
  const { t, sc, env } = setup();
  // The fake tree has no text nodes: add a minimal one that survives clones.
  const textNode = (value) => ({ nodeType: 3, nodeValue: value, attrs: {}, attributes: [], children: [], parentNode: null,
    hasAttribute: () => false, getAttribute: () => null, setAttribute() {}, removeAttribute() {}, querySelectorAll: () => [], remove() {},
    get id() { return ''; }, cloneNode() { return textNode(this.nodeValue); } });
  t.appendChild(textNode('Hi'));
  assert.ok(isEnvelopeSource(t));
  editContents(sc, env);
  assert.equal(env.getAttribute(EDITING), '1');
  assert.equal(isEnvelopeSource(t), false, 'contents are editable (H1–H3 lifted only for this envelope)');
  const hash = envelopeHash(env);
  t.children[0].nodeValue = 'Hello';
  assert.notEqual(envelopeHash(env), hash);
  editEnvelope(sc, env);
  assert.equal(env.hasAttribute(EDITING), false);
  const outText = readEnvelope(env).out.querySelectorAll('*').find((n) => n.localName === 'text');
  assert.equal(outText.children[0].nodeValue, 'Hello');
  assert.ok(isEnvelopeSource(t));
});

test('Edit Contents flag does not change the content hash (no re-render just for toggling)', () => {
  const { sc, env } = setup();
  const h = envelopeHash(env);
  readEnvelope(env).src.removeAttribute('display');
  assert.equal(envelopeHash(env), h);
});

test('wiring: menu actions, Edit label toggles, isolation exit, CSS swap, Object ▸ Expand delegates', () => {
  const src = read('../js/visteras-envelope.js');
  assert.match(src, /releaseEnvelope\(sc, el\)/);
  assert.match(src, /ensureEnvelopeRendered\(sc, el\)\.finally/);
  assert.match(src, /editing \? 'Edit Envelope' : 'Edit Contents'/);
  assert.match(src, /event === 'contextset'/);
  assert.match(src, /display:none!important/);
  const expand = read('../js/visteras-expand.js');
  assert.match(expand, /if \(isEnvelope\(el\)\) return true;/);
  assert.match(expand, /expandEnvelope\(sc, env, \{ batch \}\)/);
  assert.match(read('../index.html'), /visteras-expand\.js\?v=envelope-8/);
  assert.ok(stripEnvelopeAttrs(tree('g', { 'data-visteras-envelope-x': '1', id: 'k' })).attrs.id === 'k');
  assert.equal(sweepLocalClips(tree('g', {}, [tree('defs', {}, [tree('clipPath', { id: 'z' })])])).children.length, 0);
});
