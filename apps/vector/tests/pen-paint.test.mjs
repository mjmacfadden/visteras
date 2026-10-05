import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = {};
const { syncPenPaintDefaults } = await import('../js/visteras-color-system.js');
function canvas(paints, selected=[]) {
  return { curShape:{fill:'#aaaaaa',stroke:'#bbbbbb'},curProperties:{fill:'#ff0000'},
    getMode:()=> 'path',getColor:which=>paints[which],getSelectedElements:()=>selected };
}
test('Pen adopts displayed default paints, including none and gradients', () => {
  for (const paints of [{fill:'#123456',stroke:'#abcdef'},{fill:'none',stroke:'url(#ramp)'}]) {
    const sc=canvas(paints); syncPenPaintDefaults({svgCanvas:sc});
    assert.deepEqual(sc.curShape,paints); assert.equal(sc.curProperties,sc.curShape);
  }
});
test('selected-object swatches override stale Pen defaults without repainting the object', () => {
  const attrs={fill:'#112233',stroke:'none'};
  const path={tagName:'path',nodeName:'path',localName:'path',getAttribute:n=>attrs[n]??null,
    hasAttribute:n=>n in attrs,querySelector:()=>null,closest:()=>null};
  const sc=canvas({fill:'#aaaaaa',stroke:'#bbbbbb'},[path]);
  syncPenPaintDefaults({svgCanvas:sc});
  assert.deepEqual(sc.curShape,attrs);
  assert.deepEqual(attrs,{fill:'#112233',stroke:'none'});
});
