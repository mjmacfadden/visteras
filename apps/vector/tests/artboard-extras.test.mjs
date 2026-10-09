import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { artboardSizePresets, presetToPixels, rearrangeArtboards, parseClipboardBuffer, pasteOffsets, foldHistorySince } from '../js/visteras-artboard-extras.js';

test('Artboard size presets include print Letter–A5 and social IG/X/FB/YT/LI', () => {
  const { print, social } = artboardSizePresets();
  const pnames = print.map((p) => p.name);
  for (const n of ['Letter', 'Legal', 'Tabloid', 'A3', 'A4', 'A5']) {
    assert.ok(pnames.includes(n), n);
  }
  const sids = social.map((p) => p.id);
  for (const id of ['social_ig_post', 'social_ig_story', 'social_x_post', 'social_fb_cover', 'social_yt_thumb', 'social_li_post']) {
    assert.ok(sids.includes(id), id);
  }
  const letter = print.find((p) => p.name === 'Letter');
  const px = presetToPixels(letter);
  assert.equal(px.width, Math.round(8.5 * 96));
  assert.equal(px.height, Math.round(11 * 96));
});

test('Rearrange All: grid by row packs left-to-right then down', () => {
  const boards = [
    { id: 'a', x: 0, y: 0, width: 100, height: 50 },
    { id: 'b', x: 0, y: 0, width: 80, height: 60 },
    { id: 'c', x: 0, y: 0, width: 90, height: 40 },
  ];
  const out = rearrangeArtboards(boards, { layout: 'row', columns: 2, spacing: 10 });
  assert.deepEqual([out[0].x, out[0].y], [0, 0]);
  assert.deepEqual([out[1].x, out[1].y], [110, 0]); // 100 + 10
  assert.equal(out[2].y, 70); // max(50,60)+10
  assert.equal(out[2].x, 0);
});

test('Rearrange All: grid by column fills down then across', () => {
  const boards = [
    { id: 'a', x: 0, y: 0, width: 100, height: 40 },
    { id: 'b', x: 0, y: 0, width: 80, height: 50 },
    { id: 'c', x: 0, y: 0, width: 90, height: 30 },
  ];
  const out = rearrangeArtboards(boards, { layout: 'column', columns: 2, spacing: 10 });
  assert.deepEqual([out[0].x, out[0].y], [0, 0]);
  assert.equal(out[1].x, 0);
  assert.equal(out[1].y, 50); // 40 + 10
  assert.ok(out[2].x > 0);
});

test('Artboard extras wiring: menu, shortcut, panel hooks', () => {
  const src = fs.readFileSync(new URL('../js/visteras-artboard-extras.js', import.meta.url), 'utf8');
  assert.match(src, /action_paste_on_all_artboards/);
  assert.match(src, /KeyV/);
  assert.match(src, /Rearrange All Artboards/);
  assert.match(src, /vab_size_preset/);
  assert.match(src, /\['up', 'Move artboard up/);
  assert.match(src, /dataset\.act = act/);
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /mountArtboardExtras\(svgEditor\)/);
});

test('Artboard extras: panel buttons re-inject if the artboards pane is rebuilt', () => {
  const src = fs.readFileSync(new URL('../js/visteras-artboard-extras.js', import.meta.url), 'utf8');
  assert.match(src, /if \(actions && !actions\.querySelector\('\[data-act="up"\]'\)\)/);
  assert.match(src, /\}\)\.observe\(pane, \{ childList: true \}\);/);
});

/* ── Paste on All Artboards pastes the clipboard (Illustrator), not the selection ── */

test('parseClipboardBuffer: the ⌘V buffer, or null when empty/invalid', () => {
  assert.equal(parseClipboardBuffer(null), null);
  assert.equal(parseClipboardBuffer(''), null);
  assert.equal(parseClipboardBuffer('[]'), null);
  assert.equal(parseClipboardBuffer('{oops'), null);
  assert.deepEqual(parseClipboardBuffer('[{"element":"rect"}]'), [{ element: 'rect' }]);
});

test('pasteOffsets: one copy per artboard at the source position relative to its artboard', () => {
  const boards = [
    { id: 'a', x: 0, y: 0, width: 100, height: 100 },
    { id: 'b', x: 300, y: 50, width: 200, height: 200 },
    { id: 'c', x: 0, y: 500, width: 100, height: 100 },
  ];
  // copied from artboard b
  const { source, offsets } = pasteOffsets({ x: 310, y: 60, width: 20, height: 20 }, boards, 'a');
  assert.equal(source.id, 'b');
  assert.deepEqual(offsets.map((o) => [o.board.id, o.dx, o.dy]), [['a', -300, -50], ['b', 0, 0], ['c', -300, 450]]);
  // off every artboard → active artboard is the reference
  assert.equal(pasteOffsets({ x: 5000, y: 5000, width: 1, height: 1 }, boards, 'c').source.id, 'c');
  assert.equal(pasteOffsets(null, boards, null).source.id, 'a');
});

test('foldHistorySince: every paste + move lands as one "Paste on All Artboards" step', () => {
  class Batch { constructor(t) { this.text = t; this.subs = []; } addSubCommand(c) { this.subs.push(c); } }
  const mgr = { undoStack: ['x', 'p1', 'm1', 'p2', 'redo'], undoStackPointer: 4 };
  assert.equal(foldHistorySince(mgr, 1, Batch, 'Paste on All Artboards'), true);
  assert.equal(mgr.undoStackPointer, 2);
  assert.deepEqual(mgr.undoStack[1].subs, ['p1', 'm1', 'p2']);
  assert.equal(mgr.undoStack[1].text, 'Paste on All Artboards');
});

test('Paste on All Artboards reads the clipboard, never the selection', () => {
  const src = fs.readFileSync(new URL('../js/visteras-artboard-extras.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('async function pasteOnAllArtboards()'), src.indexOf("const editList = document.querySelector('#menu_edit"));
  assert.match(body, /parseClipboardBuffer\(sessionStorage\.getItem\(clipId\)\)/);
  assert.match(body, /sc\.pasteElements\('in_place'\)/, 'internal buffer via the same path as ⌘V (hrefs to symbols stay linked)');
  assert.match(body, /window\.__visterasReadSystemSvg/, 'system clipboard fallback via the clipboard bridge');
  assert.doesNotMatch(body.slice(0, body.indexOf('function boundsOf')), /getSelectedElements/, 'the current selection is not the source');
  const bridge = fs.readFileSync(new URL('../js/visteras-clipboard-bridge.js', import.meta.url), 'utf8');
  assert.match(bridge, /window\.__visterasReadSystemSvg = async \(\) =>/);
});
