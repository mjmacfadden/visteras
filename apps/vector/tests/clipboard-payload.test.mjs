import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySelection, planClipboardTypes, clipboardSupports, buildClipboardItems, intersectRect, imagePngSize, collectUrlRefs, isTextCopyContext, PNG, SVG, TEXT } from '../js/visteras-clipboard-payload.js';

const el = (nodeName, { images = false } = {}) => ({ nodeName, querySelector: (s) => (s === 'image' && images ? {} : null) });

test('classify: one raster image, vector, mixed, empty', () => {
  assert.equal(classifySelection([el('image')]), 'image');
  assert.equal(classifySelection([el('path')]), 'vector');
  assert.equal(classifySelection([el('rect'), el('g')]), 'vector');
  assert.equal(classifySelection([el('image'), el('path')]), 'mixed');
  assert.equal(classifySelection([el('image'), el('image')]), 'mixed');
  assert.equal(classifySelection([el('g', { images: true })]), 'mixed');
  assert.equal(classifySelection([]), 'empty');
  assert.equal(classifySelection([null, undefined]), 'empty');
  assert.equal(classifySelection(undefined), 'empty');
});

test('plan: image → PNG only; vector/mixed → PNG + text/plain SVG (+ image/svg+xml when supported)', () => {
  assert.deepEqual(planClipboardTypes('image'), [PNG]);
  assert.deepEqual(planClipboardTypes('vector', () => true), [PNG, TEXT, SVG]);
  assert.deepEqual(planClipboardTypes('mixed', (t) => t !== SVG), [PNG, TEXT]);
  assert.deepEqual(planClipboardTypes('vector', () => { throw new Error('x'); }), [PNG, TEXT]);
  assert.deepEqual(planClipboardTypes('empty'), []);
});

test('supports: uses ClipboardItem.supports, else PNG/text only', () => {
  const s = clipboardSupports({ supports: (t) => t === SVG || t === PNG });
  assert.equal(s(SVG), true); assert.equal(s(TEXT), false);
  const legacy = clipboardSupports({});
  assert.equal(legacy(PNG), true); assert.equal(legacy(TEXT), true); assert.equal(legacy(SVG), false);
  assert.equal(clipboardSupports(null)(SVG), false);
  assert.equal(clipboardSupports({ supports() { throw new Error('x'); } })(PNG), false);
});

test('build: every value is a Promise<Blob>; PNG producer is deferred; SVG text blobs typed', async () => {
  let called = 0;
  const png = async () => { called++; return new Blob([new Uint8Array([137, 80, 78, 71])], { type: PNG }); };
  const v = buildClipboardItems({ kind: 'vector', svgText: '<svg/>', png, supports: () => true });
  assert.deepEqual(v.types, [PNG, TEXT, SVG]);
  for (const t of v.types) assert.ok(v.items[t] instanceof Promise, t);
  assert.equal(called, 0, 'render starts after the item is built (sync in the gesture)');
  const blobs = Object.fromEntries(await Promise.all(v.types.map(async (t) => [t, await v.items[t]])));
  assert.equal(called, 1);
  assert.equal(blobs[PNG].type, PNG); assert.equal(blobs[PNG].size, 4);
  assert.equal(blobs[TEXT].type, TEXT); assert.equal(await blobs[TEXT].text(), '<svg/>');
  assert.equal(blobs[SVG].type, SVG);
  const i = buildClipboardItems({ kind: 'image', svgText: '<svg/>', png, supports: () => true });
  assert.deepEqual(i.types, [PNG]); assert.deepEqual(Object.keys(i.items), [PNG]);
  const noText = buildClipboardItems({ kind: 'vector', svgText: null, png, supports: () => true });
  assert.deepEqual(noText.types, [PNG]);
  // A failing render rejects only the PNG promise.
  const bad = buildClipboardItems({ kind: 'mixed', svgText: '<svg/>', png: () => { throw new Error('render'); }, supports: () => false });
  await assert.rejects(bad.items[PNG], /render/);
  assert.equal(await (await bad.items[TEXT]).text(), '<svg/>');
});

test('image PNG size: natural resolution; crop keeps natural pixel density', () => {
  assert.deepEqual(imagePngSize({ naturalWidth: 1200, naturalHeight: 700 }, { x: 0, y: 0, width: 600, height: 350 }), { width: 1200, height: 700, scale: 1, crop: null });
  const c = imagePngSize({ naturalWidth: 1200, naturalHeight: 700 }, { x: 100, y: 100, width: 600, height: 350 }, { x: 150, y: 120, width: 300, height: 100 });
  assert.equal(c.width, 600); assert.equal(c.height, 200); assert.equal(c.scale, 2);
  // Letterboxed box (meet): density from the fitting axis.
  const m = imagePngSize({ naturalWidth: 400, naturalHeight: 100 }, { x: 0, y: 0, width: 200, height: 200 }, { x: 0, y: 0, width: 100, height: 50 });
  assert.equal(m.width, 200); assert.equal(m.height, 100);
  assert.deepEqual(imagePngSize({ naturalWidth: 0, naturalHeight: 0 }, null), { width: 1, height: 1, scale: 1, crop: null });
});

test('intersectRect', () => {
  assert.deepEqual(intersectRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 }), { x: 5, y: 5, width: 5, height: 5 });
  assert.equal(intersectRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 0, width: 5, height: 5 }), null);
  assert.deepEqual(intersectRect({ x: 1, y: 2, width: 3, height: 4 }, null), { x: 1, y: 2, width: 3, height: 4 });
});

test('collectUrlRefs finds clip/mask/gradient references', () => {
  assert.deepEqual(collectUrlRefs('url(#c1) fill:url("#g2"); mask: url( \'#m3\' )').sort(), ['c1', 'g2', 'm3']);
  assert.deepEqual(collectUrlRefs('none'), []);
  assert.deepEqual(collectUrlRefs(null), []);
});

test('copy never hijacked while typing or with a text selection', () => {
  const doc = (active = { nodeName: 'BODY' }, sel = '') => ({ activeElement: active, getSelection: () => ({ isCollapsed: !sel, toString: () => sel }) });
  const ev = (...path) => ({ composedPath: () => path });
  assert.equal(isTextCopyContext(ev({ nodeName: 'BODY' }), doc()), false);
  assert.equal(isTextCopyContext(ev({ nodeName: 'INPUT' }), doc()), true);
  assert.equal(isTextCopyContext(ev({ nodeName: 'INPUT' }, { nodeName: 'SE-INPUT' }), doc()), true);
  assert.equal(isTextCopyContext(ev({ nodeName: 'DIV', isContentEditable: true }), doc()), true);
  assert.equal(isTextCopyContext(ev({ nodeName: 'BODY' }), doc({ nodeName: 'TEXTAREA' })), true);
  assert.equal(isTextCopyContext(ev({ nodeName: 'BODY' }), doc(undefined, 'some text')), true);
  assert.equal(isTextCopyContext(ev({ nodeName: 'BODY' }), doc(undefined, '   ')), false);
  assert.equal(isTextCopyContext(null, null), false);
});
