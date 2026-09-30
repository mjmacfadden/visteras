import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prettyShapeName, shapeViewBox, shapeThumbMarkup, pickInitial } from '../js/visteras-shape-picker.js';

const here = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, here), 'utf8');

test('shape names are humanised like Studio labels', () => {
  assert.equal(prettyShapeName('dialog_balloon_1'), 'Dialog balloon 1');
  assert.equal(prettyShapeName('heart'), 'Heart');
  assert.equal(prettyShapeName(''), '');
});

test('thumbnail framing and markup match the old explorer framing, in UI grey', () => {
  assert.equal(shapeViewBox(300), '-15 -15 330 330');
  const outline = shapeThumbMarkup('m0,0l10,10z', { size: 300, fill: false, px: 24 });
  assert.match(outline, /viewBox="-15 -15 330 330"/);
  assert.match(outline, /fill="none" stroke="#cccccc" stroke-width="10"/);
  const filled = shapeThumbMarkup('m0,0"<>', { size: 300, fill: true, px: 16 });
  assert.match(filled, /width="16" height="16"/);
  assert.match(filled, /fill="#cccccc"/);
  assert.ok(!filled.includes('"<>'), 'path data is escaped');
});

test('saved shape is restored only when its category and key still exist', () => {
  const cats = ['basic', 'animal'];
  assert.deepEqual(pickInitial(null, cats, null), { cat: 'basic', shape: null });
  assert.deepEqual(pickInitial({ cat: 'animal', shape: 'camel' }, cats, { camel: 'm', cat: 'm' }), { cat: 'animal', shape: 'camel' });
  assert.deepEqual(pickInitial({ cat: 'animal', shape: 'gone' }, cats, { camel: 'm' }), { cat: 'animal', shape: null });
  assert.deepEqual(pickInitial({ cat: 'nope', shape: 'x' }, cats, null), { cat: 'basic', shape: null });
});

test('toolbar template: one shape slot, Line in its own slot with line.svg', () => {
  const editor = read('Editor.js');
  const tpl = editor.slice(editor.indexOf('_z = "<div id=\\"tools_left\\">'), editor.indexOf('</div>";', editor.indexOf('_z = "<div id=\\"tools_left\\">')));
  const rectFly = tpl.slice(tpl.indexOf('<se-flyingbutton id=\\"tools_rect\\"'), tpl.indexOf('</se-flyingbutton>', tpl.indexOf('tools_rect')));
  const ids = [...rectFly.matchAll(/se-button id=\\"(\w+)\\"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['tool_rect', 'tool_roundrect', 'tool_ellipse']);
  assert.ok(!tpl.includes('tools_ellipse'), 'separate ellipse flyout removed');
  assert.match(tpl, /id=\\"tool_line\\"[^>]*src=\\"line\.svg/);
  assert.ok(!/tool_line\\"[^>]*src=\\"pen\.svg/.test(tpl), 'Line no longer uses the old pen.svg');
  assert.ok(tpl.indexOf('tool_line') < tpl.indexOf('tools_rect') && !rectFly.includes('tool_line'));
  assert.match(tpl, /id=\\"tools_legacy_shapes\\" hidden/);
});

test('flyout mechanism: hold, Alt-click cycle, right-click, remembered slot', () => {
  const editor = read('Editor.js');
  const cls = editor.slice(editor.indexOf('customElements.define("se-button"'), editor.indexOf('customElements.define("se-flyingbutton"'));
  for (const needle of ['cycleSlot()', 'setActiveSlot(el', 'restoreActiveSlot()', 'openMenu()', '"pointerdown"', '}, 300);', 'e.altKey', '"contextmenu"', 'visteras_vector_flyout_', '"draggable", "false"']) {
    assert.ok(cls.includes(needle), `se-flyingbutton has ${needle}`);
  }
  assert.match(editor, /closest\("se-flyingbutton"\)\.setActiveSlot\?\.\(vz\(e\)\)/, 'updateLeftPanel syncs the slot icon (shortcuts, mode changes)');
  assert.match(editor, /t === "rect" && this\.svgCanvas\.__visterasRoundRect \? "roundrect"/);
  assert.match(editor, /\.js\?v=tool-flyouts-1`/, 'extension imports are cache-busted');
});

test('extensions join the shape slot: Polygon, Star, then Shape library last', () => {
  const poly = read('extensions/ext-polystar/ext-polystar.js');
  assert.ok(poly.indexOf('mk("tool_polygon"') < poly.indexOf('mk("tool_star"'));
  assert.match(poly, /shapeFlyout\.insertBefore\(polygonBtn, lib\)/);
  const shapes = read('extensions/ext-shapes/ext-shapes.js');
  assert.match(shapes, /createElement\("se-button"\)[\s\S]*b\.id = "tool_shapelib"[\s\S]*shapeFlyout\.append\(b\)/);
  assert.match(shapes, /if \(!currentD\) return;/);
});
