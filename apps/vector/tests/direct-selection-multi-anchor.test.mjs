import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { moveAnchors } from '../js/visteras-anchor-model.js';

const source = readFileSync(new URL('../js/visteras-direct-selection.js', import.meta.url), 'utf8');
function begin({ grip = true, selected = true, shift = false } = {}) {
  const first = { el: {}, selected: new Set([0]) };
  const second = { el: {}, selected: new Set(selected ? [0] : []) };
  const context = vm.createContext({ records: [first, second], ownGrip: grip,
    e: { shiftKey: shift, target: { getAttribute: name => name === 'data-direct-record' ? '1' : name === 'data-direct-anchor' ? '0' : null } },
    snapCandidate: { el: second.el, anchorIndex: 0 }, artwork: second.el,
    prepare: () => second, position: () => ({x:0,y:0}), schedule() {}, gesture: null });
  vm.runInContext(`
    function keepOnly(rec) { records = records.filter(r => r === rec); }
    function clearPoints() { for (const rec of records) rec.selected.clear(); }
    function snapshot() { return records.map(rec => ({ rec })); }
    function press() {
      ${source.slice(source.indexOf('    if (ownGrip) {'), source.indexOf('    } else if (artwork) {', source.indexOf('    if (ownGrip) {')))}
      }
    }
    press();
  `, context);
  return { context, first, second };
}

for (const grip of [true, false]) {
  test(`dragging a selected anchor preserves other objects (${grip ? 'grip' : 'snap target'})`, () => {
    const { context, first, second } = begin({grip});
    assert.equal(context.records.length, 2);
    assert.equal(context.gesture.before.length, 2);
    assert.equal(first.selected.has(0), true);
    assert.equal(second.selected.has(0), true);
  });
  test(`a new unselected anchor replaces selection (${grip ? 'grip' : 'snap target'})`, () => {
    const { context, second } = begin({grip, selected:false});
    assert.equal(context.records.length, 1);
    assert.equal(context.records[0], second);
  });
  test(`Shift adds a second object's anchor (${grip ? 'grip' : 'snap target'})`, () => {
    const { context, first, second } = begin({grip, selected:false, shift:true});
    assert.equal(context.records.length, 2);
    assert.equal(first.selected.has(0), true);
    assert.equal(second.selected.has(0), true);
  });
}

test('the drag moves selected anchors in both objects, preserving unselected anchors', () => {
  const { context } = begin();
  context.moveAnchors = moveAnchors;
  context.point = (x,y,m) => ({x:x*m.scale,y:y*m.scale});
  context.write = (item, segments) => { item.result = segments; };
  const items = context.gesture.before;
  for (let i=0;i<items.length;i++) {
    items[i].segments = [{type:2,x:10,y:20},{type:4,x:30,y:40}];
    items[i].inverse = {scale:i+1};
  }
  context.items = items;
  vm.runInContext(source.slice(source.indexOf('  function move(before, dx, dy) {'), source.indexOf('  function finish(',source.indexOf('  function move(before, dx, dy) {'))) + '\nmove(items, 5, 7);', context);
  assert.equal(items[0].result[0].x,15); assert.equal(items[0].result[0].y,27);
  assert.equal(items[1].result[0].x,20); assert.equal(items[1].result[0].y,34);
  assert.equal(items[0].result[1].x,30); assert.equal(items[1].result[1].x,30);
});
