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

import { createSublayer, isSublayer, rowPath, topmostSelected, selectableArtwork } from '../js/visteras-sublayers.js';
function attach(parent, child) { parent.children.push(child); child.parentNode = parent; return child; }
test('sublayer creation writes the serializable marker and title', () => {
  const doc = { createElementNS(ns, tag) { const el = fakeEl(tag); el.appendChild = child => attach(el, child); return el; } };
  const layer = createSublayer(doc, 'Details', 'svg_12');
  assert.equal(isSublayer(layer), true); assert.equal(layer.id, 'svg_12'); assert.equal(displayName(layer), 'Details');
});
test('Locate follows nested ancestors and chooses the topmost selected artwork', () => {
  const root = fakeEl('svg'), lower = attach(root, fakeEl('g', { class:'layer' }));
  const sub = attach(lower, fakeEl('g', {'data-visteras-sublayer':'1'})), rect = attach(sub, fakeEl('rect'));
  const upper = attach(root, fakeEl('g', { class:'layer' })), ellipse = attach(upper, fakeEl('ellipse'));
  assert.deepEqual(rowPath(rect, root), [lower, sub, rect]);
  assert.equal(topmostSelected([ellipse, rect], root), ellipse);
  assert.equal(topmostSelected([rect, ellipse], root), ellipse);
});
test('Select All and marquee flatten sublayers, preserving normal groups and skipping hidden artwork', () => {
  const sub = fakeEl('g', {'data-visteras-sublayer':'1'}), rect = attach(sub, fakeEl('rect'));
  attach(sub, fakeEl('title'));
  const group = fakeEl('g'), hidden = fakeEl('g', {'data-visteras-sublayer':'1',display:'none'});
  attach(hidden, fakeEl('ellipse'));
  assert.deepEqual(selectableArtwork([sub, group, hidden]), [rect, group]);
});
test('sublayers are canvas boundaries and Locate has button and menu entry', () => {
  const core = fs.readFileSync(new URL('../Editor.js', import.meta.url), 'utf8');
  assert.match(core, /Visteras: sublayers are selection boundaries/);
  assert.match(core, /!t.parentNode.hasAttribute\?\.\('data-visteras-sublayer'\)/);
  assert.match(core, /Visteras: marquee traverses sublayers/);
  const workspace = fs.readFileSync(new URL('../js/visteras-workspace.js', import.meta.url), 'utf8');
  assert.match(workspace, /'layer_locate', 'Locate Object'/);
  assert.match(workspace, /\['Locate Object', locateObject, 'locate_object'\]/);
  assert.match(workspace, /__visterasDock\?\.open\('layers'\)/);
  assert.match(workspace, /new sc.history.MoveElementCommand\(moved, oldNext, oldParent/);
});

import vm from 'node:vm';
test('actual core hit-test selects a child within nested sublayers, keeping ordinary groups atomic', () => {
  const code = fs.readFileSync(new URL('../Editor.js', import.meta.url), 'utf8');
  const start = code.indexOf('oy = (e) => {'), end = code.indexOf('\n\t}, sy =', start);
  const root = fakeEl('svg'), layer = attach(root, fakeEl('g', {class:'layer'}));
  const sub = attach(layer, fakeEl('g', {'data-visteras-sublayer':'1'}));
  const rect = attach(sub, fakeEl('rect')), group = attach(sub, fakeEl('g')), path = attach(group, fakeEl('path'));
  for (const el of [root, layer, sub, rect, group, path]) { el.isSameNode = other => other === el; el.namespaceURI = 'svg'; }
  let active = 'Other';
  const drawing = { getCurrentLayer: () => layer, getCurrentLayerName: () => active, setCurrentLayer: name => { active = name; } };
  const context = { Eh: {}, nv: { isLayer: el => el === layer }, Wh: () => false, fv: () => 'Art', ny: {
    getCurrentDrawing: () => drawing, getSvgRoot: () => root, getDOMContainer: () => ({}), getSvgContent: () => root, getCurrentGroup: () => null,
  } };
  vm.runInNewContext('const ' + code.slice(start, end) + '\n}; this.hit = oy;', context);
  assert.equal(context.hit({ target: rect }), rect); assert.equal(active, 'Art');
  assert.equal(context.hit({ target: path }), group);
});
