import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { artboardSizePresets, presetToPixels, rearrangeArtboards } from '../js/visteras-artboard-extras.js';

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
