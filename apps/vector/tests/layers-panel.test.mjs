import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fakeEl, fakeCanvas } from './helpers/fake-svg.mjs';
import { cleanName, defaultObjectName, displayName, nextLayerName, renameObject } from '../js/visteras-layer-names.js';

for (const [tag, label] of [['rect','<Rectangle>'],['path','<Path>'],['ellipse','<Ellipse>'],['circle','<Ellipse>'],['line','<Line>'],['polygon','<Polygon>'],['g','<Group>'],['image','<Image>']]) {
  test(`unnamed ${tag} shows ${label}`, () => assert.equal(defaultObjectName(fakeEl(tag)), label));
}
test('text names truncate and compound/clip groups use markers', () => {
  const text = fakeEl('text'); text.textContent = 'A'.repeat(50);
  assert.equal(defaultObjectName(text), 'A'.repeat(30));
  assert.equal(defaultObjectName(fakeEl('path', {'data-visteras-compound':'1'})), '<Compound Path>');
  assert.equal(defaultObjectName(fakeEl('g', {'data-visteras-clip':'clip_1'})), '<Clip Group>');
});
test('display names prefer stored names, then accessible names and titles; never expose ids', () => {
  const el = fakeEl('rect', { id:'svg_1', 'data-visteras-name':'  Logo  box ', 'aria-label':'Accessible' });
  assert.equal(displayName(el), 'Logo box');
  el.removeAttribute('data-visteras-name'); assert.equal(displayName(el), 'Accessible');
  el.removeAttribute('aria-label'); assert.equal(displayName(el), '<Rectangle>');
  const title = fakeEl('title'); title.textContent = 'Art'; el.children.push(title);
  assert.equal(displayName(el), 'Art');
});
test('clean names collapse whitespace; blank clears the name', () => {
  assert.equal(cleanName('  Logo\n  box  '), 'Logo box'); assert.equal(cleanName(' \t\n'), '');
});
test('next layer name follows the highest numeric name', () => {
  assert.equal(nextLayerName(['Layer 1','Layer 3']), 'Layer 4');
  assert.equal(nextLayerName(['Art']), 'Layer 1');
});
test('object rename is one undoable attribute change; clearing restores default', () => {
  const el = fakeEl('rect'), sc = fakeCanvas();
  renameObject(sc, el, ' Logo box '); assert.equal(sc.log.length, 1); assert.equal(displayName(el), 'Logo box');
  sc.undo(); assert.equal(displayName(el), '<Rectangle>'); sc.redo(); assert.equal(displayName(el), 'Logo box');
  renameObject(sc, el, '  '); assert.equal(displayName(el), '<Rectangle>');
});
test('core layer commands use inline rename and immediate create, without browser prompts', () => {
  const core = fs.readFileSync(new URL('../Editor.js', import.meta.url), 'utf8');
  const panel = core.slice(core.indexOf('//#region src/editor/panels/LayersPanel.js'), core.indexOf('//#region src/editor/MainMenu.js'));
  assert.doesNotMatch(panel.match(/newLayer\(\) \{[\s\S]*?\n\t\}/)[0], /prompt\(/);
  assert.doesNotMatch(panel.match(/layerRename\(\) \{[\s\S]*?\n\t\}/)[0], /prompt\(/);
  const workspace = fs.readFileSync(new URL('../js/visteras-workspace.js', import.meta.url), 'utf8');
  assert.match(workspace, /addEventListener\('dblclick'/);
  assert.match(workspace, /aria-label="Layer Options"/);
  assert.match(workspace, /renameCurrentLayer\(next\)/);
});
