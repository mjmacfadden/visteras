import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../js/visteras-transform-panel.js',import.meta.url),'utf8');
const {referencePosition,dimensionScale}=await import('../js/visteras-transform-panel.js');
test('Nine reference points track document bounds',()=>{
 const b={x:10,y:20,width:100,height:60};
 assert.deepEqual(referencePosition(b,{x:0,y:0}),{x:10,y:20});
 assert.deepEqual(referencePosition(b,{x:.5,y:.5}),{x:60,y:50});
 assert.deepEqual(referencePosition(b,{x:1,y:1}),{x:110,y:80});
});
test('Dimension edits preserve proportions only when locked',()=>{
 const b={width:100,height:50};
 assert.deepEqual(dimensionScale(b,'w',200,false),{sx:2,sy:1});
 assert.deepEqual(dimensionScale(b,'w',200,true),{sx:2,sy:2});
 assert.deepEqual(dimensionScale(b,'h',25,true),{sx:.5,sy:.5});
});
