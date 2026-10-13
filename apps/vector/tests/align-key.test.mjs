import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {alignToKey,distributeSpacing} from '../js/visteras-align-key.js';
const boxes=[{x:0,y:10,width:20,height:30},{x:100,y:50,width:40,height:60},{x:200,y:30,width:30,height:40}];
for(const dir of ['left','center','right','top','middle','bottom'])test(`Key alignment: ${dir} keeps key fixed`,()=>{
  const copy=JSON.stringify(boxes),ds=alignToKey(boxes,1,dir);
  assert.deepEqual(ds[1],{dx:0,dy:0});
  const axis=['left','center','right'].includes(dir)?'x':'y',size=axis==='x'?'width':'height',prop=axis==='x'?'dx':'dy',f={left:0,center:.5,right:1,top:0,middle:.5,bottom:1}[dir];
  for(let i=0;i<boxes.length;i++)assert.equal(boxes[i][axis]+ds[i][prop]+boxes[i][size]*f,boxes[1][axis]+boxes[1][size]*f);
  assert.equal(JSON.stringify(boxes),copy);
});
test('Spacing: explicit gap moves outward from middle key',()=>{
  assert.deepEqual(distributeSpacing(boxes,'x',10,1),[{dx:70,dy:0},{dx:0,dy:0},{dx:-50,dy:0}]);
});
test('Spacing: Auto fixes outer boxes and spreads interior objects',()=>{
  const ds=distributeSpacing(boxes,'x');assert.deepEqual(ds,[{dx:0,dy:0},{dx:-10,dy:0},{dx:0,dy:0}]);
  assert.equal(boxes[1].x+ds[1].dx-20,boxes[2].x-(boxes[1].x+ds[1].dx+40));
});
test('Spacing: original input order survives sorting; vertical works',()=>{
  const b=[{x:0,y:100,width:10,height:20},{x:0,y:0,width:10,height:10},{x:0,y:60,width:10,height:10}];
  assert.deepEqual(distributeSpacing(b,'y',10,0),[{dx:0,dy:0},{dx:0,dy:60},{dx:0,dy:20}]);
  assert.deepEqual(distributeSpacing([boxes[2],boxes[0],boxes[1]],'x'),[{dx:0,dy:0},{dx:0,dy:0},{dx:-10,dy:0}]);
});
test('Key/spacing controls hook selection, batch history and numeric fields',()=>{
  const editor=fs.readFileSync(new URL('../Editor.js',import.meta.url),'utf8');
  const ui=fs.readFileSync(new URL('../js/visteras-align-key-ui.js',import.meta.url),'utf8');
  const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(editor.includes('selected::largest::smallest::page::key'));
  assert.ok(editor.includes('__visterasOnClickSelected?.(p)'));
  assert.ok(ui.includes("new sc.history.BatchCommand(label)")&&ui.includes('bindNumericField'));
  assert.ok(ui.includes('Vertical Distribute Space')&&ui.includes('Horizontal Distribute Space'));
  assert.ok(index.includes("rel !== 'key' || !window.__visterasAlignKey?.align(dir)"));
  assert.ok(index.indexOf('id="action_prefs"') < index.indexOf('<!-- Object Menu -->'));
  assert.ok(ui.includes('visteras:unit-changed'));
});
